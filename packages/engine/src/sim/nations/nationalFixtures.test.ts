import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { syncNationalFixtures } from "./nationalFixtures.js";

const football = loadNationalFootball();
const start = loadNewGame(5, { coachClubId: "flamengo-rj", nationalFootball: football });

/** The game with its coach running `teamId` too, as if he took its federation's offer. */
function coaching(state: GameState, teamId: string): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId, expiresOn: "2026-12-31" } } }).state;
}

describe("a national coach's matches in the full tier", () => {
  it("puts his team's World Cup matches among the fixtures, with the competition's other matches of those days", () => {
    const game = syncNationalFixtures(coaching(start, "brazil"));
    const brazil = game.fixtures.filter((f) => f.homeId === "brazil" || f.awayId === "brazil");
    expect(brazil.map((f) => `${f.date} ${f.homeId}-${f.awayId}`)).toEqual(["2026-06-13 brazil-morocco", "2026-06-20 brazil-haiti", "2026-06-24 scotland-brazil"]);
    const competition = game.competitions[brazil[0]?.competitionId ?? ""];
    expect(competition?.kind).toBe("national");
    const sameDay = game.fixtures.filter((f) => f.competitionId === competition?.id && f.date === "2026-06-13");
    expect(sameDay.map((f) => `${f.homeId}-${f.awayId}`).sort()).toEqual(["brazil-morocco", "qatar-switzerland", "united-states-paraguay"]);
  });

  it("adds nothing twice when synced again", () => {
    const once = syncNationalFixtures(coaching(start, "brazil"));
    expect(syncNationalFixtures(once)).toBe(once);
  });

  it("leaves a game without a national coach as it was", () => {
    expect(syncNationalFixtures(start)).toBe(start);
  });
});
