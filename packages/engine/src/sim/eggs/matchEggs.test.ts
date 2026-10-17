import { expect, test } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import type { MatchEvent } from "../live/matchTimeline.js";
import { EGG_BANK } from "./eggBank.js";
import type { MatchEgg, MatchTale } from "./eggType.js";

const HOME = "casa";
const AWAY = "fora";

type TaleFields = {
  score: [number, number];
  events?: MatchEvent[];
  woodwork?: { clubId: string; playerId?: string; minute?: number }[];
  groups?: Record<string, PositionGroup>;
  ages?: Record<string, number>;
  names?: Record<string, string>;
  isFinal?: boolean;
  /** The final's champion and its winning margin over the tie, when it differs from this match's. */
  champion?: { clubId: string; margin: number };
  isAfterExtraTime?: boolean;
  isDerby?: boolean;
  debutants?: string[];
  date?: string;
  penaltyWinnerId?: string;
  coachNames?: string[];
};

/** Each player's club as the events tell it. */
function clubsIn(events: readonly MatchEvent[]): Record<string, string> {
  const clubs: Record<string, string> = {};
  for (const e of events) {
    if (!("playerId" in e)) continue;
    clubs[e.playerId] = e.type === "goal" && e.kind === "ownGoal" ? (e.clubId === HOME ? AWAY : HOME) : e.clubId;
    if (e.type === "substitution") clubs[e.offId] = e.clubId;
  }
  return clubs;
}

function tale(fields: TaleFields): MatchTale {
  const [homeGoals, awayGoals] = fields.score;
  return {
    fixture: {
      id: "f1",
      competitionId: "serie-a-2026",
      stage: 0,
      date: fields.date ?? "2026-05-10",
      homeId: HOME,
      awayId: AWAY,
      result: { homeGoals, awayGoals, ...(fields.penaltyWinnerId ? { penaltyWinnerId: fields.penaltyWinnerId } : {}), ...(fields.isAfterExtraTime ? { isAfterExtraTime: true } : {}) },
    },
    final: fields.isFinal
      ? { championId: fields.champion?.clubId ?? fields.penaltyWinnerId ?? (homeGoals > awayGoals ? HOME : AWAY), margin: fields.champion?.margin ?? Math.abs(homeGoals - awayGoals) }
      : null,
    isDerby: fields.isDerby ?? false,
    events: fields.events ?? [],
    groups: fields.groups ?? {},
    clubOf: clubsIn(fields.events ?? []),
    ages: fields.ages ?? {},
    names: fields.names ?? {},
    woodwork: (fields.woodwork ?? []).map((w, i) => ({ clubId: w.clubId, playerId: w.playerId ?? `p${i}`, minute: w.minute ?? 10 + i })),
    debutants: new Set(fields.debutants ?? []),
    coachNames: fields.coachNames ?? ["Tite"],
  };
}

const goal = (clubId: string, playerId: string, minute: number, kind?: Extract<MatchEvent, { type: "goal" }>["kind"]): MatchEvent => ({ type: "goal", minute, clubId, playerId, ...(kind ? { kind } : {}) });
const goals = (clubId: string, count: number, from = 10, kind?: Extract<MatchEvent, { type: "goal" }>["kind"]): MatchEvent[] =>
  Array.from({ length: count }, (_, i) => goal(clubId, `${clubId}-${i}`, from + i, kind));
const red = (clubId: string, playerId: string, minute = 30): MatchEvent => ({ type: "card", minute, clubId, playerId, card: "red" });
const miss = (clubId: string, playerId: string, keeperId: string, isSaved = true, minute = 40): MatchEvent => ({ type: "penaltyMiss", minute, clubId, playerId, keeperId, isSaved });
const kick = (clubId: string, playerId: string, isScored: boolean): MatchEvent => ({ type: "shootoutKick", minute: 90, clubId, playerId, isScored });

function egg(id: string): MatchEgg {
  const found = EGG_BANK.find((type) => type.id === id);
  if (found?.on !== "match") throw new Error(`no match egg ${id}`);
  return found;
}

