import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { ContinentalCompetition, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { standings } from "../standings.js";
import { tieResults } from "../tieResults.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { leagueTable } from "../world/resultOnlyLeague.js";
import { CONMEBOL_CUPS, groupOrders } from "./conmebolCups.js";

const SEED = 4;

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

function cupOf(state: GameState, cup: ContinentalCompetition["cup"]): ContinentalCompetition {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === cup && c.season === state.season);
  if (found?.kind !== "continental") throw new Error(`no ${cup} in ${state.season}`);
  return found;
}

const championOf = (state: GameState, cup: ContinentalCompetition["cup"]) => {
  const competition = cupOf(state, cup);
  return CONMEBOL_CUPS.finalists(competition, state.fixtures.filter((f) => f.competitionId === competition.id))?.championId;
};

describe("a season with South America", () => {
  const start = loadNewGame(SEED, { coachClubId: null, world: loadSouthAmerica(2026) });
  const lastDay = playUntil(start, "2026-12-31");
  const next = playUntil(lastDay, "2027-01-01");

  it("opens the Libertadores with 47 clubs, the Sul-Americana with 44 of its own and the Recopa with the 2025 champions", () => {
    expect(cupOf(start, "libertadores").clubIds).toHaveLength(47);
    expect(cupOf(start, "sul-americana").clubIds).toHaveLength(44);
    expect(cupOf(start, "recopa").clubIds).toEqual(["flamengo-rj", "tm-333"]);
  });

  it("crowns a Libertadores, a Sul-Americana and a Recopa champion", () => {
    for (const cup of ["libertadores", "sul-americana", "recopa"] as const) expect(championOf(lastDay, cup)).toEqual(expect.any(String));
  });

  it("plays every continental fixture before the year ends, never two on one day for a club", () => {
    const continental = lastDay.fixtures.filter((f) => lastDay.competitions[f.competitionId]?.kind === "continental");
    expect(continental.length).toBeGreaterThan(300);
    expect(continental.every((f) => f.result)).toBe(true);
    const keys = lastDay.fixtures.flatMap((f) => [`${f.date}:${f.homeId}`, `${f.date}:${f.awayId}`]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every Brazilian club at least a day's rest between two matches, the cups' included", () => {
    const datesOf = new Map<string, string[]>();
    for (const f of lastDay.fixtures) for (const id of [f.homeId, f.awayId]) if (lastDay.clubs[id]) datesOf.set(id, [...(datesOf.get(id) ?? []), f.date]);
    const backToBack = [...datesOf].flatMap(([id, dates]) =>
      dates.toSorted().flatMap((date, i, sorted) => (i > 0 && Date.parse(date) - Date.parse(sorted[i - 1] ?? "") < 2 * 86_400_000 ? [`${id} ${date}`] : [])),
    );
    expect(backToBack).toEqual([]);
  });

  it("drops the Libertadores' group thirds into the Sul-Americana play-offs", () => {
    const sulAmericana = cupOf(lastDay, "sul-americana");
    const playoffClubs = sulAmericana.stages[2]?.kind === "knockout" ? sulAmericana.stages[2].ties.map(([third]) => third) : [];
    const thirds = groupOrders(cupOf(lastDay, "libertadores"), lastDay.fixtures, 3).map((order) => order[2]);
    expect(playoffClubs).toHaveLength(8);
    expect(playoffClubs.toSorted()).toEqual(thirds.toSorted());
  });

  it("drops the Libertadores' third-stage losers into the Sul-Americana groups", () => {
    const libertadores = cupOf(lastDay, "libertadores");
    const third = libertadores.stages[2];
    const played = lastDay.fixtures.filter((f) => f.competitionId === libertadores.id && f.stage === 2);
    const knockedOut = third?.kind === "knockout" ? tieResults(third, played).map((t) => t.loserId) : [];
    const groups = cupOf(lastDay, "sul-americana").stages[1];
    expect(knockedOut).toHaveLength(4);
    expect(groups?.kind === "groups" && knockedOut.every((id) => groups.groups.flat().includes(id))).toBe(true);
  });

  it("qualifies next season's clubs from this season's tables and champions", () => {
    const libertadores = cupOf(next, "libertadores");
    const direct = libertadores.entries[3] ?? [];
    expect(direct.slice(0, 2)).toEqual([championOf(lastDay, "libertadores"), championOf(lastDay, "sul-americana")]);
    expect(cupOf(next, "recopa").clubIds).toEqual(direct.slice(0, 2));
    const serieA = Object.values(lastDay.competitions).find((c) => c.kind === "league" && c.division === "A");
    const brazilTop = serieA ? standings(serieA.clubIds, lastDay.fixtures.filter((f) => f.competitionId === serieA.id), serieA.drawOrder).map((r) => r.clubId) : [];
    const argentinaTop = leagueTable(lastDay.world?.ar?.leagues[0] ?? { id: "", season: 0, clubIds: [], legs: 1, drawOrder: [], dates: [], results: "" });
    const holders = new Set(direct.slice(0, 2));
    expect(direct).toEqual(expect.arrayContaining(argentinaTop.filter((id) => !holders.has(id)).slice(0, 5)));
    expect(brazilTop.filter((id) => !holders.has(id)).slice(0, 3).every((id) => direct.includes(id))).toBe(true);
  });

  it("pays next season's entrants no lump sum at the turn, the cups paying as they are played, though the board still expects it", () => {
    const entrants = (cupOf(next, "libertadores").entries[3] ?? []).filter((id) => next.finances[id]);
    expect(entrants.length).toBeGreaterThan(0);
    for (const id of entrants) {
      expect(next.finances[id]?.month.revenue.prizes).toBe(0);
      expect(next.finances[id]?.expectedPrizes).toBeGreaterThan(0);
    }
  });
});
