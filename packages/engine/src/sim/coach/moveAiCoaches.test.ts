import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { playWorldDay } from "../world/resultOnlyWorld.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { coachesByClub, type CoachWorld } from "./aiCoaches.js";
import { moveAiCoaches } from "./moveAiCoaches.js";

const coachesOf = (state: GameState): CoachWorld => {
  if (!state.coaches) throw new Error("the game has no AI coaches");
  return state.coaches;
};
const coachAt = (state: GameState, clubId: string) => coachesByClub(coachesOf(state)).get(clubId);

/** Plays the coaches' part of each day from `from` to `until`, nothing else, as nobody else fires anyone. */
function quietDays(state: GameState, until: string): GameState {
  let next = state;
  while (next.date < until) {
    next = moveAiCoaches({ ...next, date: addDays(next.date, 1) }, next, [], next.date).state;
  }
  return next;
}

describe("the AI coaches' moves", () => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj" });
  const day = "2026-03-10";
  const onDay = { ...game, date: day };

  it("sends a fired coach to the free pool and opens his club's job", () => {
    const abel = coachAt(onDay, "palmeiras-sp");
    const { state } = moveAiCoaches(onDay, onDay, ["palmeiras-sp"], day);
    expect(coachAt(state, "palmeiras-sp")).toBeUndefined();
    expect(coachesOf(state).openJobs["palmeiras-sp"]).toBe(day);
    const fired = abel && coachesOf(state).coaches[abel.id];
    expect(fired?.clubId).toBeNull();
    expect(fired?.stints.at(-1)).toMatchObject({ clubId: "palmeiras-sp", until: day, left: "fired" });
    expect(fired?.reputation).toBeLessThan(abel?.reputation ?? 0);
  });

  it("fills an open job from the pool two weeks later, never with the coach it fired", () => {
    const abel = coachAt(onDay, "palmeiras-sp");
    const opened = moveAiCoaches(onDay, onDay, ["palmeiras-sp"], day).state;
    const nearly = quietDays(opened, addDays(day, 13));
    expect(coachAt(nearly, "palmeiras-sp")).toBeUndefined();
    const hired = moveAiCoaches(nearly, nearly, [], addDays(day, 14));
    const successor = coachAt(hired.state, "palmeiras-sp");
    expect(successor?.name).toBeTruthy();
    expect(successor?.id).not.toBe(abel?.id);
    expect(coachesOf(hired.state).openJobs["palmeiras-sp"]).toBeUndefined();
    expect(hired.events).toEqual([{ type: "coachAppointed", clubId: "palmeiras-sp", coachId: successor?.id, name: successor?.name }]);
  });

  it("keeps the job open while the player weighs the club's offer", () => {
    const opened = moveAiCoaches(onDay, onDay, ["palmeiras-sp"], day).state;
    const offer = { clubId: "palmeiras-sp", salary: 100_000, untilSeason: 2026, expiresOn: addDays(day, 20) };
    const weighing = { ...opened, date: addDays(day, 14), coach: { ...opened.coach, offers: [offer] } };
    expect(coachAt(moveAiCoaches(weighing, weighing, [], addDays(day, 14)).state, "palmeiras-sp")).toBeUndefined();
  });

  it("lets a club's AI coach go when the player takes it, and opens the job of the club he left", () => {
    const abel = coachAt(onDay, "palmeiras-sp");
    const moved = { ...onDay, coachClubId: "palmeiras-sp" };
    const { state } = moveAiCoaches(moved, onDay, [], day);
    expect(coachAt(state, "palmeiras-sp")).toBeUndefined();
    expect(abel && coachesOf(state).coaches[abel.id]?.stints.at(-1)).toMatchObject({ until: day, left: "replaced" });
    expect(coachesOf(state).openJobs["flamengo-rj"]).toBe(day);
  });

  it("changes the coach of about 57% of the result-only world's clubs in a season, as CIES counted", () => {
    let state = loadNewGame(5, { coachClubId: "flamengo-rj", world: loadSouthAmerica(2026) });
    const world = state.world ?? {};
    const clubs = Object.values(world).flatMap((country) => Object.keys(country.clubs));
    const first = new Map(clubs.map((id) => [id, coachAt(state, id)?.id]));
    const changed = new Set<string>();
    while (state.date < "2026-12-31") {
      const played = { ...state, world: playWorldDay(state.world ?? {}, state.date) };
      state = moveAiCoaches({ ...played, date: addDays(state.date, 1) }, played, [], state.date).state;
      for (const id of clubs) if (coachAt(state, id)?.id !== first.get(id)) changed.add(id);
    }
    // CIES: 484 of 850 teams changed coach during 2022/23, 56.9%.
    expect(changed.size / clubs.length).toBeGreaterThan(0.45);
    expect(changed.size / clubs.length).toBeLessThan(0.7);
  });
});
