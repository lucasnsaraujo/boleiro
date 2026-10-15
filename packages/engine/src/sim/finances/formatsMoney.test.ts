import { describe, expect, it } from "vitest";
import { REALISTA, type Formats } from "../formats.js";
import type { Competition, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
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

  it("books a one-leg league's home gate for both legs, so the season's tickets add up as in a double round robin", () => {
    const fixture = firstSerieAWin(oneLeg);
    const asDoubleRoundRobin = { ...oneLeg, competitions: { ...oneLeg.competitions, [fixture.competitionId]: { ...serieAOf(oneLeg), gameScales: undefined } } };
    const scaled = ticketsOf(recordMatchFinances(oneLeg, [fixture]), fixture.homeId) - ticketsOf(oneLeg, fixture.homeId);
    const unscaled = ticketsOf(recordMatchFinances(asDoubleRoundRobin, [fixture]), fixture.homeId) - ticketsOf(oneLeg, fixture.homeId);
    expect(unscaled).toBeGreaterThan(0);
    expect(scaled).toBe(Math.round(2 * unscaled));
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