/** The clubs the egg is found for in the match. */
const sidesOf = (id: string, fields: TaleFields) => egg(id).find(tale(fields)).map((hit) => hit.clubId);

test("Sobrenatural de Almeida haunts a side that hits the woodwork three times and doesn't win", () => {
  const posts = [{ clubId: HOME }, { clubId: HOME }, { clubId: HOME }];
  expect(sidesOf("sobrenatural", { score: [0, 0], woodwork: posts })).toEqual([HOME]);
  expect(sidesOf("sobrenatural", { score: [1, 2], woodwork: posts })).toEqual([HOME]);
  expect(sidesOf("sobrenatural", { score: [1, 0], events: goals(HOME, 1), woodwork: posts })).toEqual([]);
  expect(sidesOf("sobrenatural", { score: [0, 0], woodwork: posts.slice(1) })).toEqual([]);
});

test("a 7–1 opens the special album page for the side that scored seven", () => {
  expect(sidesOf("seven-one", { score: [1, 7] })).toEqual([AWAY]);
  expect(sidesOf("seven-one", { score: [7, 1] })).toEqual([HOME]);
  expect(sidesOf("seven-one", { score: [7, 0] })).toEqual([]);
  expect(sidesOf("seven-one", { score: [6, 1] })).toEqual([]);
});

test("a goalkeeper's goal is a rare sticker; his own goal is not", () => {
  const groups = { gk: "GK", st: "ATT" } as const;
  expect(sidesOf("keeper-goal", { score: [1, 0], events: [goal(HOME, "gk", 88, "penalty")], groups })).toEqual([HOME]);
  expect(sidesOf("keeper-goal", { score: [1, 0], events: [goal(HOME, "st", 88)], groups })).toEqual([]);
  expect(sidesOf("keeper-goal", { score: [1, 0], events: [goal(HOME, "gk", 88, "ownGoal")], groups })).toEqual([]);
});

test("a goal straight from a corner is an olympic goal", () => {
  expect(sidesOf("olympic-goal", { score: [0, 1], events: [goal(AWAY, "a", 20, "olympic")] })).toEqual([AWAY]);
  expect(sidesOf("olympic-goal", { score: [0, 1], events: [goal(AWAY, "a", 20, "freeKick")] })).toEqual([]);
});

test("winning with two men sent off recalls the Batalha dos Aflitos", () => {
  const reds = [red(AWAY, "a1"), red(AWAY, "a2", 60)];
  expect(sidesOf("aflitos", { score: [0, 1], events: [...reds, goal(AWAY, "a3", 80)] })).toEqual([AWAY]);
  expect(sidesOf("aflitos", { score: [1, 1], events: [...reds, goal(AWAY, "a3", 80), goal(HOME, "h", 85)] })).toEqual([]);
  expect(sidesOf("aflitos", { score: [0, 1], events: [red(AWAY, "a1"), goal(AWAY, "a3", 80)] })).toEqual([]);
});

test("a side that misses two penalties hears Neném Prancha's line about the club president", () => {
  expect(sidesOf("president-penalty", { score: [0, 0], events: [miss(HOME, "h1", "gk"), miss(HOME, "h2", "gk", false, 70)] })).toEqual([HOME]);
  expect(sidesOf("president-penalty", { score: [0, 0], events: [miss(HOME, "h1", "gk"), miss(AWAY, "a1", "gk2")] })).toEqual([]);
});

test("a keeper who saves two penalties in a match is a rare sticker", () => {
  const groups = { gk: "GK" } as const;
  expect(sidesOf("keeper-two-penalties", { score: [0, 0], events: [miss(HOME, "h1", "gk"), miss(HOME, "h2", "gk", true, 70)], groups })).toEqual([AWAY]);
  expect(sidesOf("keeper-two-penalties", { score: [0, 0], events: [miss(HOME, "h1", "gk"), miss(HOME, "h2", "gk", false, 70)], groups })).toEqual([]);
});

