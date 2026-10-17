import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { clubMood } from "../morale/clubMood.js";
import { BLOCK_FROM_INTENSITY } from "../rivalries/idols.js";
import { rivalryOf } from "../rivalries/rivalryOf.js";
import { loadGame, saveGame } from "../saveGame.js";
import { EVENT_BANK } from "./eventBank.js";
import { eventMemoryOf, eventsOf, pendingEventOf, rivalryKey } from "./eventMemory.js";
import type { EventType } from "./eventType.js";
import { recordNews } from "./recordNews.js";
import { answerEvent, runEvents, type EventDayEvent } from "./runEvents.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const AI_CLUB = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";

const newsType = (id: string, fields: Partial<EventType> = {}): EventType => ({
  id,
  area: "players",
  weight: 1,
  cooldownDays: 0,
  cast: () => ({}),
  texts: [{ headline: `${id} em {club}`, body: "corpo" }],
  effects: {},
  ...fields,
});

const askingType = (id: string, fields: Partial<EventType> = {}): EventType =>
  newsType(id, { effects: undefined, choices: [{ label: "sim", effects: { morale: 5 } }, { label: "não", effects: { morale: -5 } }], ...fields });

/** Runs the events of `days` days in a row from `state`, without playing the days' matches. */
function runDays(state: GameState, days: number, bank: readonly EventType[], each?: (state: GameState, date: string, events: EventDayEvent[]) => GameState) {
  let next = state;
  const all: { date: string; events: EventDayEvent[] }[] = [];
  for (let day = 0; day < days; day++) {
    const date = addDays(state.date, day);
    const ran = runEvents({ ...next, date: addDays(date, 1) }, date, [], bank);
    next = each ? each(ran.state, date, ran.events) : ran.state;
    all.push({ date, events: ran.events });
  }
  return { state: next, days: all };
}

const happenedAt = (days: ReturnType<typeof runDays>["days"], clubId: string, typeId?: string) =>
  days.flatMap(({ date, events }) => events.filter((e) => e.type === "eventHappened" && e.clubId === clubId && (!typeId || e.typeId === typeId)).map(() => date));

const withRecentPoints = (state: GameState, clubId: string, recentPoints: number[]): GameState => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return { ...state, finances: { ...state.finances, [clubId]: { ...finance, recentPoints } } };
};

