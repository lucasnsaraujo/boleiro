import { expect, test } from "vitest";
import type { Competition, Fixture, MatchResult } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { matchTaleOf } from "./matchTale.js";

const start = loadNewGame(5, { coachClubId: "flamengo-rj" });
const A = "flamengo-rj";
const B = "palmeiras-sp";
const cup: Competition = {
  id: "copa-teste",
  kind: "cup",
  season: 2026,
  clubIds: [A, B],
  stages: [{ kind: "knockout", ties: [[A, B]], dates: ["2026-11-01", "2026-11-08"] }],
  stageDates: [["2026-11-01", "2026-11-08"]],
  drawOrder: [],
  entries: [[A, B]],
};
const leg = (id: string, date: string, homeId: string, awayId: string, result: MatchResult | null): Fixture => ({ id, competitionId: cup.id, stage: 0, date, homeId, awayId, tie: 0, result });

/** The final as the eggs read its leg `played`, with `fixtures` as the final's legs in the game. */
function finalOf(played: Fixture & { result: MatchResult }, fixtures: Fixture[]) {
  const state = { seed: start.seed, clubs: start.clubs, players: start.players, competitions: { [cup.id]: cup }, fixtures };
  return matchTaleOf(state, start.history, played, { events: [], play: null }, []).final;
}

test("a two-legged final's champion is the tie's winner on aggregate, read from its second leg", () => {
  const first = leg("ida", "2026-11-01", A, B, { homeGoals: 0, awayGoals: 2 });
  const second = { ...leg("volta", "2026-11-08", B, A, null), result: { homeGoals: 1, awayGoals: 2 } };
  expect(finalOf(second, [first, second])).toEqual({ championId: B, margin: 1 });
  expect(finalOf({ ...first, result: { homeGoals: 0, awayGoals: 2 } }, [first, leg("volta", "2026-11-08", B, A, null)])).toBeNull();
});

test("a final decided on penalties has its shootout's winner as champion, by no goal", () => {
  const first = leg("ida", "2026-11-01", A, B, { homeGoals: 1, awayGoals: 0 });
  const second = { ...leg("volta", "2026-11-08", B, A, null), result: { homeGoals: 1, awayGoals: 0, penaltyWinnerId: A } };
  expect(finalOf(second, [first, second])).toEqual({ championId: A, margin: 0 });
});
