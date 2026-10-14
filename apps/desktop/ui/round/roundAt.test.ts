import { expect, test } from "vitest";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { goalsBetween, pauseReason, roundAt } from "./roundAt.js";

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
  seenMinute: 0,
  coach: { fixtureId: "ours", side: "away", starters: [], benchIds: [], squad: [], tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null }, lastChangeMinute: 0 },
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
