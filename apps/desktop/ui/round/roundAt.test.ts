import { expect, test } from "vitest";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { goalsBetween, highlightsBetween, pauseReason, roundAt, scorersUntil } from "./roundAt.js";

const colours = { primary: "#000000", secondary: "#ffffff" };
const club = (id: string, shortName: string) => ({ id, shortName, colours, stadium: `Estádio do ${shortName}` });

const round: LiveRound = {
  date: "2026-04-01",
  coachClubId: "bahia",
  competitions: [{ id: "a", label: "Série A · 1ª rodada" }],
  matches: [
    {
      fixtureId: "other",
      competitionId: "a",
      homeId: "fla",
      awayId: "rem",
      events: [
        { type: "goal", minute: 3, clubId: "fla", playerId: "p1" },
        { type: "halfTime", minute: 45 },
        { type: "fullTime", minute: 90 },
      ],
    },
    {
      fixtureId: "ours",
      competitionId: "a",
      homeId: "vit",
      awayId: "bahia",
      events: [
        { type: "goal", minute: 10, clubId: "bahia", playerId: "b9" },
        { type: "card", minute: 20, clubId: "vit", playerId: "v4", card: "red" },
        { type: "goal", minute: 30, clubId: "vit", playerId: "v9" },
        { type: "injury", minute: 50, clubId: "bahia", playerId: "b2", days: 10 },
        { type: "halfTime", minute: 45 },
        { type: "fullTime", minute: 90 },
      ],
    },
  ],
  clubs: { fla: club("fla", "Flamengo"), rem: club("rem", "Remo"), vit: club("vit", "Vitória"), bahia: club("bahia", "Bahia") },
  names: { p1: "Arrascaeta", b9: "Everaldo", v4: "Wagner Leonardo", v9: "Renato Kayzer", b2: "Gilberto" },
  table: null,
  ratings: null,
  seenMinute: 0,
  coach: { fixtureId: "ours", side: "away", starters: [], benchIds: [], squad: [], tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null }, lastChangeMinute: 0, incidentHandling: "askCoach", shootout: { kickers: [], isOverruled: false } },
};

test("at a minute each match shows the score so far, its red cards and its latest event, the coach's match first", () => {
  const [ours, other] = roundAt(round, 25);
  expect(ours).toMatchObject({ fixtureId: "ours", isCoach: true, score: { home: 0, away: 1 }, reds: { home: 1, away: 0 } });
  expect(ours?.last).toEqual({ kind: "red", minute: 20, side: "home", text: "Expulso: Wagner Leonardo" });
  expect(other).toMatchObject({ score: { home: 1, away: 0 }, last: { text: "Gol de Arrascaeta" } });
});

test("before any event a match is level with nothing to show", () => {
  const [ours] = roundAt(round, 0);
  expect(ours).toMatchObject({ score: { home: 0, away: 0 }, last: null });
});

test("the goals of a stretch of minutes come with the side that scored", () => {
  expect(goalsBetween(round, 3, 30)).toEqual([
    { fixtureId: "ours", side: "away", clubId: "bahia" },
    { fixtureId: "ours", side: "home", clubId: "vit" },
  ]);
});

test("the round stops by itself at half-time, at the final whistle, and when the coach's side concedes, loses a man or gets hurt", () => {
  expect(pauseReason(round, 10)).toBeNull();
  expect(pauseReason(round, 20)).toBeNull();
  expect(pauseReason(round, 30)).toBe("coachMatch");
  expect(pauseReason(round, 45)).toBe("halfTime");
  expect(pauseReason(round, 50)).toBe("coachMatch");
  expect(pauseReason(round, 90)).toBe("fullTime");
});

test("a match's scorers up to a minute come in order, named, with their side", () => {
  expect(scorersUntil(round, "ours", 30)).toEqual([
    { name: "Everaldo", minute: 10, side: "away" },
    { name: "Renato Kayzer", minute: 30, side: "home" },
  ]);
  expect(scorersUntil(round, "ours", 29)).toHaveLength(1);
  expect(scorersUntil(round, "nobody", 90)).toEqual([]);
});