test("winning after trailing by three goals is a comeback for the album", () => {
  const away = goals(AWAY, 3, 5);
  const home = goals(HOME, 4, 50);
  expect(sidesOf("comeback-three", { score: [4, 3], events: [...away, ...home] })).toEqual([HOME]);
  expect(sidesOf("comeback-three", { score: [4, 3], events: [...away.slice(0, 2), ...home.slice(0, 2), goal(AWAY, "x", 51), ...home.slice(2)] })).toEqual([]);
  expect(sidesOf("comeback-three", { score: [3, 3], events: [...away, ...home.slice(0, 3)] })).toEqual([]);
});

test("a draw with eight goals or more is a story", () => {
  expect(sidesOf("eight-goal-draw", { score: [4, 4] })).toEqual([HOME]);
  expect(sidesOf("eight-goal-draw", { score: [3, 3] })).toEqual([]);
  expect(sidesOf("eight-goal-draw", { score: [5, 3] })).toEqual([]);
});

test("ten goals or more by one side make double figures", () => {
  expect(sidesOf("double-digits", { score: [0, 10] })).toEqual([AWAY]);
  expect(sidesOf("double-digits", { score: [9, 0] })).toEqual([]);
});

test("three penalties scored by one player make a penalty hat-trick", () => {
  const three = [goal(HOME, "h9", 10, "penalty"), goal(HOME, "h9", 50, "penalty"), goal(HOME, "h9", 80, "penalty")];
  expect(sidesOf("penalty-hat-trick", { score: [3, 0], events: three })).toEqual([HOME]);
  expect(sidesOf("penalty-hat-trick", { score: [3, 0], events: [...three.slice(0, 2), goal(HOME, "h9", 80)] })).toEqual([]);
});

test("a goalkeeper's own goal is news about his side", () => {
  const groups = { gk: "GK", zag: "DEF" } as const;
  expect(sidesOf("keeper-own-goal", { score: [1, 0], events: [goal(HOME, "gk", 30, "ownGoal")], groups })).toEqual([AWAY]);
  expect(sidesOf("keeper-own-goal", { score: [1, 0], events: [goal(HOME, "zag", 30, "ownGoal")], groups })).toEqual([]);
});

test("four goals by one player in a match", () => {
  const four = [10, 20, 30, 40].map((minute) => goal(AWAY, "a9", minute));
  expect(sidesOf("four-goals", { score: [0, 4], events: four })).toEqual([AWAY]);
  expect(sidesOf("four-goals", { score: [0, 4], events: [...four.slice(0, 3), goal(AWAY, "a8", 50)] })).toEqual([]);
  expect(sidesOf("four-goals", { score: [0, 4], events: [...four.slice(0, 3), goal(AWAY, "a9", 50, "ownGoal")] })).toEqual([]);
});

test("a defender's hat-trick", () => {
  const three = [10, 20, 30].map((minute) => goal(HOME, "zag", minute));
  expect(sidesOf("defender-hat-trick", { score: [3, 0], events: three, groups: { zag: "DEF" } })).toEqual([HOME]);
  expect(sidesOf("defender-hat-trick", { score: [3, 0], events: three, groups: { zag: "ATT" } })).toEqual([]);
});

test("a hat-trick on a player's debut for his club", () => {
  const three = [10, 20, 30].map((minute) => goal(HOME, "new", minute));
  expect(sidesOf("debut-hat-trick", { score: [3, 0], events: three, debutants: ["new"] })).toEqual([HOME]);
  expect(sidesOf("debut-hat-trick", { score: [3, 0], events: three, debutants: [] })).toEqual([]);
});

test("three headed goals by one player", () => {
  const three = [10, 20, 30].map((minute) => goal(AWAY, "a9", minute, "header"));
  expect(sidesOf("header-hat-trick", { score: [0, 3], events: three })).toEqual([AWAY]);
  expect(sidesOf("header-hat-trick", { score: [0, 3], events: [...three.slice(0, 2), goal(AWAY, "a9", 50)] })).toEqual([]);
});

