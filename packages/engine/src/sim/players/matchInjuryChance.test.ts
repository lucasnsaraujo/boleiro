import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { SimPlayer } from "../gameState.js";
import { advanceDay } from "../advanceDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { drawInjury, injurySeverity, MATCH_HOURS, MATCH_INJURIES_PER_HOUR, matchInjuryChance, type Injury, type InjurySeverity } from "./matchInjuryChance.js";

const game = loadNewGame(3, { coachClubId: null });
const date = game.date;
const natural = { date, pitch: "natural" as const };
const players = Object.values(game.players).map((p) => ({ ...p, trait: null }));
const somebody = players[0];
if (!somebody) throw new Error("no players");
const aged = (age: number): SimPlayer => ({ ...somebody, age });

function draws(player: SimPlayer, count: number, on = date): Injury[] {
  const random = seededRandom(7);
  return Array.from({ length: count }, () => drawInjury(player, on, random));
}
const meanDays = (injuries: readonly Injury[]) => injuries.reduce((sum, i) => sum + i.days, 0) / injuries.length;
const share = (injuries: readonly Injury[], kind: Injury["kind"]) => injuries.filter((i) => i.kind === kind).length / injuries.length;

describe("match injuries", () => {
  it("hit older players more often", () => {
    expect(matchInjuryChance(aged(34), natural)).toBeGreaterThan(matchInjuryChance(aged(22), natural) * 1.2);
  });

  it("keep the squads' average risk at the UEFA study's rate", () => {
    const mean = players.reduce((sum, p) => sum + matchInjuryChance(p, natural), 0) / players.length;
    const study = 1 - Math.exp(-MATCH_INJURIES_PER_HOUR * MATCH_HOURS);
    expect(mean / study).toBeGreaterThan(0.99);
    expect(mean / study).toBeLessThan(1.01);
  });

  it("are muscle injuries four times in ten and ligament injuries one in six", () => {
    const injuries = draws(aged(26), 20_000);
    expect(share(injuries, "muscle")).toBeCloseTo(0.403, 1);
    expect(share(injuries, "ligament")).toBeCloseTo(0.167, 1);
  });

  it("keep a player out 18 days on average, ligament injuries longest", () => {
    const injuries = draws(aged(26), 20_000);
    expect(meanDays(injuries)).toBeGreaterThan(16.5);
    expect(meanDays(injuries)).toBeLessThan(19.5);
    const muscle = meanDays(injuries.filter((i) => i.kind === "muscle"));
    const ligament = meanDays(injuries.filter((i) => i.kind === "ligament"));
    expect(ligament).toBeGreaterThan(muscle * 1.5);
    expect(Math.max(...injuries.map((i) => i.days))).toBeGreaterThan(120);
    expect(Math.min(...injuries.map((i) => i.days))).toBeGreaterThanOrEqual(1);
  });

  it("keep older players out longer", () => {
    expect(meanDays(draws(aged(34), 20_000))).toBeGreaterThan(meanDays(draws(aged(22), 20_000)) * 1.1);
  });

  it("come back more often, the same injury and longer, in the two months after a player returns", () => {
    const back = addDays(date, -20);
    const returned: SimPlayer = { ...aged(26), condition: { ...somebody.condition, injuredUntil: back, injury: "ligament" } };
    const hazard = (player: SimPlayer) => -Math.log(1 - matchInjuryChance(player, natural));
    expect(hazard(returned)).toBeCloseTo(hazard(aged(26)) * 2, 6);
    const again = draws(returned, 5_000);
    expect(again.every((i) => i.kind === "ligament" && i.isRecurrence)).toBe(true);
    const first = draws(aged(26), 20_000).filter((i) => i.kind === "ligament");
    expect(meanDays(again)).toBeGreaterThan(meanDays(first) * 1.2);

    const longAgo: SimPlayer = { ...returned, condition: { ...returned.condition, injuredUntil: addDays(date, -90) } };
    expect(matchInjuryChance(longAgo, natural)).toBeCloseTo(matchInjuryChance(aged(26), natural), 6);
    expect(draws(longAgo, 100).some((i) => i.isRecurrence)).toBe(false);
  });

  // Shares of all injuries at Copa Libertadores clubs in 2016 (Bengtsson, Ortega Gallo & Ekstrand 2021,
  // BMJ Open Sport Exerc Med 7(4):e001172, table 5).
  it("fall into UEFA's severity bands as often as at Copa Libertadores clubs", () => {
    const injuries = draws(aged(26), 20_000);
    const bandShare = (severity: InjurySeverity) => injuries.filter((i) => injurySeverity(i.days) === severity).length / injuries.length;
    const study: [InjurySeverity, number][] = [["slight", 0.21], ["minor", 0.22], ["moderate", 0.42], ["severe", 0.15]];
    for (const [severity, expected] of study) expect(Math.abs(bandShare(severity) - expected), severity).toBeLessThan(0.04);
  });

  it("fall into UEFA's severity bands", () => {
    expect([1, 3, 4, 7, 8, 28, 29, 200].map(injurySeverity)).toEqual(["slight", "slight", "minor", "minor", "moderate", "moderate", "severe", "severe"]);
  });
});

// The test plays the days up to the estaduais' first round, then tries that day on 20 streams.
const PLAYS_THE_ESTADUAL_MS = 60_000;

describe("an injury in a match", () => {
  it("stays on the player with what it was, and its news says so", () => {
    const firstLeagueDay = game.calendar.stateChampionshipDates[0] ?? date;
    let state = game;
    while (state.date < firstLeagueDay) state = advanceDay(state, {}).state;
    const injured = Array.from({ length: 20 }, (_, seed) => advanceDay({ ...state, rngState: seed }, {})).find((day) => day.events.some((e) => e.type === "playerInjured"));
    const event = injured?.events.find((e) => e.type === "playerInjured");
    if (!injured || event?.type !== "playerInjured") throw new Error("nobody got hurt in 20 days");
    expect(event.kind).toBeDefined();
    expect(injured.state.players[event.playerId]?.condition.injury).toBe(event.kind);
  }, PLAYS_THE_ESTADUAL_MS);
});
