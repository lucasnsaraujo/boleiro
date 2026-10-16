import { keyedStream } from "../../engine/random.js";
import { humanClubIds, waitingCoachesOf } from "../coach/humanCoaches.js";
import { addDays } from "../dates.js";
import type { Fixture, GameState, IsoDate, SimPlayer } from "../gameState.js";
import { applyEffects } from "./applyEffects.js";
import { EVENT_BANK } from "./eventBank.js";
import { eventMemoryOf, type Cast, type EventMemory, type EventRecord, type NewsItem, type PendingEvent } from "./eventMemory.js";
import { byCast, type EventScene, type EventType } from "./eventType.js";
import { fillSlots, type Slots } from "./fillSlots.js";

/** An event happened at a club; `asksCoach` when it waits for a human coach's answer as a pop-up. */
export type EventHappened = { type: "eventHappened"; clubId: string; typeId: string; headline: string; asksCoach: boolean };
/**
 * A human coach's club answered an event: the coach himself, or his assistant (`byAssistant`). `topic`
 * is the event's own headline, `answer` the answer's words and `headline` what the paper prints of it.
 */
export type EventAnswered = { type: "eventAnswered"; clubId: string; typeId: string; choice: number; byAssistant: boolean; topic: string; answer: string; headline: string };
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

type Resolved = { state: GameState; events: EventDayEvent[] };

