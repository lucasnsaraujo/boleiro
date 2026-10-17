import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { CONMEBOL_CUPS } from "../continental/conmebolCups.js";
import { latestChampionsLeagueWinner } from "../continental/uefaCups.js";
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

/** Plays the season to its end: its last day, the next season's first, the Club World Cup prizes paid in USD and the CPU seconds it took. */
function playSeason(first: GameState) {
  // CPU time, not wall time: other test files run in parallel processes and would inflate a wall clock.
  const started = process.cpuUsage();
  let state = first;
  const paidUsd = new Map<string, number>();
  for (;;) {
    const rate = state.economy.continental.usdBrl * (state.market.eurBrl / OPENING_EUR_BRL);
    const day = advanceDay(state, {});
    for (const event of day.events) {
      if (event.type === "prizePaid" && event.competitionId.startsWith("club-world-cup")) paidUsd.set(event.clubId, (paidUsd.get(event.clubId) ?? 0) + event.amount / rate);
    }
    if (day.events.some((e) => e.type === "seasonEnded")) {
      const used = process.cpuUsage(started);
      return { lastDay: state, next: day.state, paidUsd, seconds: (used.user + used.system) / 1e6 };
    }
    state = day.state;
  }
}

// The season before FIFA's 2029 edition, which the game's titles draw, then the edition's.
describe("two seasons of the v1 world", () => {
  const start = loadNewGame(9, { coachClubId: "flamengo-rj", world, guests, season: 2028 });
  const before = playSeason(start);
  const { lastDay, next, paidUsd, seconds } = playSeason(before.next);
  const cup = clubWorldCupOf(lastDay);
  const played = lastDay.fixtures.filter((f) => f.competitionId === cup?.id);

  it("holds about 1,300 clubs: Brazil's, the world's leagues and the Club World Cup's guests", () => {
    const clubs = Object.keys(start.clubs).length + Object.values(start.world ?? {}).reduce((sum, country) => sum + Object.keys(country.clubs).length, 0) + Object.values(start.guests ?? {}).flat().length;
    expect(clubs).toBeGreaterThan(1250);
    expect(clubs).toBeLessThan(1400);
  });

  it("plays a season with the Club World Cup within ten seconds", () => {
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
    expect(next.history.seasons.at(-1)?.champions["club-world-cup"]).toBe(champion);
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

  it("opens the edition from the season before's titles: the Libertadores, MLS and Liga MX champions among its 32", () => {
    expect(clubWorldCupOf(before.lastDay)).toBeUndefined();
    const libertadores = Object.values(before.lastDay.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === 2028);
    const libertadoresChampion = libertadores?.kind === "continental" ? CONMEBOL_CUPS.finalists(libertadores, before.lastDay.fixtures.filter((f) => f.competitionId === libertadores.id))?.championId : undefined;
    const nextCup = clubWorldCupOf(before.next);
    expect(nextCup?.clubIds).toHaveLength(32);
    expect(nextCup?.clubIds).toContain(libertadoresChampion);
    for (const country of ["us", "mx"]) expect(nextCup?.clubIds).toContain(before.next.world?.[country]?.seasons.at(-1)?.champions[0]);
  });

  it("plays the Intercontinental Cup in both seasons, the Club World Cup's too: five matches, the Libertadores' winner in the Derby of the Americas, the latest Champions League winner in the final, its champion filed", () => {
    for (const { lastDay: day, next: after } of [before, { lastDay, next }]) {
      const intercontinental = Object.values(day.competitions).find((c) => c.kind === "continental" && c.cup === "intercontinental-cup" && c.season === day.season);
      if (intercontinental?.kind !== "continental") throw new Error(`no Intercontinental Cup in ${day.season}`);
      const own = day.fixtures.filter((f) => f.competitionId === intercontinental.id);
      expect(own.map((f) => f.date)).toEqual(intercontinental.stageDates.flat());
      expect(own.every((f) => f.result)).toBe(true);
      const libertadores = Object.values(day.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === day.season);
      const libertadoresChampion = libertadores?.kind === "continental" ? CONMEBOL_CUPS.finalists(libertadores, day.fixtures.filter((f) => f.competitionId === libertadores.id))?.championId : undefined;
      expect(knockoutStageAt(intercontinental, 2).ties[0]).toContain(libertadoresChampion);
      expect(knockoutStageAt(intercontinental, 4).ties[0]?.[0]).toBe(latestChampionsLeagueWinner(day.europe));
      expect(after.history.seasons.at(-1)?.champions["intercontinental-cup"]).toBe(CONMEBOL_CUPS.finalists(intercontinental, own)?.championId);
    }
  });

  it("plays none in the season after an edition", () => {
    expect(clubWorldCupOf(next)).toBeUndefined();
  });

  it("carries a game saved before the Club World Cup into an edition year without one", () => {
    const withoutGuests: GameState = { ...before.lastDay };
    delete withoutGuests.guests;
    const old = loadGame(saveGame(withoutGuests));
    const turned = advanceDay(old, {}).state;
    expect(turned.season).toBe(2029);
    expect(clubWorldCupOf(turned)).toBeUndefined();
    expect(Object.values(turned.competitions).some((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === 2029)).toBe(true);
  });
});
