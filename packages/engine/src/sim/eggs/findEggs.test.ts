import { describe, expect, it } from "vitest";
import type { DayEvent } from "../advanceDay.js";
import { advanceDay } from "../advanceDay.js";
import { eventMemoryOf } from "../events/eventMemory.js";
import type { Fixture, GameState } from "../gameState.js";
import type { LiveMatch } from "../live/liveDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { eggBookOf } from "./eggBook.js";
import type { DayEgg, EggType, MatchEgg } from "./eggType.js";
import { findCoachEgg, findEggs, matchEggNotes } from "./findEggs.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const [RIVAL = "", AI_HOME = "", AI_AWAY = ""] = Object.values(start.clubs)
  .filter((club) => club.division === "A" && club.id !== CLUB)
  .map((club) => club.id);
const DATE = "2026-05-10";

const fixture = (id: string, homeId: string, awayId: string): Fixture => ({ id, competitionId: "serie-a-2026", stage: 0, date: DATE, homeId, awayId, result: { homeGoals: 7, awayGoals: 1 } });
const ours = fixture("ours", CLUB, RIVAL);
const theirs = fixture("theirs", AI_HOME, AI_AWAY);
const playedEvents: DayEvent[] = [ours, theirs].map((f) => ({ type: "matchPlayed", fixture: f }));
const live = (f: Fixture): LiveMatch => ({ fixtureId: f.id, homeId: f.homeId, awayId: f.awayId, formations: { home: "4-4-2", away: "4-4-2" }, events: [] });
const matches = [live(ours), live(theirs)];

const everyMatch: MatchEgg = { id: "every-match", on: "match", title: "Todo jogo", rarity: "rare", look: "sticker", note: "nota", find: (tale) => [{ clubId: tale.fixture.homeId }], texts: [{ headline: "Achado no {club}", body: "{score}" }] };
const everyPlayer: MatchEgg = { ...everyMatch, id: "every-player", once: "player", find: (tale) => [{ clubId: tale.fixture.homeId, playerId: "p1" }] };
const everyDay: DayEgg = { id: "every-day", on: "day", title: "Todo dia", rarity: "rare", look: "clipping", find: (scene) => ({ clubId: scene.clubId }), texts: [{ headline: "Dia de {coach} no {club}", body: "corpo" }] };

const run = (bank: readonly EggType[], state: GameState = start) => findEggs({ ...state, date: "2026-05-11" }, state, DATE, playedEvents, matches, bank);

