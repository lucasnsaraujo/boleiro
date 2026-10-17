import { expect, test } from "vitest";
import { inMatchOrder } from "@boleiro/engine/sim/live/matchTimeline";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { calloutsBetween, goalsBetween, highlightsBetween, pauseReason, roundAt, roundEndOf, scorersUntil, varCheckAt } from "./roundAt.js";

const colours = { primary: "#000000", secondary: "#ffffff" };
const club = (id: string, shortName: string) => ({ id, shortName, colours, stadium: `Estádio do ${shortName}` });

const round: LiveRound = {
  date: "2026-04-01",
  coachClubId: "bahia",
  competitions: [{ id: "a", label: "Série A · 1ª rodada", hasHumanCoach: true }],
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
  coach: { fixtureId: "ours", side: "away", starters: [], benchIds: [], squad: [], tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null }, rivalFormation: "4-4-2", lastChangeMinute: 0, incidentHandling: "askCoach", shootout: { kickers: [], isOverruled: false }, opponent: { clubId: "rival", name: "Rival", starters: [], bench: [], formation: "4-4-2", rivalTactics: null, form: [] } },
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

test("the round stops by itself at half-time, at the final whistle, and when the coach's side gets hurt, but never for a goal", () => {
  expect(pauseReason(round, 10)).toBeNull();
  expect(pauseReason(round, 20)).toBeNull();
  expect(pauseReason(round, 30)).toBeNull();
  expect(pauseReason(round, 45)).toBe("halfTime");
  expect(pauseReason(round, 50)).toBe("coachMatch");
  expect(pauseReason(round, 90)).toBe("fullTime");
});

const extraTime: LiveRound = {
  ...round,
  matches: [
    ...round.matches.slice(0, 1),
    {
      fixtureId: "ours",
      competitionId: "a",
      homeId: "vit",
      awayId: "bahia",
      events: inMatchOrder([
        { type: "halfTime", minute: 45 },
        { type: "fullTime", minute: 90 },
        { type: "goal", minute: 97, clubId: "bahia", playerId: "b9" },
        { type: "card", minute: 110, clubId: "bahia", playerId: "b2", card: "red" },
        { type: "extraHalfTime", minute: 105 },
        { type: "extraTimeEnd", minute: 120 },
      ]),
    },
  ],
};

