import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { applyLiveChange } from "../live/applyLiveChange.js";
import { finishMatchDay } from "../live/finishMatchDay.js";
import type { LiveDay } from "../live/liveDay.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { nationalFixtureId, syncNationalFixtures } from "./nationalFixtures.js";
import { nationalSquadOf } from "./nationalSquad.js";

const football = loadNationalFootball();
const BRAZIL_MOROCCO = "world-cup-2026-C-1-brazil";

/** The game with its coach running `teamId` too, as if he took its federation's offer, its matches among the fixtures. */
function coaching(state: GameState, teamId: string): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return syncNationalFixtures(acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId, expiresOn: "2026-12-31" } } }).state);
}

/** The game on the day of Brazil–Morocco, the World Cup's first match for Brazil. */
const onWorldCupDay = (coachClubId: string | null) => ({ ...coaching(loadNewGame(5, { coachClubId, nationalFootball: football }), "brazil"), date: "2026-06-13" });

const goalsOf = (live: LiveDay, fixtureId: string, teamId: string) => live.matches.find((m) => m.fixtureId === fixtureId)?.events.filter((e) => e.type === "goal" && e.clubId === teamId).length ?? 0;

describe("a national coach's match day", () => {
  const game = onWorldCupDay(null);
  const fixtureId = nationalFixtureId(BRAZIL_MOROCCO);

  it("opens his national team's match live, lined up from the called squad", () => {
    const live = startMatchDay(game, {});
    expect(live.coachMatch?.fixtureId).toBe(fixtureId);
    const squad = new Set(nationalSquadOf(game, "brazil").map((p) => p.id));
    expect(squad.size).toBeGreaterThanOrEqual(23);
    expect(live.coachMatch?.starters.home).toHaveLength(11);
    for (const p of [...(live.coachMatch?.starters.home ?? []), ...(live.coachMatch?.bench ?? [])]) expect(squad.has(p.id), p.name).toBe(true);
  });

  it("plays the eleven the coach picks from his call-up", () => {
    const squad = nationalSquadOf(game, "brazil");
    const keeper = squad.filter((p) => p.group === "GK").at(-1);
    const outfield = squad.filter((p) => p.group !== "GK").slice(-10);
    const lineup = [keeper, ...outfield].map((p) => p?.id ?? "");
    const live = startMatchDay(game, { lineup });
    expect(live.coachMatch?.starters.home.map((p) => p.id).sort()).toEqual([...lineup].sort());
  });

  it("refuses an eleven with a player the call-up left out", () => {
    const squad = new Set(nationalSquadOf(game, "brazil").map((p) => p.id));
    const stranger = Object.values(game.players).find((p) => !squad.has(p.id));
    const lineup = [...nationalSquadOf(game, "brazil").slice(0, 10).map((p) => p.id), stranger?.id ?? ""];
    expect(() => startMatchDay(game, { lineup })).toThrow();
  });

  it("records the live score, changes included, into the World Cup", () => {
    const live = startMatchDay(game, {});
    const starter = live.coachMatch?.starters.home.find((p) => p.group === "ATT") ?? live.coachMatch?.starters.home.at(-1);
    const sub = live.coachMatch?.bench.find((p) => p.group !== "GK");
    const changed = applyLiveChange(live, 60, { substitutions: [{ offId: starter?.id ?? "", onId: sub?.id ?? "" }], posture: "attacking" });
    const done = finishMatchDay(changed);
    const match = done.state.nations?.matches.find((m) => m.id === BRAZIL_MOROCCO);
    expect(match?.result).toEqual({ home: goalsOf(changed, fixtureId, "brazil"), away: goalsOf(changed, fixtureId, "morocco") });
    expect(done.state.fixtures.find((f) => f.id === fixtureId)?.result?.homeGoals).toBe(match?.result?.home);
  });

  it("keeps the called-up players at their clubs after the match, with its load on them", () => {
    const live = startMatchDay(game, {});
    const done = finishMatchDay(live);
    const starters = live.coachMatch?.starters.home.filter((p) => p.id in game.players) ?? [];
    expect(starters.length).toBeGreaterThan(0);
    for (const p of starters) {
      expect(done.state.players[p.id]?.clubId).toBe(game.players[p.id]?.clubId);
      expect(done.state.players[p.id]?.condition.fatigueOn).toBe("2026-06-13");
    }
  });

  it("saves the national tactics he ended the match with apart from his club's", () => {
    const live = startMatchDay(game, {});
    const changed = applyLiveChange(live, 30, { formation: "3-5-2" });
    const done = finishMatchDay(changed);
    expect(done.state.nations?.job?.tactics?.formation).toBe("3-5-2");
    expect(done.state.coach.tactics).toEqual(game.coach.tactics);
  });

  it("plays the competition's other matches of the day on the board too", () => {
    const live = startMatchDay(game, {});
    const national = live.matches.filter((m) => m.fixtureId.startsWith("national:"));
    expect(national.map((m) => `${m.homeId}-${m.awayId}`).sort()).toEqual(["brazil-morocco", "qatar-switzerland", "united-states-paraguay"]);
  });
});
