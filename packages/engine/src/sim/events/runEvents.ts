import { keyedStream } from "../../engine/random.js";
import { coachesByClub, type AiCoach } from "../coach/aiCoaches.js";
import { humanClubIds, waitingCoachesOf } from "../coach/humanCoaches.js";
import { addDays } from "../dates.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import type { Fixture, GameState, IsoDate, SimPlayer } from "../gameState.js";
import { applyEffects } from "./applyEffects.js";
import { EVENT_BANK } from "./eventBank.js";
import { eventMemoryOf, type Cast, type EventMemory, type EventRecord, type NewsItem, type PendingEvent, type PendingQuestion } from "./eventMemory.js";
import { byCast, type EventScene, type EventType, type PressQuestionType } from "./eventType.js";
import { fillSlots, type Slots } from "./fillSlots.js";

/** An event happened at a club; `asksCoach` when it waits for a human coach's answer as a pop-up. */
export type EventHappened = { type: "eventHappened"; clubId: string; typeId: string; headline: string; asksCoach: boolean };
/**
 * A human coach's club answered an event: the coach himself, or his assistant (`byAssistant`). `topic`
 * is the event's own headline, `answer` the answer's words and `headline` what the paper prints of it.
 * At a press conference `questionsLeft` counts the questions still to come; the event is settled at 0.
 */
export type EventAnswered = { type: "eventAnswered"; clubId: string; typeId: string; choice: number; byAssistant: boolean; topic: string; answer: string; headline: string; questionsLeft: number };
export type EventDayEvent = EventHappened | EventAnswered;

// Events draw from a stream of their own per day and club, so the day's other draws stay as they were.
const EVENT_SALT = 0x5e17e5;
// guess: a human coach's club gets an event about once a week and a half, and sometimes a second one the
// same day, which goes to the newspaper; a Série A club the AI runs gets one about every seven weeks,
// enough to fill the paper without slowing a season down.
const HUMAN_CHANCES = [0.1, 0.03] as const;
const AI_CHANCES = [0.02] as const;
// An event waits for the coach until his club's next match, which the days played on stop at; the
// assistant answers it after that match. guess: off-season, with no match booked, it waits two weeks.
const ANSWER_DAYS_WITHOUT_MATCH = 14;
// guess: the newspaper's archive keeps about five months of stories.
const NEWS_DAYS = 150;
// A press conference's opening question and at most this many follow-ups (press.html: "Pergunta 2 de 3").
const FOLLOW_UPS = 2;

type Resolved = { state: GameState; events: EventDayEvent[] };

// The AI coaches change only on days a club changes coach, so each set of them is looked through once.
const aiCoachesByCoaches = new WeakMap<Record<string, AiCoach>, Map<string, AiCoach>>();

function coachNameOf(state: GameState, clubId: string): string | null {
  if (clubId === state.coachClubId) return state.coachName || null;
  const waiting = waitingCoachesOf(state).find((coach) => coach.clubId === clubId);
  if (waiting) return waiting.name || null;
  const coaches = state.coaches?.coaches;
  if (!coaches) return null;
  let byClub = aiCoachesByCoaches.get(coaches);
  if (!byClub) aiCoachesByCoaches.set(coaches, (byClub = coachesByClub({ coaches })));
  return byClub.get(clubId)?.name ?? null;
}

function assistantAreasOf(state: GameState, clubId: string) {
  if (clubId === state.coachClubId) return state.coach.assistantAreas ?? [];
  return waitingCoachesOf(state).find((coach) => coach.clubId === clubId)?.coach.assistantAreas ?? [];
}

function slotsOf(state: GameState, clubId: string, cast: Cast): Slots {
  const club = state.clubs[clubId];
  const player = cast.playerId ? state.players[cast.playerId] : undefined;
  return {
    club: club?.shortName ?? clubId,
    stadium: club?.stadium ?? "",
    coach: coachNameOf(state, clubId) ?? "o técnico",
    rival: cast.rivalId ? (state.clubs[cast.rivalId]?.shortName ?? cast.rivalId) : "",
    player: player?.name ?? "",
    teammate: cast.teammateId ? (state.players[cast.teammateId]?.name ?? "") : "",
    age: player ? String(player.age) : "",
    position: player ? POSITION_WORDS[player.group] : "",
  };
}