function coachNameOf(state: GameState, clubId: string): string | null {
  if (clubId === state.coachClubId) return state.coachName || null;
  return waitingCoachesOf(state).find((coach) => coach.clubId === clubId)?.name || null;
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

/** The club's players. A for-in walk: Object.values would copy every player of the game first. */
function squadOf(players: GameState["players"], clubId: string): SimPlayer[] {
  const squad: SimPlayer[] = [];
  for (const id in players) {
    const player = players[id];
    if (player?.clubId === clubId) squad.push(player);
  }
  return squad;
}

/** The memory with a record and a story added, stories older than the archive dropped. */
function remember(memory: EventMemory, record: EventRecord, story: NewsItem | null): EventMemory {
  const oldest = story ? addDays(story.date, -NEWS_DAYS) : "";
  return { ...memory, log: [...memory.log, record], news: story ? [...memory.news.filter((item) => item.date >= oldest), story] : memory.news };
}

function withMemory(state: GameState, change: (memory: EventMemory) => EventMemory): GameState {
  return { ...state, eventMemory: change(eventMemoryOf(state)) };
}

/** The memory and effects of an event answered with `picked`; the headline its outcome prints. */
function settle(state: GameState, pending: PendingEvent, picked: number, type: EventType | undefined, date: IsoDate): { state: GameState; headline: string } {
  const answer = pending.choices[picked];
  if (!answer) throw new Error(`event ${pending.typeId} has no answer ${picked}`);
  const { clubId } = pending;
  const cast: Cast = {
    ...(pending.playerId ? { playerId: pending.playerId } : {}),
    ...(pending.teammateId ? { teammateId: pending.teammateId } : {}),
    ...(pending.rivalId ? { rivalId: pending.rivalId } : {}),
  };
  const news = type?.choices?.[picked]?.news;
  const headline = news ? fillSlots(news, slotsOf(state, clubId, cast)) : pending.headline;
  const record: EventRecord = { typeId: pending.typeId, date: pending.date, clubId, ...cast, choice: picked };
  const story: NewsItem = { date, kind: "event", clubIds: [clubId, ...(cast.rivalId ? [cast.rivalId] : [])], headline, body: `${pending.body} Resposta: ${answer.label.replace(/[^.!?”]$/, "$&.")}` };
  const remembered = withMemory(state, (memory) => remember(memory, record, story));
  return { state: applyEffects(remembered, clubId, cast, answer.effects, date), headline };
}

/**
 * Settles the event waiting at `clubId` with answer `choice`, or the assistant's when `choice` is null,
 * on `date` (today, left out): its effects land, the answer goes into the memory and the newspaper.
 */
export function answerEvent(state: GameState, clubId: string, choice: number | null, bank: readonly EventType[] = EVENT_BANK, date: IsoDate = state.date): { state: GameState; event: EventAnswered } {
  const pending = eventMemoryOf(state).pending[clubId];
  if (!pending) throw new Error(`no event waits for an answer at ${clubId}`);
  const picked = choice ?? pending.assistantChoice;
  const left = Object.fromEntries(Object.entries(eventMemoryOf(state).pending).filter(([id]) => id !== clubId));
  const settled = settle(withMemory(state, (memory) => ({ ...memory, pending: left })), pending, picked, bank.find((type) => type.id === pending.typeId), date);
  const answer = pending.choices[picked]?.label ?? "";
  return { state: settled.state, event: { type: "eventAnswered", clubId, typeId: pending.typeId, choice: picked, byAssistant: choice === null, topic: pending.headline, answer, headline: settled.headline } };
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

/** The event drawn for a club happens: it waits for its human coach as a pop-up, or settles at once. */
function happen(state: GameState, scene: EventScene, drawn: { type: EventType; cast: Cast }, asksCoach: boolean, random: () => number): Resolved {
  const { type, cast } = drawn;
  const { clubId, date } = scene;
  const slots = slotsOf(state, clubId, cast);
  const text = type.texts[Math.floor(random() * type.texts.length)] ?? type.texts[0];
  if (!text) throw new Error(`event ${type.id} has no text`);
  const headline = fillSlots(text.headline, slots);
  const body = fillSlots(text.body, slots);
  const record: EventRecord = { typeId: type.id, date, clubId, ...cast };
  const happened: EventHappened = { type: "eventHappened", clubId, typeId: type.id, headline, asksCoach };
  if (type.choices?.length) {
    const pending: PendingEvent = {
      ...record,
      area: type.area,
      look: type.look ?? "card",
      headline,
      body,
      setting: fillSlots(type.setting ?? "", slots),
      choices: type.choices.map((choice) => ({
        label: fillSlots(choice.label, slots),
        ...(choice.detail ? { detail: fillSlots(choice.detail, slots) } : {}),
        effects: byCast(choice.effects, scene, cast),
      })),
      assistantChoice: type.assistantChoice ?? 0,
      expiresOn: nextMatchDay(state, clubId, date) ?? addDays(date, ANSWER_DAYS_WITHOUT_MATCH),
    };
    if (asksCoach) return { state: withMemory(state, (memory) => ({ ...memory, pending: { ...memory.pending, [clubId]: pending } })), events: [happened] };
    const settled = settle(state, pending, pending.assistantChoice, type, date);
    const answer = pending.choices[pending.assistantChoice]?.label ?? "";
    const answered: EventAnswered = { type: "eventAnswered", clubId, typeId: type.id, choice: pending.assistantChoice, byAssistant: true, topic: headline, answer, headline: settled.headline };
    // A human coach's club hears of it once, as the assistant's answer.
    return { state: settled.state, events: [humanClubIds(state).includes(clubId) ? answered : happened] };
  }
  const story: NewsItem = { date, kind: "event", clubIds: [clubId, ...(cast.rivalId ? [cast.rivalId] : [])], headline, body };
  const remembered = withMemory(state, (memory) => remember(memory, record, story));
  return { state: applyEffects(remembered, clubId, cast, type.effects ? byCast(type.effects, scene, cast) : {}, date), events: [happened] };
}

/** The assistant answers every event whose time to answer ran out by `date`. */
function answerLapsed(state: GameState, date: IsoDate): Resolved {
  let next = state;
  const events: EventDayEvent[] = [];
  for (const pending of Object.values(eventMemoryOf(state).pending).sort((a, b) => (a.clubId < b.clubId ? -1 : 1))) {
    if (pending.expiresOn > date) continue;
    const answered = answerEvent(next, pending.clubId, null, EVENT_BANK, date);
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
  const lapsed = answerLapsed(state, date);
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
      const squad = squadOf(next.players, clubId);
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