describe("finding eggs", () => {
  it("writes a find into the egg book, the newspaper and the day's events, only for a human coach's club", () => {
    const found = run([everyMatch, everyDay]);
    expect(eggBookOf(found.state).log.map((find) => [find.eggId, find.clubId, find.fixtureId ?? null])).toEqual([
      ["every-match", CLUB, "ours"],
      ["every-day", CLUB, null],
    ]);
    expect(found.events.map((e) => [e.type, e.eggId, e.clubId])).toEqual([
      ["eggFound", "every-match", CLUB],
      ["eggFound", "every-day", CLUB],
    ]);
    const news = eventMemoryOf(found.state).news.filter((item) => item.kind === "egg");
    expect(news.map((item) => item.headline)).toEqual([`Achado no ${start.clubs[CLUB]?.shortName}`, `Dia de o técnico no ${start.clubs[CLUB]?.shortName}`]);
    expect(news[0]?.body).toBe(`${start.clubs[CLUB]?.shortName} 7 × 1 ${start.clubs[RIVAL]?.shortName}`);
  });

  it("finds a player egg once per player in a career", () => {
    const first = run([everyPlayer]);
    expect(eggBookOf(first.state).log).toHaveLength(1);
    const again = run([everyPlayer], first.state);
    expect(again.events).toEqual([]);
    expect(eggBookOf(again.state).log).toHaveLength(1);
  });

  it("names a kid of the academy after the coach the game knows by name", () => {
    const kid = Object.values(start.youth?.prospects ?? {}).find((p) => p.clubId === CLUB);
    if (!kid) throw new Error("no academy");
    const naming: DayEgg = { ...everyDay, id: "naming", find: (scene) => ({ clubId: scene.clubId, rename: [{ prospectId: kid.id, name: scene.coach.name }] }) };
    const named = run([naming], { ...start, eggs: { log: [], coachName: "Tite" } });
    expect(named.state.youth?.prospects[kid.id]?.name).toBe("Tite");
  });

  it("knows a one-coach game's coach by the name typed at new game", () => {
    const named = loadNewGame(5, { coachClubId: CLUB, coachName: "Tite" });
    const kid = Object.values(named.youth?.prospects ?? {}).find((p) => p.clubId === CLUB);
    if (!kid) throw new Error("no academy");
    const naming: DayEgg = { ...everyDay, id: "naming", find: (scene) => ({ clubId: scene.clubId, rename: [{ prospectId: kid.id, name: scene.coach.name }] }) };
    expect(run([naming], named).state.youth?.prospects[kid.id]?.name).toBe("Tite");
    expect(eggBookOf(start).coachName).toBeUndefined();
  });

  it("never touches a match, a squad, money, moods or boards", () => {
    const found = run([everyMatch, everyDay]);
    for (const key of ["fixtures", "players", "finances", "mood", "boards", "competitions", "rngState", "market", "coach"] as const) expect(found.state[key]).toBe(start[key]);
  });

  it("leaves a game without a human coach as it was", () => {
    const noCoach = { ...start, coachClubId: null };
    expect(run([everyMatch, everyDay], noCoach).state).toEqual({ ...noCoach, date: "2026-05-11" });
  });

  it("keeps the egg book in a save, and a save from before eggs loads with an empty one", () => {
    const found = run([everyMatch]).state;
    expect(eggBookOf(loadGame(saveGame(found)))).toEqual(eggBookOf(found));
    const before: GameState = { ...found };
    delete before.eggs;
    expect(saveGame(before)).not.toContain('"eggs"');
    expect(eggBookOf(loadGame(saveGame(before)))).toEqual({ log: [] });
  });

  it("writes down the Windows 98 round the coach in the seat typed, once a career", () => {
    const typed = findCoachEgg(start, "windows-98");
    expect(typed.event).toMatchObject({ type: "eggFound", eggId: "windows-98", clubId: CLUB });
    expect(eggBookOf(typed.state).log.map((find) => [find.eggId, find.clubId, find.date])).toEqual([["windows-98", CLUB, start.date]]);
    const again = findCoachEgg(typed.state, "windows-98");
    expect(again.event).toBeNull();
    expect(again.state).toBe(typed.state);
    expect(() => findCoachEgg(start, "sobrenatural")).toThrow();
    expect(findCoachEgg({ ...start, coachClubId: null }, "windows-98").event).toBeNull();
  });

  it("tells a played match's eggs as notes for its page: those its real story lays and those the book wrote down; a match told again lays none of its own", () => {
    const story = { events: [], play: null };
    const notes = matchEggNotes(start, start.history, { ...ours, result: { homeGoals: 7, awayGoals: 1 } }, story);
    expect(notes).toEqual([{ eggId: "seven-one", title: "Sete a um", rarity: "legendary", look: "page", text: "Sete a um. O Mineirão viu esse placar em 8 de julho de 2014, na semifinal da Copa." }]);
    const booked = { ...start, eggs: { log: [{ eggId: "olympic-goal", date: DATE, clubId: CLUB, fixtureId: "ours", headline: "Gol olímpico de Pedro" }] } };
    expect(matchEggNotes(booked, start.history, { ...ours, result: { homeGoals: 1, awayGoals: 0 } }, story)).toEqual([{ eggId: "olympic-goal", title: "Gol olímpico", rarity: "rare", look: "sticker", text: "Gol olímpico de Pedro" }]);
    expect(matchEggNotes(start, start.history, { ...ours, result: { homeGoals: 1, awayGoals: 0 } }, story)).toEqual([]);
    expect(matchEggNotes(start, start.history, { ...ours, result: { homeGoals: 7, awayGoals: 1 } }, null)).toEqual([]);
    expect(matchEggNotes(booked, start.history, { ...ours, result: { homeGoals: 7, awayGoals: 1 } }, null).map((note) => note.eggId)).toEqual(["olympic-goal"]);
  });

  it("looks for eggs as a day is played", () => {
    let state = start;
    const found: DayEvent[] = [];
    for (let day = 0; day < 120; day++) {
      const played = advanceDay(state, {});
      state = played.state;
      found.push(...played.events.filter((e) => e.type === "eggFound"));
    }
    expect(found.length).toBe(eggBookOf(state).log.length);
    expect(eventMemoryOf(state).news.filter((item) => item.kind === "egg").length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
