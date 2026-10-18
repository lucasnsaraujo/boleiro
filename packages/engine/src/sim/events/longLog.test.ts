import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { EVENT_BANK } from "./eventBank.js";
import { eventMemoryOf, type EventRecord } from "./eventMemory.js";
import { runEvents } from "./runEvents.js";

const start = loadNewGame(5, { coachClubId: "flamengo-rj" });
// About a century of a career's events, all long past every cooldown.
const OLD_RECORDS = 300_000;
const oldLog: EventRecord[] = Array.from({ length: OLD_RECORDS }, (_, at) => ({ typeId: `old-${at % 50}`, date: "2000-01-01", clubId: `club-${at % 40}`, playerId: `p${at}` }));

/** The CPU seconds the events of `days` days in a row take, after a first day to warm up. */
function eventDaysSeconds(first: GameState, days: number): number {
  let state = runEvents(first, first.date, []).state;
  const started = process.cpuUsage();
  for (let day = 1; day <= days; day++) state = runEvents(state, addDays(first.date, day), [], EVENT_BANK).state;
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1e6;
}

describe("a long career's event log", () => {
  it("doesn't make each day's events read it all again", () => {
    const memory = eventMemoryOf(start);
    const longCareer: GameState = { ...start, eventMemory: { ...memory, log: [...oldLog, ...memory.log] } };
    const fresh = eventDaysSeconds(start, 30);
    const long = eventDaysSeconds(longCareer, 30);
    // CPU time, not wall time, so other test files running in parallel don't count; a generous margin for the rest.
    expect(long).toBeLessThan(fresh * 3 + 0.2);
  }, 120_000);
});