test("a keeper who scores the shootout's winning kick", () => {
  const groups = { gk: "GK", st: "ATT" } as const;
  const shootout = [kick(HOME, "h1", true), kick(AWAY, "a1", false), kick(HOME, "gk", true)];
  expect(sidesOf("keeper-decides-shootout", { score: [1, 1], penaltyWinnerId: HOME, events: shootout, groups })).toEqual([HOME]);
  expect(sidesOf("keeper-decides-shootout", { score: [1, 1], penaltyWinnerId: HOME, events: [...shootout.slice(0, 2), kick(HOME, "st", true)], groups })).toEqual([]);
});

test("a shootout that runs past eight kicks each", () => {
  const rounds = (n: number) => Array.from({ length: n }, (_, i) => [kick(HOME, `h${i}`, true), kick(AWAY, `a${i}`, i < n - 1)]).flat();
  expect(sidesOf("endless-shootout", { score: [0, 0], penaltyWinnerId: HOME, events: rounds(8) })).toEqual([HOME]);
  expect(sidesOf("endless-shootout", { score: [0, 0], penaltyWinnerId: HOME, events: rounds(7) })).toEqual([]);
});

test("four goals by one side inside ten minutes", () => {
  expect(sidesOf("blitz", { score: [4, 0], events: [20, 23, 27, 30].map((m) => goal(HOME, `h${m}`, m)) })).toEqual([HOME]);
  expect(sidesOf("blitz", { score: [4, 0], events: [20, 23, 27, 31].map((m) => goal(HOME, `h${m}`, m)) })).toEqual([]);
});

test("losing at 89 minutes and winning in stoppage time", () => {
  const before = [goal(AWAY, "a", 30), goal(HOME, "h", 60)];
  expect(sidesOf("stoppage-comeback", { score: [2, 1], events: [goal(AWAY, "a", 30), goal(HOME, "h1", 90), goal(HOME, "h2", 90)] })).toEqual([HOME]);
  expect(sidesOf("stoppage-comeback", { score: [2, 1], events: [...before, goal(HOME, "h2", 90)] })).toEqual([]);
});

test("a derby settled 1–0 by an own goal", () => {
  expect(sidesOf("derby-own-goal", { score: [1, 0], isDerby: true, events: [goal(HOME, "a4", 70, "ownGoal")] })).toEqual([HOME]);
  expect(sidesOf("derby-own-goal", { score: [1, 0], isDerby: false, events: [goal(HOME, "a4", 70, "ownGoal")] })).toEqual([]);
  expect(sidesOf("derby-own-goal", { score: [1, 0], isDerby: true, events: [goal(HOME, "h4", 70)] })).toEqual([]);
});

test("a derby won by five goals or more", () => {
  expect(sidesOf("derby-rout", { score: [0, 5], isDerby: true })).toEqual([AWAY]);
  expect(sidesOf("derby-rout", { score: [0, 5], isDerby: false })).toEqual([]);
  expect(sidesOf("derby-rout", { score: [1, 5], isDerby: true })).toEqual([]);
});

test("five red cards in one match", () => {
  const reds = ["h1", "h2", "a1", "a2", "a3"].map((id) => red(id.startsWith("h") ? HOME : AWAY, id));
  expect(sidesOf("five-reds", { score: [0, 0], events: reds })).toEqual([HOME]);
  expect(sidesOf("five-reds", { score: [0, 0], events: reds.slice(1) })).toEqual([]);
});

test("a final won by a goal in stoppage time", () => {
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: true, events: [goal(HOME, "h", 10), goal(AWAY, "a", 50), goal(HOME, "h", 90)] })).toEqual([HOME]);
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: false, events: [goal(HOME, "h", 10), goal(AWAY, "a", 50), goal(HOME, "h", 90)] })).toEqual([]);
  expect(sidesOf("final-stoppage-winner", { score: [3, 1], isFinal: true, events: [goal(HOME, "h", 10), goal(HOME, "h", 50), goal(AWAY, "a", 60), goal(HOME, "h", 90)] })).toEqual([]);
});