const POSITION_WORDS: Record<SimPlayer["group"], string> = { GK: "goleiro", DEF: "defensor", MID: "meia", ATT: "atacante" };

// The clubs change only between seasons, so each set of clubs is looked through once.
const serieAByClubs = new WeakMap<GameState["clubs"], readonly string[]>();

function serieAOf(clubs: GameState["clubs"]): readonly string[] {
  const known = serieAByClubs.get(clubs);
  if (known) return known;
  const ids = Object.values(clubs).flatMap((club) => (club.division === "A" ? [club.id] : []));
  serieAByClubs.set(clubs, ids);
  return ids;
}

/** The memory with a record and a story added, stories older than the archive dropped. */
function remember(memory: EventMemory, record: EventRecord, story: NewsItem | null): EventMemory {
  const oldest = story ? addDays(story.date, -NEWS_DAYS) : "";
  return { ...memory, log: [...memory.log, record], news: story ? [...memory.news.filter((item) => item.date >= oldest), story] : memory.news };
}

function withMemory(state: GameState, change: (memory: EventMemory) => EventMemory): GameState {
  return { ...state, eventMemory: change(eventMemoryOf(state)) };
}

const castOf = (record: EventRecord): Cast => ({
  ...(record.playerId ? { playerId: record.playerId } : {}),
  ...(record.teammateId ? { teammateId: record.teammateId } : {}),
  ...(record.rivalId ? { rivalId: record.rivalId } : {}),
});

/** A pending event's questions: a press conference's, or its only one. */
const questionsOf = (pending: PendingEvent): PendingQuestion[] => pending.questions ?? [{ id: pending.typeId, ask: pending.body, choices: pending.choices, assistantChoice: pending.assistantChoice }];

/** The headline answer `choice` to question `questionId` of the event makes, if it makes one. */
function newsOf(type: EventType | undefined, questionId: string, choice: number): string | undefined {
  const choices = questionId === type?.id ? type.choices : type?.followUps?.find((question) => question.id === questionId)?.choices;
  return choices?.[choice]?.news;
}

/**
 * The memory and effects of an event settled with `answers`, one per question; the effects of those
 * before `landed` were applied as they were given. The headline its outcome prints: the first answer's
 * that makes one, else the event's own.
 */
function settle(state: GameState, pending: PendingEvent, answers: readonly number[], landed: number, type: EventType | undefined, date: IsoDate): { state: GameState; headline: string } {
  const questions = questionsOf(pending);
  const chosen = questions.map((question, index) => {
    const answer = question.choices[answers[index] ?? -1];
    if (!answer) throw new Error(`event ${pending.typeId} has no answer ${answers[index]} to ${question.id}`);
    return answer;
  });
  const { clubId } = pending;
  const cast = castOf(pending);
  const news = questions.map((question, index) => newsOf(type, question.id, answers[index] ?? -1)).find((headline) => headline !== undefined);
  const headline = news ? fillSlots(news, slotsOf(state, clubId, cast)) : pending.headline;
  const isConference = pending.questions !== undefined;
  const record: EventRecord = { typeId: pending.typeId, date: pending.date, clubId, ...cast, choice: answers.at(-1) ?? 0, ...(isConference ? { questionIds: questions.map((q) => q.id), answers: [...answers] } : {}) };
  const said = (label: string) => label.replace(/[^.!?”]$/, "$&.");
  const body = isConference ? questions.map((question, index) => `${question.ask} ${said(chosen[index]?.label ?? "")}`).join(" ") : `${pending.body} Resposta: ${said(chosen[0]?.label ?? "")}`;
  const topic = pending.topic ?? type?.topic;
  const story: NewsItem = { date, kind: "event", clubIds: [clubId, ...(cast.rivalId ? [cast.rivalId] : [])], headline, body, ...(topic ? { topic } : {}) };
  let next = withMemory(state, (memory) => remember(memory, record, story));
  for (const answer of chosen.slice(landed)) next = applyEffects(next, clubId, cast, answer.effects, date);
  return { state: next, headline };
}

