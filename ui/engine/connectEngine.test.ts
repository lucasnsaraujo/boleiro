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

async function firstMatchOf(engine: EngineClient, clubId: string): Promise<string> {
  const { fixtures } = await engine.read(["fixtures"]);
  const dates = fixtures.filter((f) => f.homeId === clubId || f.awayId === clubId).map((f) => f.date);
  return dates.sort()[0] ?? "";
}

test("playing to the match day stops on the coach's first fixture, before kick-off", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const firstMatch = await firstMatchOf(engine, "bahia-ba");
  const played = await engine.playToMatchDay();
  expect(played).toMatchObject({ date: firstMatch, stop: "matchDay" });
  const { fixtures } = await engine.read(["fixtures"]);
  expect(fixtures.filter((f) => f.date === played.date && f.result)).toEqual([]);
});

test("the inbox keeps what happened since the coach last played on, and a new game empties it", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  expect(await engine.inbox()).toEqual([]);
  const daysToFirstMatch = Number((await firstMatchOf(engine, "bahia-ba")).slice(8, 10)) - 1;
  await engine.advance(Array.from({ length: daysToFirstMatch + 1 }, () => ({})));
  const firstMatch = (await engine.inbox()).find((line) => line.text.startsWith("Baiano: "));
  expect(firstMatch).toBeDefined();

  await engine.playToMatchDay();
  expect(await engine.inbox()).not.toContainEqual(firstMatch);

  await engine.newGame(8, { coachClubId: "bahia-ba" });
  expect(await engine.inbox()).toEqual([]);
});

async function ownPlayerOf(engine: EngineClient, clubId: string): Promise<string> {
  const { players } = await engine.read(["players"]);
  // A contract past this season, so a signing is a transfer and not a pre-contract.
  const found = Object.values(players).find((p) => p.clubId === clubId && p.contractUntil > "2026-12-31");
  if (!found) throw new Error(`no player at ${clubId}`);
  return found.id;
}

test("a request goes to the board when the coach plays on, and its answer lands on the desk and in the inbox", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const playerId = await ownPlayerOf(engine, "bahia-ba");
  const request = { kind: "renew", playerId, years: 2 } as const;
  expect((await engine.ask(request)).pending).toEqual([request]);

  expect(await engine.playToMatchDay()).toMatchObject({ date: "2026-01-02", stop: "boardDecision", daysPlayed: 1 });
  const desk = await engine.desk();
  expect(desk.pending).toEqual([]);
  expect(desk.answers).toEqual([expect.objectContaining({ date: "2026-01-01", request })]);
  expect((await engine.inbox()).some((line) => line.text.includes("a renovação de"))).toBe(true);
});

test("a signing asked for before the window waits on the desk and is answered the day the window opens", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const playerId = await ownPlayerOf(engine, "palmeiras-sp");
  await engine.ask({ kind: "sign", playerId });
  expect(await engine.playToMatchDay()).toMatchObject({ date: "2026-01-05", stop: "boardDecision" });
  expect((await engine.desk()).answers.map((a) => a.request)).toEqual([{ kind: "sign", playerId }]);
});

test("a pending request can be withdrawn, and a new game clears the desk", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const playerId = await ownPlayerOf(engine, "palmeiras-sp");
  await engine.ask({ kind: "sign", playerId });
  expect((await engine.withdraw(playerId)).pending).toEqual([]);
  await engine.ask({ kind: "sign", playerId });
  await engine.newGame(8, { coachClubId: "bahia-ba" });
  expect(await engine.desk()).toEqual({ pending: [], answers: [], forcedSales: [] });
});

test("pressing on when already on the match day keeps the inbox", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.playToMatchDay();
  const { date } = await engine.advance([{}]);
  const { fixtures } = await engine.read(["fixtures"]);
  const ownDates = fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").map((f) => f.date);
  const secondMatch = ownDates.filter((d) => d >= date).sort()[0] ?? date;
  await engine.advance(Array.from({ length: Number(secondMatch.slice(8, 10)) - Number(date.slice(8, 10)) }, () => ({})));
  const before = await engine.inbox();
  expect(before.length).toBeGreaterThan(0);
  expect(await engine.playToMatchDay()).toMatchObject({ stop: "matchDay", daysPlayed: 0 });
  expect(await engine.inbox()).toEqual(before);
});