test("a two-legged final's late winner on the night is the title goal only for the club that lifts the cup by that one goal on aggregate", () => {
  const night = [goal(HOME, "h", 10), goal(AWAY, "a", 50), goal(HOME, "h", 90)];
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: true, champion: { clubId: AWAY, margin: 1 }, events: night })).toEqual([]);
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: true, champion: { clubId: HOME, margin: 2 }, events: night })).toEqual([]);
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: true, champion: { clubId: HOME, margin: 1 }, events: night })).toEqual([HOME]);
});

test("a final won in extra time has no stoppage-time title goal", () => {
  const extra = [goal(HOME, "h", 10), goal(AWAY, "a", 50), goal(HOME, "h", 112)];
  expect(sidesOf("final-stoppage-winner", { score: [2, 1], isFinal: true, isAfterExtraTime: true, events: extra })).toEqual([]);
});

test("a shootout won after a leg lost or drawn is no win in the match for the eggs that need one", () => {
  expect(sidesOf("stoppage-comeback", { score: [0, 1], penaltyWinnerId: HOME, events: [goal(AWAY, "a", 30)] })).toEqual([]);
  expect(sidesOf("aflitos", { score: [0, 1], penaltyWinnerId: HOME, events: [red(HOME, "h1"), red(HOME, "h2", 60), goal(AWAY, "a", 80)] })).toEqual([]);
  expect(sidesOf("comeback-three", { score: [3, 3], penaltyWinnerId: HOME, events: [...goals(AWAY, 3, 5), ...goals(HOME, 3, 50)] })).toEqual([]);
});

test("one player hitting the woodwork three times", () => {
  const posts = [{ clubId: AWAY, playerId: "a9" }, { clubId: AWAY, playerId: "a9" }, { clubId: AWAY, playerId: "a9" }];
  expect(sidesOf("woodwork-hat-trick", { score: [1, 1], woodwork: posts })).toEqual([AWAY]);
  expect(sidesOf("woodwork-hat-trick", { score: [1, 1], woodwork: [...posts.slice(0, 2), { clubId: AWAY, playerId: "a8" }] })).toEqual([]);
});

test("a home defeat on 16 July recalls the Maracanaço", () => {
  expect(sidesOf("maracanazo", { score: [1, 2], date: "2027-07-16" })).toEqual([HOME]);
  expect(sidesOf("maracanazo", { score: [2, 1], date: "2027-07-16" })).toEqual([]);
  expect(sidesOf("maracanazo", { score: [1, 2], date: "2027-07-17" })).toEqual([]);
});

test("a penalty goal on 19 November recalls Pelé's thousandth", () => {
  expect(sidesOf("thousandth-goal", { score: [1, 0], date: "2026-11-19", events: [goal(HOME, "h10", 33, "penalty")] })).toEqual([HOME]);
  expect(sidesOf("thousandth-goal", { score: [1, 0], date: "2026-11-19", events: [goal(HOME, "h10", 33)] })).toEqual([]);
  expect(sidesOf("thousandth-goal", { score: [1, 0], date: "2026-11-18", events: [goal(HOME, "h10", 33, "penalty")] })).toEqual([]);
});

test("a defeat on a Friday the 13th", () => {
  expect(sidesOf("friday-13", { score: [0, 1], date: "2026-11-13" })).toEqual([HOME]);
  expect(sidesOf("friday-13", { score: [1, 0], date: "2026-11-13" })).toEqual([AWAY]);
  expect(sidesOf("friday-13", { score: [0, 1], date: "2026-10-13" })).toEqual([]);
  expect(sidesOf("friday-13", { score: [1, 1], date: "2026-11-13" })).toEqual([]);
});