describe("event engine", () => {
  it("lets an event happen only while its precondition holds in the game", () => {
    const gated = newsType("gated", { cast: (scene) => (scene.state.finances[scene.clubId]?.recentPoints.slice(-3).every((p) => p === 0) && scene.state.finances[scene.clubId]?.recentPoints.length ? {} : null) });
    const losing = runDays(withRecentPoints(start, CLUB, [0, 0, 0]), 200, [gated]);
    const winning = runDays(withRecentPoints(start, CLUB, [3, 3, 3]), 200, [gated]);
    expect(happenedAt(losing.days, CLUB).length).toBeGreaterThan(5);
    expect(happenedAt(winning.days, CLUB)).toEqual([]);
  });

  it("keeps a type away from a club for its cooldown and from a player it already happened to", () => {
    const cooled = newsType("cooled", { cooldownDays: 30 });
    const dates = happenedAt(runDays(start, 365, [cooled]).days, CLUB);
    expect(dates.length).toBeGreaterThan(3);
    dates.slice(1).forEach((date, index) => expect(date >= addDays(dates[index] ?? "", 30)).toBe(true));

    const players = Object.values(start.players).filter((p) => p.clubId === CLUB);
    const once = newsType("once", { once: "player", cast: (scene) => ({ playerId: scene.squad[Math.floor(scene.random() * scene.squad.length)]?.id ?? "" }) });
    const ran = runDays(start, 365, [once]);
    const hit = eventsOf(ran.state, { typeId: "once", clubId: CLUB }).map((record) => record.playerId);
    expect(hit.length).toBeGreaterThan(5);
    expect(new Set(hit).size).toBe(hit.length);
    expect(hit.every((id) => players.some((p) => p.id === id))).toBe(true);
  });

  it("draws heavier events more often", () => {
    const ran = runDays(start, 400, [newsType("light", { weight: 1 }), newsType("heavy", { weight: 9 })]);
    const light = happenedAt(ran.days, AI_CLUB, "light").length + happenedAt(ran.days, CLUB, "light").length;
    const heavy = happenedAt(ran.days, AI_CLUB, "heavy").length + happenedAt(ran.days, CLUB, "heavy").length;
    expect(heavy).toBeGreaterThan(light * 3);
  });

  it("lands an answer's consequences on morale, fans, board, cash, availability and rivalry", () => {
    const player = Object.values(start.players).find((p) => p.clubId === CLUB);
    if (!player) throw new Error("no player at the club");
    const effects = { morale: 6, fans: -7, board: 10, money: -1_000_000, outDays: 5, rivalry: 4 };
    const type = askingType("all", { cast: () => ({ playerId: player.id, rivalId: AI_CLUB }), choices: [{ label: "tudo", effects }] });
    let before = start;
    for (let day = 0; !pendingEventOf(before, CLUB) && day < 120; day++) before = runEvents({ ...before, date: addDays(start.date, day + 1) }, addDays(start.date, day), [], [type]).state;
    const pending = pendingEventOf(before, CLUB);
    expect(pending?.choices[0]?.effects).toEqual(effects);
    const after = answerEvent(before, CLUB, 0, [type]).state;
    expect(clubMood(after, CLUB).squad).toBe(clubMood(before, CLUB).squad + 6);
    expect(clubMood(after, CLUB).fans).toBe(clubMood(before, CLUB).fans - 7);
    expect(after.boards[CLUB]?.pressure).toBeCloseTo((before.boards[CLUB]?.pressure ?? 0) - 0.2);
    expect(after.finances[CLUB]?.cash).toBe((before.finances[CLUB]?.cash ?? 0) - 1_000_000);
    expect(after.players[player.id]?.condition.injuredUntil).toBe(addDays(before.date, 6));
    expect(eventMemoryOf(after).rivalry[rivalryKey(CLUB, AI_CLUB)]).toBe(4);
    expect(pendingEventOf(after, CLUB)).toBeNull();
    expect(eventsOf(after, { typeId: "all", clubId: CLUB }).at(-1)?.choice).toBe(0);
  });

  it("asks a human coach at most once a day and never while an answer is waiting", () => {
    const bank = [askingType("a"), askingType("b"), askingType("c")];
    let asked = 0;
    const ran = runDays(start, 300, bank, (state, _date, events) => {
      const popUps = events.filter((e) => e.type === "eventHappened" && e.clubId === CLUB && e.asksCoach);
      expect(popUps.length).toBeLessThanOrEqual(1);
      asked += popUps.length;
      // The coach answers the day after it popped up, so the next pop-up can come.
      return pendingEventOf(state, CLUB) && popUps.length === 0 ? answerEvent(state, CLUB, 0, bank).state : state;
    });
    expect(asked).toBeGreaterThan(5);
    const settledByAssistant = ran.days.flatMap(({ events }) => events.filter((e) => e.type === "eventAnswered" && e.clubId === CLUB && e.byAssistant));
    expect(settledByAssistant.length).toBeGreaterThan(0);
  });

  it("has the assistant answer an event the coach lets lapse, at his club's next match", () => {
    const type = askingType("lapse", { cooldownDays: 400 });
    const ran = runDays(start, 120, [type]);
    const popped = ran.days.find(({ events }) => events.some((e) => e.type === "eventHappened" && e.clubId === CLUB && e.asksCoach));
    const answered = ran.days.find(({ events }) => events.some((e) => e.type === "eventAnswered" && e.clubId === CLUB && e.byAssistant));
    const nextMatch = start.fixtures
      .filter((f) => (f.homeId === CLUB || f.awayId === CLUB) && popped && f.date > popped.date)
      .map((f) => f.date)
      .sort()[0];
    expect(nextMatch).toBeDefined();
    expect(answered?.date).toBe(nextMatch);
    expect(eventsOf(ran.state, { typeId: "lapse", clubId: CLUB })[0]?.choice).toBe(0);
  });

  it("lets the assistant answer at once the areas the coach handed him", () => {
    const handed = { ...start, coach: { ...start.coach, assistantAreas: ["players" as const] } };
    const ran = runDays(handed, 200, [askingType("handed")]);
    expect(ran.days.some(({ events }) => events.some((e) => e.type === "eventAnswered" && e.clubId === CLUB && e.byAssistant))).toBe(true);
    expect(ran.days.some(({ events }) => events.some((e) => e.type === "eventHappened" && e.clubId === CLUB))).toBe(false);
    expect(pendingEventOf(ran.state, CLUB)).toBeNull();
  });

  it("draws the same events from the same game and leaves the game's own stream alone", () => {
    const one = runDays(start, 120, EVENT_BANK);
    const two = runDays(start, 120, EVENT_BANK);
    expect(saveGame(one.state)).toBe(saveGame(two.state));
    expect(one.state.rngState).toBe(start.rngState);
    expect(eventMemoryOf(one.state).log.length + Object.keys(eventMemoryOf(one.state).pending).length).toBeGreaterThan(0);
  });

  it("fills every text of the bank with real names", () => {
    const slots = new Set(["player", "teammate", "club", "rival", "age", "position", "stadium", "coach"]);
    for (const type of EVENT_BANK) {
      const texts = [...type.texts.flatMap((t) => [t.headline, t.body]), type.setting ?? "", ...(type.choices ?? []).flatMap((c) => [c.label, c.detail ?? "", c.news ?? ""])];
      for (const text of texts) for (const [, slot] of text.matchAll(/\{(\w+)\}/g)) expect(slots, `${type.id}: {${slot}}`).toContain(slot);
      expect(type.texts.length, type.id).toBeGreaterThanOrEqual(2);
    }
    expect(EVENT_BANK).toHaveLength(31);
    expect(new Set(EVENT_BANK.map((type) => type.id)).size).toBe(31);
    expect(new Set(EVENT_BANK.map((type) => type.area))).toEqual(new Set(["players", "squad", "board", "fans", "press"]));

    const named = runDays({ ...start, coachName: "Lucas Araujo" }, 365, EVENT_BANK);
    const club = start.clubs[CLUB]?.shortName ?? "";
    const stories = eventMemoryOf(named.state).news.filter((item) => item.clubIds[0] === CLUB);
    expect(stories.length).toBeGreaterThan(5);
    for (const story of stories) expect(`${story.headline} ${story.body}`).not.toMatch(/[{}]/);
    expect(stories.some((story) => story.headline.includes(club) || story.body.includes(club))).toBe(true);
    const withPlayer = eventsOf(named.state, { clubId: CLUB }).findLast((record) => record.playerId);
    const playerName = withPlayer?.playerId ? named.state.players[withPlayer.playerId]?.name : undefined;
    expect(playerName && eventMemoryOf(named.state).news.some((item) => item.headline.includes(playerName) || item.body.includes(playerName))).toBe(true);
  });

  it("makes a rivalry's events likelier as its heat builds up", () => {
    const rivalId = AI_CLUB;
    const scene = (state: GameState) => ({ state, clubId: CLUB, squad: [], date: start.date, played: [], random: () => 0 });
    const heated: GameState = { ...start, eventMemory: { log: [], pending: {}, news: [], rivalry: { [rivalryKey(CLUB, rivalId)]: 20 } } };
    for (const id of ["rival-provocation", "press-rival"]) {
      const type = EVENT_BANK.find((t) => t.id === id);
      if (!type || typeof type.weight !== "function") throw new Error(`${id} weighs by its rivalry`);
      expect(type.weight(scene(heated), { rivalId })).toBeGreaterThan(type.weight(scene(start), { rivalId }));
    }
  });

  it("casts a club's big derby rival in its provocations, never a minor one: Bahia hears from Vitória, not Galícia", () => {
    const type = EVENT_BANK.find((t) => t.id === "rival-provocation");
    if (!type || typeof type.cast !== "function") throw new Error("rival-provocation casts a rival");
    const cast = type.cast;
    const rivals = Array.from({ length: 20 }, (_, i) => cast({ state: start, clubId: "bahia-ba", squad: [], date: start.date, played: [], random: () => i / 20 })?.rivalId);
    expect(rivals.length).toBeGreaterThan(0);
    for (const rivalId of rivals) expect(rivalryOf("bahia-ba", rivalId ?? "")?.intensity ?? 0).toBeGreaterThanOrEqual(BLOCK_FROM_INTENSITY);
  });

  it("offers a press conference whose answers move morale, board, fans and rivalry", () => {
    const press = EVENT_BANK.filter((type) => type.look === "press");
    expect(press.length).toBeGreaterThan(0);
    for (const type of press) {
      expect(type.choices?.length).toBeGreaterThanOrEqual(2);
      expect(type.choices?.length).toBeLessThanOrEqual(3);
    }
    const rival = press.find((type) => type.id === "press-rival");
    const moved = new Set((rival?.choices ?? []).flatMap((choice) => (typeof choice.effects === "function" ? [] : Object.keys(choice.effects))));
    expect(moved).toEqual(new Set(["morale", "board", "fans", "rivalry"]));
  });
});

