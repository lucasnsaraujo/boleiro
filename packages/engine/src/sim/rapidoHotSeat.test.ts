import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import { RAPIDO } from "./formats.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadEurope } from "./world/loadEurope.js";
import { loadSouthAmerica } from "./world/loadSouthAmerica.js";

const FIRST = "flamengo-rj";
const SECOND = "goias-go";

/** A Rápido hot-seat season of a Série A and a Série B coach, played to its last day. */
function playSeason(): { last: GameState; leagueDays: Map<string, string[]> } {
  const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
  let state = loadNewGame(12, { coachClubId: FIRST, world, formats: RAPIDO, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } });
  const leagueDays = new Map<string, string[]>([[FIRST, []], [SECOND, []]]);
  for (;;) {
    const day = advanceDay(state, {});
    for (const event of day.events) {
      if (event.type !== "matchPlayed" || !event.fixture.competitionId.startsWith("serie-")) continue;
      for (const id of [event.fixture.homeId, event.fixture.awayId]) leagueDays.get(id)?.push(event.fixture.date);
    }
    if (day.events.some((e) => e.type === "seasonEnded")) return { last: state, leagueDays };
    state = day.state;
  }
}

describe("a Rápido hot-seat season with coaches in two leagues", () => {
  const { last, leagueDays } = playSeason();

  it("stops both coaches on the same league days", () => {
    const first = leagueDays.get(FIRST) ?? [];
    const second = leagueDays.get(SECOND) ?? [];
    expect(first).toHaveLength(38);
    expect(second).toHaveLength(38);
    expect(second).toEqual(first);
  });

  it("finishes every league and cup of the season for both coaches' clubs", () => {
    const own = last.fixtures.filter((f) => [FIRST, SECOND].includes(f.homeId) || [FIRST, SECOND].includes(f.awayId));
    expect(own.length).toBeGreaterThan(76);
    expect(own.every((f) => f.result !== null)).toBe(true);
    expect(last.waitingCoaches?.[0]?.clubId).toBe(SECOND);
  });
});