test("a player of forty or more on the pitch, once per player", () => {
  const events = [{ type: "substitution", minute: 70, clubId: HOME, playerId: "old", offId: "x" } satisfies MatchEvent];
  expect(egg("forty-on-the-pitch").once).toBe("player");
  expect(sidesOf("forty-on-the-pitch", { score: [0, 0], ages: { old: 41, x: 25 }, groups: { old: "GK", x: "DEF" }, events })).toEqual([HOME]);
  expect(sidesOf("forty-on-the-pitch", { score: [0, 0], ages: { old: 39, x: 25 }, groups: { old: "GK", x: "DEF" }, events })).toEqual([]);
});

test("a player named after one of the game's coaches scores", () => {
  const names = { kid: "Tite Ribeiro", other: "Pedro" };
  expect(sidesOf("namesake-scores", { score: [1, 0], names, coachNames: ["Tite Ribeiro"], events: [goal(HOME, "kid", 50)] })).toEqual([HOME]);
  expect(sidesOf("namesake-scores", { score: [1, 0], names, coachNames: ["Tite Ribeiro"], events: [goal(HOME, "other", 50)] })).toEqual([]);
});

test("five goals up at half-time, as Germany were at the Mineirão", () => {
  expect(sidesOf("five-at-half-time", { score: [0, 5], events: goals(AWAY, 5, 10) })).toEqual([AWAY]);
  expect(sidesOf("five-at-half-time", { score: [1, 5], events: [...goals(AWAY, 5, 10), goal(HOME, "h", 40)] })).toEqual([]);
  expect(sidesOf("five-at-half-time", { score: [0, 5], events: goals(AWAY, 5, 46) })).toEqual([]);
});

test("a substitute's hat-trick", () => {
  const on: MatchEvent = { type: "substitution", minute: 60, clubId: HOME, playerId: "sub", offId: "tired" };
  const three = [65, 75, 85].map((minute) => goal(HOME, "sub", minute));
  expect(sidesOf("substitute-hat-trick", { score: [3, 0], events: [on, ...three] })).toEqual([HOME]);
  expect(sidesOf("substitute-hat-trick", { score: [3, 0], events: three })).toEqual([]);
});

test("a red card inside the first ten minutes", () => {
  expect(sidesOf("early-red", { score: [0, 0], events: [red(AWAY, "a5", 7)] })).toEqual([AWAY]);
  expect(sidesOf("early-red", { score: [0, 0], events: [red(AWAY, "a5", 11)] })).toEqual([]);
});

test("a goalkeeper sent off and his side still not beaten", () => {
  expect(sidesOf("keeper-sent-off", { score: [0, 0], events: [red(HOME, "gk", 50)], groups: { gk: "GK" } })).toEqual([HOME]);
  expect(sidesOf("keeper-sent-off", { score: [1, 0], events: [red(HOME, "gk", 50), goal(HOME, "h", 60)], groups: { gk: "GK" } })).toEqual([HOME]);
  expect(sidesOf("keeper-sent-off", { score: [0, 1], events: [red(HOME, "gk", 50), goal(AWAY, "a", 60)], groups: { gk: "GK" } })).toEqual([]);
  expect(sidesOf("keeper-sent-off", { score: [0, 0], events: [red(HOME, "zag", 50)], groups: { zag: "DEF" } })).toEqual([]);
});

test("three assists by one player", () => {
  const assisted = [10, 20, 30].map((minute, i): MatchEvent => ({ type: "goal", minute, clubId: AWAY, playerId: `a${i}`, assistId: "a10" }));
  expect(sidesOf("assist-hat-trick", { score: [0, 3], events: assisted })).toEqual([AWAY]);
  expect(sidesOf("assist-hat-trick", { score: [0, 3], events: [...assisted.slice(0, 2), goal(AWAY, "a2", 30)] })).toEqual([]);
});

test("two own goals by the same side", () => {
  expect(sidesOf("two-own-goals", { score: [2, 0], events: [goal(HOME, "a1", 10, "ownGoal"), goal(HOME, "a2", 70, "ownGoal")] })).toEqual([AWAY]);
  expect(sidesOf("two-own-goals", { score: [1, 1], events: [goal(HOME, "a1", 10, "ownGoal"), goal(AWAY, "h2", 70, "ownGoal")] })).toEqual([]);
});