test("a round with a match in extra time runs to 120 and stops in its breaks at 90 and 105, never for its goals", () => {
  expect(roundEndOf(round)).toBe(90);
  expect(roundEndOf(extraTime)).toBe(120);
  expect(pauseReason(extraTime, 90)).toBe("extraTimeBreak");
  expect(pauseReason(extraTime, 97)).toBeNull();
  expect(pauseReason(extraTime, 105)).toBe("extraTimeBreak");
  expect(pauseReason(extraTime, 110)).toBe("coachMatch");
  expect(pauseReason(extraTime, 120)).toBe("fullTime");
  const [ours] = roundAt(extraTime, 100);
  expect(ours).toMatchObject({ score: { home: 0, away: 1 }, last: { minute: 97, text: "Gol de Everaldo" } });
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

test("the assistant calls out a human coach's player having a bad day, at the minute he notices it, and nobody of the AI's", () => {
  const playerPlay = (clubId: string, form: number) => ({ clubId, group: "MID" as const, form, shots: [], tackles: [], fouls: [], passes: 40, misplaced: 10 });
  const play = { starters: ["b8", "b7", "v8"], players: { b8: playerPlay("bahia", -0.8), b7: playerPlay("bahia", 0.4), v8: playerPlay("vit", -0.9) } };
  const withPlay: LiveRound = { ...round, matches: round.matches.map((m) => (m.fixtureId === "ours" ? { ...m, play } : m)) };
  expect(highlightsBetween(withPlay, 15, 25).filter((h) => h.kind === "badDay")).toEqual([{ fixtureId: "ours", kind: "badDay", side: "away", clubId: "bahia", playerId: "b8" }]);
  expect(highlightsBetween(withPlay, 20, 90).filter((h) => h.kind === "badDay")).toEqual([]);
  expect(highlightsBetween(round, 0, 90).filter((h) => h.kind === "badDay")).toEqual([]);
});

test("a row calls out one moment a stretch: a red card or missed penalty over the assistant's word, and every player he notices together", () => {
  const playerPlay = (form: number) => ({ clubId: "bahia", group: "MID" as const, form, shots: [], tackles: [], fouls: [], passes: 40, misplaced: 10 });
  const play = { starters: ["b8", "b7", "b6"], players: { b8: playerPlay(-0.8), b7: playerPlay(-0.6), b6: playerPlay(0.3) } };
  const names = { ...round.names, b8: "Caio Alexandre", b7: "Jean Lucas" };
  const withPlay: LiveRound = { ...round, names, matches: round.matches.map((m) => (m.fixtureId === "ours" ? { ...m, play } : m)) };
  expect(calloutsBetween(withPlay, 15, 25)).toEqual([{ fixtureId: "ours", kind: "red" }]);
  const noRed: LiveRound = { ...withPlay, matches: withPlay.matches.map((m) => ({ ...m, events: m.events.filter((e) => e.type !== "card") })) };
  expect(calloutsBetween(noRed, 15, 25)).toEqual([{ fixtureId: "ours", kind: "badDay", who: "Caio Alexandre, Jean Lucas" }]);
  expect(calloutsBetween(noRed, 25, 40)).toEqual([]);
});

test("stops for VAR changing a call in a human coach's match, not for a goal it confirms or another league's check", () => {
  const withChecks: LiveRound = {
    ...round,
    matches: round.matches.map((m) => ({
      ...m,
      events: inMatchOrder([
        ...m.events,
        { type: "varCheck", minute: 31, clubId: "vit", playerId: "v9", decision: "goalStands", seconds: 60 },
        { type: "varCheck", minute: 62, clubId: m.homeId, playerId: m.homeId === "vit" ? "v9" : "p1", decision: "goalRuledOut", seconds: 100 },
      ]),
    })),
  };
  expect(varCheckAt(withChecks, 31)).toBeNull();
  expect(varCheckAt(withChecks, 62)).toMatchObject({ fixtureId: "ours", check: { decision: "goalRuledOut", playerId: "v9" } });
  expect(varCheckAt(withChecks, 63)).toBeNull();
  expect(roundAt(withChecks, 62).find((m) => m.fixtureId === "other")?.last).toMatchObject({ kind: "varCheck", text: "VAR anula o gol de Arrascaeta" });
  expect(roundAt(withChecks, 62, "ours").find((m) => m.fixtureId === "ours")?.last).toMatchObject({ kind: "varCheck", text: "VAR revisando o lance" });
  const awarded: LiveRound = {
    ...round,
    matches: round.matches.map((m) =>
      m.fixtureId === "ours"
        ? {
            ...m,
            events: inMatchOrder([
              ...m.events,
              { type: "goal", minute: 70, clubId: "bahia", playerId: "b9" },
              { type: "varCheck", minute: 70, clubId: "bahia", playerId: "b9", decision: "goalAwarded", seconds: 100 },
            ]),
          }
        : m,
    ),
  };
  const scoreOf = (underReview: string | null) => roundAt(awarded, 70, underReview).find((m) => m.fixtureId === "ours")?.score;
  expect(scoreOf("ours")).toEqual({ home: 1, away: 1 });
  expect(scoreOf(null)).toEqual({ home: 1, away: 2 });
  expect(roundAt(withChecks, 63, "ours").find((m) => m.fixtureId === "ours")?.last?.text).toBe("VAR anula o gol de Renato Kayzer");
  expect(calloutsBetween(withChecks, 60, 62).map((c) => [c.fixtureId, c.kind])).toEqual([
    ["other", "var"],
    ["ours", "var"],
  ]);
});

test("tells a wrong call that stood on the row's ticker", () => {
  const wronged: LiveRound = {
    ...round,
    matches: round.matches.map((m) =>
      m.fixtureId === "ours" ? { ...m, events: inMatchOrder([...m.events, { type: "wrongCall", minute: 70, clubId: "bahia", playerId: "b9", call: "penaltyNotGiven", againstId: "bahia" }]) } : m,
    ),
  };
  expect(roundAt(wronged, 70).find((m) => m.fixtureId === "ours")?.last).toMatchObject({ kind: "wrongCall", text: "Pênalti em Everaldo não marcado" });
});
