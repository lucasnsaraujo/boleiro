import { beforeAll, expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { finishMatchDay } from "@boleiro/engine/sim/live/finishMatchDay";
import { startMatchDay } from "@boleiro/engine/sim/live/startMatchDay";
import { liveRoundOf, playerStatsOf, type LiveRound } from "./liveRoundOf.js";

const CLUB = "flamengo-rj";
// Enough play-ons to reach the coach's first match day.
const MAX_STEPS = 20;
// The keys a one-coach game with the world holds, to rebuild it from the session.
const KEYS: (keyof GameState)[] = ["version", "packVersion", "seed", "rngState", "date", "season", "coachClubId", "clubs", "players", "calendar", "competitions", "fixtures", "economy", "finances", "mood", "coach", "boards", "discipline", "history", "market", "usualLineups", "world", "europe", "friendlies"];

let kickOff: LiveRound;
let changed: LiveRound;
let onId: string;

beforeAll(() => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  kickOff = session.apply({ type: "startRound" });
  const coach = kickOff.coach;
  const bench = coach?.benchIds[0];
  const off = coach?.starters.find((id) => coach.squad.find((p) => p.id === id)?.group !== "GK");
  if (!bench || !off) throw new Error("the coach has a bench and outfielders");
  onId = bench;
  changed = session.apply({ type: "changeLive", minute: 60, change: { substitutions: [{ offId: off, onId }] } });
});

test("the coach's match rates every starter of both sides from 3 to 10, in tenths, each with a name", () => {
  const ratings = kickOff.ratings;
  if (!ratings || !kickOff.coach) throw new Error("the coach's match has ratings");
  const match = kickOff.matches.find((m) => m.fixtureId === kickOff.coach?.fixtureId);
  const subsOn = (clubId: string | undefined) => match?.events.filter((e) => e.type === "substitution" && e.clubId === clubId).length ?? 0;
  expect(ratings.home).toHaveLength(11 + subsOn(match?.homeId));
  expect(ratings.away).toHaveLength(11 + subsOn(match?.awayId));
  for (const { playerId, rating } of [...ratings.home, ...ratings.away]) {
    expect(rating).toBeGreaterThanOrEqual(3);
    expect(rating).toBeLessThanOrEqual(10);
    expect(Number.isInteger(Math.round(rating * 10))).toBe(true);
    expect(kickOff.names[playerId]).toBeTruthy();
  }
});

test("a substitute the coach brings on is rated after the change", () => {
  const side = changed.coach?.side ?? "home";
  expect(kickOff.ratings?.[side].map((r) => r.playerId)).not.toContain(onId);
  expect(changed.ratings?.[side].map((r) => r.playerId)).toContain(onId);
});

test("a scorer is rated above his side's quietest player", () => {
  const match = changed.matches.find((m) => m.fixtureId === changed.coach?.fixtureId);
  const goal = match?.events.find((e) => e.type === "goal" && e.kind !== "ownGoal" && e.kind !== "penalty");
  if (!goal || goal.type !== "goal" || !match) return expect.fail("the coach's match has a goal on this seed");
  const side = goal.clubId === match.homeId ? "home" : "away";
  const ratings = changed.ratings?.[side] ?? [];
  const scorer = ratings.find((r) => r.playerId === goal.playerId)?.rating ?? 0;
  expect(scorer).toBeGreaterThan(Math.min(...ratings.map((r) => r.rating)));
});

test("the round names every player its events mention: scorers, assistants and keepers who face a penalty", () => {
  const mentioned = kickOff.matches.flatMap((m) =>
    m.events.flatMap((e) => (e.type === "goal" ? [e.playerId, ...(e.assistId ? [e.assistId] : [])] : e.type === "penaltyMiss" ? [e.playerId, e.keeperId] : [])),
  );
  expect(mentioned.some((id) => kickOff.matches.some((m) => m.events.some((e) => e.type === "goal" && e.assistId === id)))).toBe(true);
  for (const id of mentioned) expect(kickOff.names[id]).toBeTruthy();
});

