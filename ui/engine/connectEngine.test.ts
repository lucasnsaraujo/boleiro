import { afterEach, expect, test } from "vitest";
import type { EngineClient } from "./connectEngine.js";
import { inMemoryEngine } from "./inMemoryEngine.js";

const closers: (() => void)[] = [];

function startEngine(): EngineClient {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  return engine;
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

test("a new game starts on 1 january at the chosen club", async () => {
  const engine = startEngine();
  expect(await engine.newGame(7, { coachClubId: "bahia-ba" })).toEqual({ date: "2026-01-01", season: 2026, coachClubId: "bahia-ba" });
});

test("advancing three days moves the date three days on", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const { date } = await engine.advance([{}, {}, {}]);
  expect(date).toBe("2026-01-04");
  expect(await engine.read(["date"])).toEqual({ date: "2026-01-04" });
});

test("loading a save brings back the game as it was when saved", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.advance([{}]);
  const save = await engine.save();
  await engine.advance([{}, {}]);
  expect(await engine.load(save)).toEqual({ date: "2026-01-02", season: 2026, coachClubId: "bahia-ba" });
});

test("reading returns only the slices asked for", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const slice = await engine.read(["season", "coachClubId"]);
  expect(slice).toEqual({ season: 2026, coachClubId: "bahia-ba" });
});

test("asking for state before a game exists fails with a clear error", async () => {
  const engine = startEngine();
  await expect(engine.read(["date"])).rejects.toThrow("no game is loaded");
});

test("a lineup the sim rejects fails the call and leaves the game where it was", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await expect(engine.advance([{}, { lineup: ["nobody"] }])).rejects.toThrow();
  expect(await engine.read(["date"])).toEqual({ date: "2026-01-01" });
});
