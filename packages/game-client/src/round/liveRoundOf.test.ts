import { beforeAll, expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";
import type { LiveRound } from "./liveRoundOf.js";

const CLUB = "flamengo-rj";
// Enough play-ons to reach the coach's first match day.
const MAX_STEPS = 20;

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
