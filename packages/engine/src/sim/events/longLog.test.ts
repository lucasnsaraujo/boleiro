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
  // Two CPU timings on a shared 2-core runner swing past the margin; the Linux CI shards set BOLEIRO_SPEED_ELSEWHERE and a separate Apple Silicon job times it.
  it.skipIf(process.env.BOLEIRO_SPEED_ELSEWHERE === "1")("doesn't make each day's events read it all again", () => {
    const memory = eventMemoryOf(start);
    const longCareer: GameState = { ...start, eventMemory: { ...memory, log: [...oldLog, ...memory.log] } };
    const fresh = eventDaysSeconds(start, 30);
    const long = eventDaysSeconds(longCareer, 30);
    // CPU time, not wall time, so other test files running in parallel don't count; a generous margin for the rest.
    expect(long).toBeLessThan(fresh * 3 + 0.2);
  }, 120_000);
});

describe("the event log's index", () => {
  /** The game after the events of `days` days in a row from `first`. */
  const afterDays = (first: GameState, days: number, from = 0): GameState => {
    let state = first;
    for (let day = from; day < from + days; day++) state = runEvents(state, addDays(start.date, day), [], EVENT_BANK).state;
    return state;
  };

  it("gives two games played a day each in turn the same events as each played alone", () => {
    const other = loadNewGame(6, { coachClubId: "palmeiras-sp" });
    let first = start;
    let second = other;
    for (let day = 0; day < 40; day++) {
      first = runEvents(first, addDays(start.date, day), [], EVENT_BANK).state;
      second = runEvents(second, addDays(start.date, day), [], EVENT_BANK).state;
    }
    expect(eventMemoryOf(first)).toEqual(eventMemoryOf(afterDays(start, 40)));
    expect(eventMemoryOf(second)).toEqual(eventMemoryOf(afterDays(other, 40)));
  });

  it("reads two forks of one game, played a day each in turn, each as its own log", () => {
    const fork = afterDays(start, 20);
    if (!eventMemoryOf(fork).log.length) throw new Error("the fork needs events to share");
    let ahead = fork;
    let behind: GameState = { ...fork, seed: fork.seed + 1 };
    for (let day = 20; day < 40; day++) {
      ahead = runEvents(ahead, addDays(start.date, day), [], EVENT_BANK).state;
      behind = runEvents(behind, addDays(start.date, day), [], EVENT_BANK).state;
    }
    expect(eventMemoryOf(ahead)).toEqual(eventMemoryOf(afterDays(afterDays(start, 20), 20, 20)));
    expect(eventMemoryOf(behind)).toEqual(eventMemoryOf(afterDays({ ...afterDays(start, 20), seed: fork.seed + 1 }, 20, 20)));
  });
});
