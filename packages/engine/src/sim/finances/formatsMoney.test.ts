import { describe, expect, it } from "vitest";
import { payContinentalPrizes } from "../continental/payContinentalPrizes.js";
import { RAPIDO, REALISTA, type Formats } from "../formats.js";
import type { Competition, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { recordMatchFinances } from "./recordMatchFinances.js";

const ONE_LEG_LEAGUES: Formats = { ...REALISTA, leagueLegs: 1 };
const gameIn = (formats: Formats) => loadNewGame(6, { coachClubId: null, formats });

const ticketsOf = (state: GameState, clubId: string) => state.finances[clubId]?.month.revenue.tickets ?? 0;

function serieAOf(state: GameState): Competition {
  const competition = state.competitions[`serie-a-${state.season}`];
  if (!competition) throw new Error("no Série A");
  return competition;
}

/** The first Série A fixture of the game, played 1–0. */
function firstSerieAWin(state: GameState): Fixture {
  const fixture = state.fixtures.find((f) => f.competitionId === `serie-a-${state.season}`);
  if (!fixture) throw new Error("no Série A fixture");
  return { ...fixture, result: { homeGoals: 1, awayGoals: 0 } };
}

describe("money on shorter formats", () => {
  const realista = gameIn(REALISTA);
  const oneLeg = gameIn(ONE_LEG_LEAGUES);

  it("books a one-leg league game as both legs: each side the gate of its own home leg", () => {
    const fixture = firstSerieAWin(oneLeg);
    const asDoubleRoundRobin = { ...oneLeg, competitions: { ...oneLeg.competitions, [fixture.competitionId]: { ...serieAOf(oneLeg), gameScales: undefined } } };
    const gateOf = (state: GameState, clubId: string) => ticketsOf(recordMatchFinances(state, [fixture]), clubId) - ticketsOf(oneLeg, clubId);
    const homeLeg = gateOf(asDoubleRoundRobin, fixture.homeId);
    const reverse: Fixture = { ...fixture, homeId: fixture.awayId, awayId: fixture.homeId, result: { homeGoals: 0, awayGoals: 1 } };
    const reverseLeg = ticketsOf(recordMatchFinances(asDoubleRoundRobin, [reverse]), fixture.awayId) - ticketsOf(oneLeg, fixture.awayId);
    expect(homeLeg).toBeGreaterThan(0);
    expect(reverseLeg).toBeGreaterThan(0);
    expect(gateOf(oneLeg, fixture.homeId)).toBe(homeLeg);
    expect(gateOf(oneLeg, fixture.awayId)).toBe(reverseLeg);
  });

  it("shows the stadium screen the gate the crowd paid, not the season's share", () => {
    const fixture = firstSerieAWin(oneLeg);
    const human = { ...oneLeg, coachClubId: fixture.homeId };
    const [game] = recordMatchFinances(human, [fixture]).finances[fixture.homeId]?.homeGates ?? [];
    expect(game?.gate).toBe(Math.round((game?.crowd ?? 0) * (game?.price ?? 0)));
  });

  it("budgets the clubs a real season's ticket money: within 1% in all, each club within the one home game a single round robin moves", () => {
    const total = (state: GameState) => Object.values(state.finances).reduce((sum, finance) => sum + finance.expectedTickets, 0);
    // Which clubs host the odd tenth home game of a single round robin shifts the total a little.
    expect(Math.abs(total(oneLeg) / total(realista) - 1)).toBeLessThan(0.01);
    for (const [id, finance] of Object.entries(realista.finances)) {
      const oneHomeGame = 1.01 * finance.baseCrowd * finance.ticketPrice;
      expect(Math.abs((oneLeg.finances[id]?.expectedTickets ?? 0) - finance.expectedTickets)).toBeLessThanOrEqual(oneHomeGame);
    }
  });
});

describe("CONMEBOL money on three-game groups", () => {
  const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
  const game = loadNewGame(6, { coachClubId: null, world, formats: RAPIDO });
  const libertadores = game.competitions["libertadores-2026"];
  if (libertadores?.kind !== "continental") throw new Error("no Libertadores");
  const [winnerId = "", loserId = ""] = (libertadores.entries[3] ?? []).filter((id) => game.finances[id]);
  const groups = { kind: "groups" as const, groups: [[winnerId, loserId]], legs: 1 as const, dates: [libertadores.stageDates[3]?.[0] ?? ""] };
  const fixture: Fixture = { id: "test-group-win", competitionId: libertadores.id, stage: 3, date: groups.dates[0] ?? "", homeId: winnerId, awayId: loserId, result: { homeGoals: 1, awayGoals: 0 } };
  const drawn: GameState = { ...game, competitions: { ...game.competitions, [libertadores.id]: { ...libertadores, stages: [groups, groups, groups, groups] } } };

  it("pays each group win for the two real games it stands for", () => {
    const usd = game.economy.continentalStages?.libertadores["group-win"] ?? 0;
    const brl = (amount: number) => Math.round(amount * game.economy.continental.usdBrl * (game.market.eurBrl / OPENING_EUR_BRL));
    const paid = payContinentalPrizes(drawn, [fixture]).events.filter((e) => e.clubId === winnerId).map((e) => e.amount);
    expect(usd).toBeGreaterThan(0);
    expect(paid).toContain(brl(2 * usd));
  });
});