describe("the round's newspaper", () => {
  it("prints the coach's match, a sacking, a signing and an upset from the day's events", () => {
    const players = Object.values(start.players);
    const signing = players.find((p) => p.clubId === AI_CLUB);
    const smallClub = Object.values(start.clubs).find((club) => club.division === "D");
    if (!signing || !smallClub) throw new Error("no test cast");
    const home: Fixture = { id: "f1", competitionId: "x", stage: 0, date: start.date, homeId: CLUB, awayId: AI_CLUB, result: { homeGoals: 2, awayGoals: 1 } };
    const cup = Object.values(start.competitions).find((c) => c.kind === "cup");
    const upset: Fixture = { id: "f2", competitionId: cup?.id ?? "", stage: 0, date: start.date, homeId: smallClub.id, awayId: AI_CLUB, result: { homeGoals: 1, awayGoals: 0 } };
    const scorer = players.find((p) => p.clubId === CLUB);
    const sheets = { f1: { home: [], away: [], scorers: { home: [scorer?.id ?? "", scorer?.id ?? ""], away: [signing.id] } } };
    const papered = recordNews(
      start,
      start.date,
      [
        { type: "matchPlayed", fixture: home },
        { type: "matchPlayed", fixture: upset },
        { type: "coachFired", clubId: AI_CLUB, date: start.date, isYou: false, position: 18, targetPosition: 6 },
        { type: "playerMoved", kind: "transfer", playerId: signing.id, name: signing.name, fromClubId: AI_CLUB, toClubId: CLUB, fee: 12_000_000 },
      ],
      sheets,
    );
    const news = eventMemoryOf(papered).news;
    expect(news.map((item) => item.kind).sort()).toEqual(["match", "sacking", "signing", "upset"]);
    const match = news.find((item) => item.kind === "match");
    expect(match?.body).toContain(`${scorer?.name} (2)`);
    expect(match?.body).toContain(signing.name);
    expect(news.find((item) => item.kind === "signing")?.headline).toContain(signing.name);
    expect(news.find((item) => item.kind === "upset")?.headline).toContain(smallClub.shortName);
  });

  it("fills the paper as the days are played", () => {
    let state = start;
    for (let day = 0; day < 90; day++) state = advanceDay(state, {}).state;
    const kinds = new Set(eventMemoryOf(state).news.map((item) => item.kind));
    expect(kinds.has("match")).toBe(true);
    expect(eventMemoryOf(state).news.every((item) => item.date < state.date)).toBe(true);
  });
});

describe("saves", () => {
  it("loads a save from before events with an empty memory and plays on", () => {
    const old = loadGame(saveGame(start));
    expect(old.eventMemory).toBeUndefined();
    expect(eventMemoryOf(old)).toEqual({ log: [], pending: {}, news: [], rivalry: {} });
    let state = old;
    for (let day = 0; day < 30; day++) state = advanceDay(state, {}).state;
    expect(loadGame(saveGame(state)).eventMemory).toEqual(state.eventMemory);
  });
});