/**
 * Answers the event waiting at `clubId` with answer `choice`, or the assistant's when `choice` is null,
 * on `date` (today, left out). A press conference with questions left lands the answer and waits with
 * the next question; the assistant answers all the questions left. A settled event's effects land and
 * it goes into the memory and the newspaper.
 */
export function answerEvent(state: GameState, clubId: string, choice: number | null, bank: readonly EventType[] = EVENT_BANK, date: IsoDate = state.date): { state: GameState; event: EventAnswered } {
  const pending = eventMemoryOf(state).pending[clubId];
  if (!pending) throw new Error(`no event waits for an answer at ${clubId}`);
  const type = bank.find((own) => own.id === pending.typeId);
  const questions = questionsOf(pending);
  const given = pending.answers ?? [];
  const current = questions[given.length];
  if (!current) throw new Error(`event ${pending.typeId} has no question left`);
  const picked = choice ?? current.assistantChoice;
  const answer = current.choices[picked];
  if (!answer) throw new Error(`event ${pending.typeId} has no answer ${picked}`);
  const answered = (headline: string, questionsLeft: number): EventAnswered => ({
    type: "eventAnswered",
    clubId,
    typeId: pending.typeId,
    choice: picked,
    byAssistant: choice === null,
    topic: pending.headline,
    answer: answer.label,
    headline,
    questionsLeft,
  });
  const next = questions[given.length + 1];
  if (choice !== null && next) {
    const waiting: PendingEvent = { ...pending, answers: [...given, choice], body: next.ask, choices: next.choices, assistantChoice: next.assistantChoice };
    const asked = withMemory(state, (memory) => ({ ...memory, pending: { ...memory.pending, [clubId]: waiting } }));
    const news = newsOf(type, current.id, choice);
    const headline = news ? fillSlots(news, slotsOf(state, clubId, castOf(pending))) : "";
    return { state: applyEffects(asked, clubId, castOf(pending), answer.effects, date), event: answered(headline, questions.length - given.length - 1) };
  }
  const answers = [...given, picked, ...questions.slice(given.length + 1).map((question) => question.assistantChoice)];
  const left = Object.fromEntries(Object.entries(eventMemoryOf(state).pending).filter(([id]) => id !== clubId));
  const settled = settle(withMemory(state, (memory) => ({ ...memory, pending: left })), pending, answers, given.length, type, date);
  return { state: settled.state, event: answered(settled.headline, 0) };
}

/** What the log says about one club, built once for the clubs that draw an event today. */
type Recall = { lastAt: Map<string, IsoDate>; players: Set<string> };

function recallOf(memory: EventMemory): Recall {
  const recall: Recall = { lastAt: new Map(), players: new Set() };
  const pending = Object.values(memory.pending);
  for (const record of [...memory.log, ...pending]) {
    const key = `${record.typeId}:${record.clubId}`;
    const last = recall.lastAt.get(key);
    if (!last || last < record.date) recall.lastAt.set(key, record.date);
    if (record.playerId) recall.players.add(`${record.typeId}:${record.playerId}`);
  }
  return recall;
}

function isAllowed(type: EventType, clubId: string, cast: Cast, date: IsoDate, recall: Recall): boolean {
  const last = recall.lastAt.get(`${type.id}:${clubId}`);
  if (last && last > addDays(date, -type.cooldownDays)) return false;
  if (type.once === "player" && cast.playerId && recall.players.has(`${type.id}:${cast.playerId}`)) return false;
  return true;
}