test("the coach's side is asked about its red cards and injuries, and shows who would kick a shootout in his order", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  const plan = session.matchDayPlan();
  const outfield = plan.lineup.filter((id) => plan.squad.find((p) => p.id === id)?.group !== "GK");
  const order = outfield.slice(-3).reverse();
  const round = session.apply({ type: "startRound", lineup: plan.lineup, tactics: { ...plan.tactics, kickerOrder: order } });
  const shootout = round.coach?.shootout;
  expect(round.coach?.incidentHandling).toBe("askCoach");
  expect(shootout?.kickers).toHaveLength(11);
  expect(shootout?.isOverruled ? shootout.kickers.slice(0, 3) : order).toEqual(shootout?.kickers.slice(0, 3));
  expect(plan.squad.find((p) => p.id === shootout?.kickers.at(-1))?.group).toBe("GK");
});

test("every match of the round shows each player's numbers as they stand at a minute, the substitute's from when he came on", () => {
  for (const match of kickOff.matches) {
    const half = playerStatsOf(match, 45);
    const full = playerStatsOf(match, 90);
    expect(Object.keys(half).length).toBeGreaterThanOrEqual(22);
    for (const [id, stats] of Object.entries(half)) {
      expect(stats.minutes).toBeLessThanOrEqual(45);
      expect(full[id]?.passes).toBeGreaterThanOrEqual(stats.passes);
      expect(full[id]?.shots).toBeGreaterThanOrEqual(stats.shots);
    }
  }
  const coachMatch = changed.matches.find((m) => m.fixtureId === changed.coach?.fixtureId);
  if (!coachMatch) throw new Error("the coach plays today");
  expect(playerStatsOf(coachMatch, 60)[onId]).toBeUndefined();
  expect(playerStatsOf(coachMatch, 90)[onId]?.minutes).toBe(30);
  expect(playerStatsOf({ ...coachMatch, play: undefined }, 90)).toEqual({});
});

test("only the competitions a human coach's club plays in open the round; the others go under Outras ligas", () => {
  const coachCompetition = kickOff.matches.find((m) => m.fixtureId === kickOff.coach?.fixtureId)?.competitionId;
  expect(kickOff.competitions.find((c) => c.id === coachCompetition)?.hasHumanCoach).toBe(true);
  expect(kickOff.competitions.some((c) => !c.hasHumanCoach)).toBe(true);
  for (const competition of kickOff.competitions.filter((c) => c.hasHumanCoach)) {
    expect(kickOff.matches.some((m) => m.competitionId === competition.id && (m.homeId === CLUB || m.awayId === CLUB))).toBe(true);
  }
});

test("a competition the coach's club reached from another cup, outside its entry list, still opens the round", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  const state = session.read(KEYS);
  const fixture = state.fixtures.find((f) => f.date === state.date && (f.homeId === CLUB || f.awayId === CLUB));
  const competition = fixture && state.competitions[fixture.competitionId];
  if (!competition) throw new Error("the coach plays today");
  const dropped = { ...state, competitions: { ...state.competitions, [competition.id]: { ...competition, clubIds: competition.clubIds.filter((id) => id !== CLUB) } } };
  const round = liveRoundOf(startMatchDay(dropped, {}), 0);
  expect(round.competitions.find((c) => c.id === competition.id)?.hasHumanCoach).toBe(true);
});

test("a round saved before players had a form of the day still rates everyone and ends as it would have", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  const live = startMatchDay(session.read(KEYS), {});
  const old = { ...live, matches: live.matches.map((match) => ({ ...match, play: undefined })) };
  const round = liveRoundOf(old, 90);
  expect(round.ratings?.home.length).toBeGreaterThanOrEqual(11);
  expect(round.matches.every((m) => m.play === undefined)).toBe(true);
  expect(finishMatchDay(old)).toEqual(finishMatchDay(live));
});
