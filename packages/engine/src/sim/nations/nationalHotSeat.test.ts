import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { passTheSeat } from "../coach/humanCoaches.js";
import type { GameState } from "../gameState.js";
import { applyLiveChange } from "../live/applyLiveChange.js";
import { finishMatchDay } from "../live/finishMatchDay.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { humanNationalTeamIds, nationalFixtureId, syncNationalFixtures } from "./nationalFixtures.js";

const football = loadNationalFootball();
const WORLD_CUP_DAY = "2026-06-13";
const BRAZIL_MOROCCO = "world-cup-2026-C-1-brazil";

/** Two clubs with no match on the World Cup day, so their coaches run only their national teams then. */
function idleClubs(): [string, string] {
  const game = loadNewGame(7, { coachClubId: null, nationalFootball: football });
  const busy = new Set(game.fixtures.filter((f) => f.date === WORLD_CUP_DAY).flatMap((f) => [f.homeId, f.awayId]));
  const [a, b] = Object.values(game.clubs).filter((club) => club.division !== null && !busy.has(club.id)).map((club) => club.id);
  if (!a || !b) throw new Error("two national clubs rest on the World Cup day");
  return [a, b];
}

/** The seated coach takes `teamId`'s offer, as a federation's would come. */
function takes(state: GameState, teamId: string): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId, expiresOn: "2026-12-31" } } }).state;
}

/** A hot-seat game whose two coaches run Brazil (Ana) and Morocco (Bia), Ana in the seat. */
function twoNationalCoaches(): GameState {
  const [ana, bia] = idleClubs();
  const game = loadNewGame(7, { coachClubId: ana, nationalFootball: football, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bia", clubId: bia }] } });
  const withBia = passTheSeat(takes(game, "brazil"));
  return syncNationalFixtures(passTheSeat(takes(withBia, "morocco")));
}

describe("national coaches in a hot-seat game", () => {
  const game = twoNationalCoaches();

  it("keeps each coach's national job with him as the seat passes", () => {
    expect(game.coachName).toBe("Ana");
    expect(game.nations?.job?.teamId).toBe("brazil");
    expect(game.waitingCoaches?.[0]?.nationalJob?.teamId).toBe("morocco");
    const swapped = passTheSeat(game);
    expect(swapped.nations?.job?.teamId).toBe("morocco");
    expect(swapped.waitingCoaches?.[0]?.nationalJob?.teamId).toBe("brazil");
    expect(humanNationalTeamIds(game).sort()).toEqual(["brazil", "morocco"]);
  });

  it("opens their national teams' match live for both, each changing his own side", () => {
    const live = startMatchDay({ ...game, date: WORLD_CUP_DAY }, {});
    const fixtureId = nationalFixtureId(BRAZIL_MOROCCO);
    expect(live.coachMatch?.fixtureId).toBe(fixtureId);
    expect(live.coachMatch?.rivalTactics).toBeDefined();
    const changed = applyLiveChange(applyLiveChange(live, 20, { formation: "3-5-2" }), 40, { formation: "5-3-2" }, "morocco");
    const match = changed.matches.find((m) => m.fixtureId === fixtureId);
    expect(match?.formations).toEqual({ home: "3-5-2", away: "5-3-2" });
    const done = finishMatchDay(changed);
    expect(done.state.nations?.job?.tactics?.formation).toBe("3-5-2");
    expect(done.state.waitingCoaches?.[0]?.nationalJob?.tactics?.formation).toBe("5-3-2");
    const goals = (teamId: string) => match?.events.filter((e) => e.type === "goal" && e.clubId === teamId).length;
    expect(done.state.nations?.matches.find((m) => m.id === BRAZIL_MOROCCO)?.result).toEqual({ home: goals("brazil"), away: goals("morocco") });
  });
});

describe("national jobs in a hot-seat game after the World Cup", () => {
  const [ana, bia] = idleClubs();
  const start = loadNewGame(7, { coachClubId: ana, nationalFootball: football, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bia", clubId: bia }] } });
  // Ana runs Haiti, out in the groups; Bia, a big name, runs nobody.
  const game = syncNationalFixtures({ ...takes(start, "haiti"), waitingCoaches: start.waitingCoaches?.map((w) => ({ ...w, coach: { ...w.coach, reputation: 100 } })) });
  const waitingNews: string[] = [];
  let after = game;
  while (after.date < "2026-07-21") {
    const day = advanceDay(after, {});
    for (const event of day.waitingEvents?.[0] ?? []) waitingNews.push(event.type);
    after = day.state;
  }

  it("fires the seated coach whose team went out early and offers the waiting coach a job of his own", () => {
    expect(after.nations?.job).toBeUndefined();
    const offer = after.waitingCoaches?.[0]?.nationalOffer;
    expect(offer).toBeDefined();
    expect(waitingNews).toContain("nationalJobOffered");
    expect(offer?.teamId).not.toBe(after.nations?.offer?.teamId);
  });

  it("hands the waiting coach his offer when he sits down, to take it as his own", () => {
    const seatedBia = passTheSeat(after);
    expect(seatedBia.nations?.offer).toEqual(after.waitingCoaches?.[0]?.nationalOffer);
    const taken = acceptNationalOffer(seatedBia).state;
    expect(passTheSeat(taken).waitingCoaches?.[0]?.nationalJob?.teamId).toBe(after.waitingCoaches?.[0]?.nationalOffer?.teamId);
  });
});