/** One event drawn for `clubId` today among those its state allows, by weight; null when none is possible. */
function drawEvent(scene: EventScene, recall: Recall, bank: readonly EventType[], random: () => number): { type: EventType; cast: Cast } | null {
  const open: { type: EventType; cast: Cast; weight: number }[] = [];
  for (const type of bank) {
    const cast = type.cast(scene);
    if (!cast || !isAllowed(type, scene.clubId, cast, scene.date, recall)) continue;
    const weight = byCast(type.weight, scene, cast);
    if (weight > 0) open.push({ type, cast, weight });
  }
  let roll = random() * open.reduce((sum, option) => sum + option.weight, 0);
  for (const option of open) {
    roll -= option.weight;
    if (roll < 0) return option;
  }
  return open.at(-1) ?? null;
}

/** The day of the club's next match after `date`, if one is booked. */
function nextMatchDay(state: GameState, clubId: string, date: IsoDate): IsoDate | null {
  let next: IsoDate | null = null;
  for (const fixture of state.fixtures) {
    if (fixture.result || fixture.date <= date || (fixture.homeId !== clubId && fixture.awayId !== clubId)) continue;
    if (!next || fixture.date < next) next = fixture.date;
  }
  return next;
}

/**
 * Up to two of a press conference's follow-up questions that fit the day, drawn in random order; each
 * may add a player or a rival to the cast, never swap one in it. The cast they leave and the questions.
 */
function followUpsFor(scene: EventScene, cast: Cast, followUps: readonly PressQuestionType[], random: () => number): { cast: Cast; asked: PressQuestionType[] } {
  const order = followUps.map((question) => ({ question, key: random() })).sort((a, b) => a.key - b.key);
  let current = cast;
  const asked: PressQuestionType[] = [];
  for (const { question } of order) {
    if (asked.length >= FOLLOW_UPS) break;
    const next = question.cast(scene, current);
    if (!next || (Object.keys(current) as (keyof Cast)[]).some((key) => next[key] !== current[key])) continue;
    current = next;
    asked.push(question);
  }
  return { cast: current, asked };
}

/** The event drawn for a club happens: it waits for its human coach as a pop-up, or settles at once. */
function happen(state: GameState, scene: EventScene, drawn: { type: EventType; cast: Cast }, asksCoach: boolean, random: () => number): Resolved {
  const { type } = drawn;
  const { clubId, date } = scene;
  const text = type.texts[Math.floor(random() * type.texts.length)] ?? type.texts[0];
  if (!text) throw new Error(`event ${type.id} has no text`);
  const followUps = type.choices?.length && type.followUps ? followUpsFor(scene, drawn.cast, type.followUps, random) : null;
  const cast = followUps?.cast ?? drawn.cast;
  const slots = slotsOf(state, clubId, cast);
  const headline = fillSlots(text.headline, slots);
  const body = fillSlots(text.body, slots);
  const record: EventRecord = { typeId: type.id, date, clubId, ...cast };
  const happened: EventHappened = { type: "eventHappened", clubId, typeId: type.id, headline, asksCoach };
  if (type.choices?.length) {
    const choicesOf = (choices: NonNullable<EventType["choices"]>) =>
      choices.map((choice) => ({
        label: fillSlots(choice.label, slots),
        ...(choice.detail ? { detail: fillSlots(choice.detail, slots) } : {}),
        effects: byCast(choice.effects, scene, cast),
      }));
    const choices = choicesOf(type.choices);
    const assistantChoice = type.assistantChoice ?? 0;
    const questions: PendingQuestion[] | undefined = followUps
      ? [
          { id: type.id, ask: body, choices, assistantChoice },
          ...followUps.asked.map((question) => ({
            id: question.id,
            ask: fillSlots(question.asks[Math.floor(random() * question.asks.length)] ?? "", slots),
            choices: choicesOf(question.choices),
            assistantChoice: question.assistantChoice ?? 0,
          })),
        ]
      : undefined;
    const pending: PendingEvent = {
      ...record,
      area: type.area,
      topic: type.topic,
      look: type.look ?? "card",
      headline,
      body,
      setting: fillSlots(type.setting ?? "", slots),
      choices,
      assistantChoice,
      expiresOn: nextMatchDay(state, clubId, date) ?? addDays(date, ANSWER_DAYS_WITHOUT_MATCH),
      ...(questions ? { questions } : {}),
    };
    if (asksCoach) return { state: withMemory(state, (memory) => ({ ...memory, pending: { ...memory.pending, [clubId]: pending } })), events: [happened] };
    const answers = questionsOf(pending).map((question) => question.assistantChoice);
    const settled = settle(state, pending, answers, 0, type, date);
    const answer = pending.choices[assistantChoice]?.label ?? "";
    const answered: EventAnswered = { type: "eventAnswered", clubId, typeId: type.id, choice: answers.at(-1) ?? 0, byAssistant: true, topic: headline, answer, headline: settled.headline, questionsLeft: 0 };
    // A human coach's club hears of it once, as the assistant's answer.
    return { state: settled.state, events: [humanClubIds(state).includes(clubId) ? answered : happened] };
  }
  const story: NewsItem = { date, kind: "event", clubIds: [clubId, ...(cast.rivalId ? [cast.rivalId] : [])], headline, body, topic: type.topic };
  const remembered = withMemory(state, (memory) => remember(memory, record, story));
  return { state: applyEffects(remembered, clubId, cast, type.effects ? byCast(type.effects, scene, cast) : {}, date), events: [happened] };
}

