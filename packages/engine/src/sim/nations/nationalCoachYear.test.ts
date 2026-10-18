import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { beforeAll, describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { nationalFixtureId, syncNationalFixtures } from "./nationalFixtures.js";

const football = loadNationalFootball();

/** The game with its coach running Brazil too, as if he took the CBF's offer on the first day. */
function coachingBrazil(state: GameState): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return syncNationalFixtures(acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId: "brazil", expiresOn: "2026-12-31" } } }).state);
}

describe("a club and national coach's 2026", () => {
  const start = coachingBrazil(loadNewGame(5, { coachClubId: "flamengo-rj", nationalFootball: football }));
  const events: DayEvent[] = [];
  let august: GameState;
  beforeAll(() => {
    let game = start;
    while (game.date < "2026-08-01") {
      const day = advanceDay(game, {});
      events.push(...day.events);
      game = day.state;
    }
    august = game;
  }, 300_000);

  it("plays every Brazil match of the year in the full tier, with the national competitions keeping the same scores", () => {
    const brazil = (august.nations?.matches ?? []).filter((m) => (m.homeId === "brazil" || m.awayId === "brazil") && m.date < "2026-08-01");
    expect(brazil.length).toBeGreaterThanOrEqual(5);
    for (const match of brazil) {
      const fixture = august.fixtures.find((f) => f.id === nationalFixtureId(match.id));
      expect(fixture?.result, match.id).not.toBeNull();
      expect([fixture?.result?.homeGoals, fixture?.result?.awayGoals, fixture?.result?.penaltyWinnerId]).toEqual([match.result?.home, match.result?.away, match.result?.penaltyWinnerId]);
    }
  });

  it("leaves every player at a club and no club money, mood or chemistry with a national team", () => {
    const teams = new Set(Object.keys(august.nations?.teams ?? {}));
    expect(Object.values(august.players).filter((p) => teams.has(p.clubId))).toEqual([]);
    expect(Object.keys(august.mood).filter((id) => teams.has(id))).toEqual([]);
    expect(Object.keys(august.finances).filter((id) => teams.has(id))).toEqual([]);
    expect(Object.keys(august.chemistry ?? {}).filter((id) => teams.has(id))).toEqual([]);
  });

  it("finishes the World Cup with a champion", () => {
    expect(august.nations?.titles.map((t) => t.competitionId)).toContain("world-cup-2026");
  });
});