const deep: LiveRound = {
  ...round,
  matches: [
    {
      fixtureId: "ours",
      competitionId: "a",
      homeId: "vit",
      awayId: "bahia",
      events: [
        { type: "goal", minute: 5, clubId: "bahia", playerId: "b9", kind: "header", assistId: "b7" },
        { type: "goal", minute: 12, clubId: "bahia", playerId: "b9", kind: "penalty" },
        { type: "goal", minute: 20, clubId: "vit", playerId: "b2", kind: "ownGoal" },
        { type: "penaltyMiss", minute: 33, clubId: "vit", playerId: "v9", keeperId: "b1", isSaved: true },
        { type: "penaltyMiss", minute: 40, clubId: "bahia", playerId: "b9", keeperId: "v1", isSaved: false },
        { type: "goal", minute: 60, clubId: "vit", playerId: "v9", kind: "freeKick" },
        { type: "goal", minute: 70, clubId: "bahia", playerId: "b7", kind: "openPlay", assistId: "b9" },
        { type: "card", minute: 75, clubId: "vit", playerId: "v4", card: "secondYellow" },
        { type: "fullTime", minute: 90 },
        { type: "shootoutKick", minute: 90, clubId: "vit", playerId: "v9", isScored: true },
        { type: "orderOverruled", minute: 90, clubId: "bahia" },
      ],
    },
  ],
  names: { b9: "Everaldo", b7: "Cauly", b2: "Gilberto", b1: "Marcos Felipe", v9: "Renato Kayzer", v1: "Lucas Arcanjo", v4: "Wagner Leonardo" },
};
const lastAt = (minute: number) => roundAt(deep, minute)[0]?.last?.text;

test("a goal tells how it went in and who set it up, and an own goal names the player who put it in", () => {
  expect(lastAt(5)).toBe("Gol de cabeça de Everaldo, passe de Cauly");
  expect(lastAt(12)).toBe("Gol de pênalti de Everaldo");
  expect(lastAt(20)).toBe("Gol contra de Gilberto");
  expect(lastAt(60)).toBe("Gol de falta de Renato Kayzer");
  expect(lastAt(70)).toBe("Gol de Cauly, passe de Everaldo");
});

test("an own goal counts for the side it was scored for", () => {
  expect(roundAt(deep, 20)[0]?.score).toEqual({ home: 1, away: 2 });
});

test("a missed penalty says whether the keeper saved it, and leaves the score alone", () => {
  expect(roundAt(deep, 33)[0]).toMatchObject({ score: { home: 1, away: 2 }, last: { kind: "penaltyMiss", text: "Marcos Felipe defende o pênalti de Renato Kayzer" } });
  expect(lastAt(40)).toBe("Everaldo perde o pênalti");
});

test("the shootout after full time leaves the board's score and last event as the match ended", () => {
  expect(roundAt(deep, 90)[0]).toMatchObject({ score: { home: 2, away: 3 }, last: { kind: "red", minute: 75 } });
});

test("the band's scorers note penalties and own goals", () => {
  expect(scorersUntil(deep, "ours", 20)).toEqual([
    { name: "Everaldo", minute: 5, side: "away", kind: "header" },
    { name: "Everaldo", minute: 12, side: "away", kind: "penalty" },
    { name: "Gilberto", minute: 20, side: "home", kind: "ownGoal" },
  ]);
});

test("the highlights of a stretch of minutes are its goals, missed penalties and red cards", () => {
  expect(highlightsBetween(deep, 10, 80)).toEqual([
    { fixtureId: "ours", kind: "goal", side: "away", clubId: "bahia" },
    { fixtureId: "ours", kind: "goal", side: "home", clubId: "vit" },
    { fixtureId: "ours", kind: "penaltyMiss", side: "home", clubId: "vit" },
    { fixtureId: "ours", kind: "penaltyMiss", side: "away", clubId: "bahia" },
    { fixtureId: "ours", kind: "goal", side: "home", clubId: "vit" },
    { fixtureId: "ours", kind: "goal", side: "away", clubId: "bahia" },
    { fixtureId: "ours", kind: "red", side: "home", clubId: "vit" },
  ]);
});