/** The assistant answers every event whose time to answer ran out by `date`. */
function answerLapsed(state: GameState, date: IsoDate, bank: readonly EventType[]): Resolved {
  let next = state;
  const events: EventDayEvent[] = [];
  for (const pending of Object.values(eventMemoryOf(state).pending).sort((a, b) => (a.clubId < b.clubId ? -1 : 1))) {
    if (pending.expiresOn > date) continue;
    const answered = answerEvent(next, pending.clubId, null, bank, date);
    next = answered.state;
    events.push(answered.event);
  }
  return { state: next, events };
}

/**
 * The events of day `date`, run on the game after it: answers that ran out go to the assistant, then
 * each human coach's club and each Série A club may get events. A human coach gets at most one pop-up a
 * day and never a second while one waits; anything else settles at once and goes to the newspaper.
 */
export function runEvents(state: GameState, date: IsoDate, played: readonly Fixture[], bank: readonly EventType[] = EVENT_BANK): Resolved {
  const lapsed = answerLapsed(state, date, bank);
  let next = lapsed.state;
  const events = [...lapsed.events];
  const humans = new Set(humanClubIds(state));
  const clubIds = [...new Set([...humans, ...serieAOf(state.clubs)])].sort();
  let recall: Recall | null = null;
  for (const clubId of clubIds) {
    const random = keyedStream(state.seed ^ EVENT_SALT, `${date}:${clubId}`);
    const isHuman = humans.has(clubId);
    let hasPoppedUp = false;
    for (const chance of isHuman ? HUMAN_CHANCES : AI_CHANCES) {
      if (random() >= chance) continue;
      recall ??= recallOf(eventMemoryOf(next));
      const squad = squadsOfGame(next).get(clubId) ?? [];
      const scene: EventScene = { state: next, clubId, date, played, squad, random };
      const drawn = drawEvent(scene, recall, bank, random);
      if (!drawn) continue;
      const asksCoach: boolean = isHuman && !!drawn.type.choices?.length && !hasPoppedUp && !eventMemoryOf(next).pending[clubId] && !assistantAreasOf(next, clubId).includes(drawn.type.area);
      const done = happen(next, scene, drawn, asksCoach, random);
      next = done.state;
      events.push(...done.events);
      hasPoppedUp ||= asksCoach;
      recall = recallOf(eventMemoryOf(next));
    }
  }
  return { state: next, events };
}
