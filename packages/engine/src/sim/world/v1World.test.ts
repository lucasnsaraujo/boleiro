import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { CONMEBOL_CUPS } from "../continental/conmebolCups.js";
import type { ContinentalCompetition, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { knockoutStageAt } from "../stageAt.js";
import { tieResults } from "../tieResults.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { loadEurope } from "./loadEurope.js";
import { loadGuests } from "./loadGuests.js";
import { loadMarketLeagues } from "./loadMarketLeagues.js";
import { loadSouthAmerica } from "./loadSouthAmerica.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);

const clubWorldCupOf = (state: GameState, season = state.season): ContinentalCompetition | undefined => {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === "club-world-cup" && c.season === season);
  return found?.kind === "continental" ? found : undefined;
};

describe("a season of the v1 world", () => {
  const start = loadNewGame(7, { coachClubId: "flamengo-rj", world, guests });
  // CPU time, not wall time: other test files run in parallel processes and would inflate a wall clock.
  const started = process.cpuUsage();
  let state = start;
  const paidUsd = new Map<string, number>();
  let next: GameState | null = null;
  while (!next) {
    const rate = state.economy.continental.usdBrl * (state.market.eurBrl / OPENING_EUR_BRL);
    const day = advanceDay(state, {});
    for (const event of day.events) {
      if (event.type === "prizePaid" && event.competitionId.startsWith("club-world-cup")) paidUsd.set(event.clubId, (paidUsd.get(event.clubId) ?? 0) + event.amount / rate);
    }
    if (day.events.some((e) => e.type === "seasonEnded")) next = day.state;
    else state = day.state;
  }
  const used = process.cpuUsage(started);
  const seconds = (used.user + used.system) / 1e6;
  const lastDay = state;
  const cup = clubWorldCupOf(lastDay);
  const played = lastDay.fixtures.filter((f) => f.competitionId === cup?.id);

  it("holds about 1,300 clubs: Brazil's, the world's leagues and the Club World Cup's guests", () => {
    const clubs = Object.keys(start.clubs).length + Object.values(start.world ?? {}).reduce((sum, country) => sum + Object.keys(country.clubs).length, 0) + Object.values(start.guests ?? {}).flat().length;
    expect(clubs).toBeGreaterThan(1250);
    expect(clubs).toBeLessThan(1400);
  });

  it("plays its season within ten seconds", () => {
    expect(seconds).toBeLessThan(10);
  });

  it("plays the Club World Cup's 63 matches, group winners meeting runners-up in the round of 16, and files its champion", () => {
    expect(played).toHaveLength(63);
    expect(played.every((f) => f.result)).toBe(true);
    expect(cup?.stages.map((stage) => (stage.kind === "groups" ? stage.groups.length : stage.ties.length))).toEqual([8, 8, 4, 2, 1]);
    const groups = cup?.stages[0]?.kind === "groups" ? cup.stages[0].groups : [];
    const [first] = cup ? knockoutStageAt(cup, 1).ties : [];
    expect(groups[0]).toContain(first?.[0]);
    expect(groups[1]).toContain(first?.[1]);
    const champion = cup && CONMEBOL_CUPS.finalists(cup, played)?.championId;
    expect(champion).toEqual(expect.any(String));
    expect(next?.history.seasons.at(-1)?.champions["club-world-cup"]).toBe(champion);
  });

  it("pays each Brazilian club FIFA's prizes for its results and the rounds it reached", () => {
    if (!cup) throw new Error("no Club World Cup");
    const brazilians = cup.clubIds.filter((id) => lastDay.clubs[id] && !lastDay.clubs[id].abroad);
    expect(brazilians).toHaveLength(4);
    const knockoutPrizes = [7_500_000, 13_125_000, 21_000_000];
    for (const id of brazilians) {
      const own = played.filter((f) => f.homeId === id || f.awayId === id);
      let usd = 15_210_000;
      for (const f of own.filter((g) => g.stage === 0)) {
        const scored = f.homeId === id ? f.result?.homeGoals : f.result?.awayGoals;
        const conceded = f.homeId === id ? f.result?.awayGoals : f.result?.homeGoals;
        usd += scored === conceded ? 1_000_000 : (scored ?? 0) > (conceded ?? 0) ? 2_000_000 : 0;
      }
      for (const stage of [1, 2, 3]) if (own.some((f) => f.stage === stage)) usd += knockoutPrizes[stage - 1] ?? 0;
      const final = own.find((f) => f.stage === 4);
      if (final) usd += tieResults(knockoutStageAt(cup, 4), [final])[0]?.winnerId === id ? 40_000_000 : 30_000_000;
      expect(paidUsd.get(id) ?? 0).toBeCloseTo(usd, -2);
    }
  });

  it("opens next season's Club World Cup from the game's titles: the Libertadores, MLS and Liga MX champions among its 32", () => {
    const libertadores = Object.values(lastDay.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === 2026);
    const libertadoresChampion = libertadores?.kind === "continental" ? CONMEBOL_CUPS.finalists(libertadores, lastDay.fixtures.filter((f) => f.competitionId === libertadores.id))?.championId : undefined;
    const nextCup = next && clubWorldCupOf(next);
    expect(nextCup?.clubIds).toHaveLength(32);
    expect(nextCup?.clubIds).toContain(libertadoresChampion);
    for (const country of ["us", "mx"]) expect(nextCup?.clubIds).toContain(next?.world?.[country]?.seasons.at(-1)?.champions[0]);
  });

  it("carries a game saved before the Club World Cup into its next season without one", () => {
    const withoutGuests: GameState = { ...lastDay };
    delete withoutGuests.guests;
    const competitions = Object.fromEntries(Object.entries(lastDay.competitions).filter(([, c]) => c.kind !== "continental" || c.cup !== "club-world-cup"));
    const old = loadGame(saveGame({ ...withoutGuests, competitions, fixtures: lastDay.fixtures.filter((f) => !f.competitionId.startsWith("club-world-cup")) }));
    const turned = advanceDay(old, {}).state;
    expect(turned.season).toBe(2027);
    expect(clubWorldCupOf(turned)).toBeUndefined();
    expect(Object.values(turned.competitions).some((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === 2027)).toBe(true);
  });
});
