import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { compareText } from "../compareText.js";

const COACH = "sport-pe";
const opening = loadNewGame(4, { coachClubId: COACH });
const fixture = opening.fixtures
  .filter((f): f is Fixture => !f.result && f.homeId !== COACH && f.awayId !== COACH && !!opening.clubs[f.homeId] && !!opening.clubs[f.awayId])
  .sort((a, b) => compareText(a.date, b.date) || compareText(a.id, b.id))[0];
if (!fixture) throw new Error("no fixture between two clubs of the game");
const { homeId: ownerId, awayId: borrowerId, date: matchDate } = fixture;

const minutesOf = (state: GameState, playerId: string) => state.players[playerId]?.condition.seasonMinutes ?? 0;

/** The day of the fixture, with the owner's best player on loan at the borrower. */
function onMatchDay(loanee: string): GameState {
  let state = opening;
  while (state.date < matchDate) state = advanceDay(state, {}).state;
  const player = state.players[loanee];
  if (!player) throw new Error("no loanee");
  const loans = { ...state.market.loans, [loanee]: { fromClubId: ownerId, until: "2026-12-31", lenderWageShare: 0.5, buyOption: null } };
  return { ...state, players: { ...state.players, [loanee]: { ...player, clubId: borrowerId } }, market: { ...state.market, loans } };
}

describe("a player on loan", () => {
  const best = Object.values(opening.players).filter((p) => p.clubId === ownerId).sort((a, b) => b.strength - a.strength)[0];
  if (!best) throw new Error("no owner player");

  it("plays for the club that borrowed him", () => {
    const state = onMatchDay(best.id);
    const lent = { ...state, market: { ...state.market, loans: { ...state.market.loans, [best.id]: { fromClubId: "nobody", until: "2026-12-31", lenderWageShare: 0.5, buyOption: null } } } };
    expect(minutesOf(advanceDay(lent, {}).state, best.id)).toBeGreaterThan(minutesOf(lent, best.id));
  });

  it("sits out the match against the club that owns him, as Brazilian loan deals have it", () => {
    const state = onMatchDay(best.id);
    expect(minutesOf(advanceDay(state, {}).state, best.id)).toBe(minutesOf(state, best.id));
  });
});
