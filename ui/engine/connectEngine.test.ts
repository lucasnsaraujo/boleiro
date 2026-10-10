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

async function onMatchDay(): Promise<EngineClient> {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.playToMatchDay();
  return engine;
}

test("on the match day the lineup plan offers eleven of the coach's players, one in goal, in his last formation", async () => {
  const engine = await onMatchDay();
  const plan = await engine.matchDayPlan();
  const { coach } = await engine.read(["coach"]);
  expect(plan.tactics).toEqual(coach.tactics);
  expect(plan.lineup).toHaveLength(11);
  const starters = plan.squad.filter((p) => plan.lineup.includes(p.id));
  expect(starters).toHaveLength(11);
  expect(starters.filter((p) => p.group === "GK")).toHaveLength(1);
  expect(starters.every((p) => p.status === null)).toBe(true);
});

test("a round kicked off and finished with no changes ends as playing the day on", async () => {
  const engine = await onMatchDay();
  const twin = await onMatchDay();
  await engine.startRound({});
  const finished = await engine.finishRound();
  const advanced = await twin.advance([{}]);
  expect(finished).toEqual(advanced);
  expect(await engine.save()).toBe(await twin.save());
});

test("a live substitution shows on the coach's timeline at the minute it was made", async () => {
  const engine = await onMatchDay();
  const round = await engine.startRound({});
  const coach = round.coach;
  if (!coach) throw new Error("the coach has a match today");
  const [offId] = coach.starters.slice(-1);
  const [onId] = coach.benchIds;
  const changed = await engine.changeLive(30, { substitutions: [{ offId: offId ?? "", onId: onId ?? "" }] });
  const events = changed.matches.find((m) => m.fixtureId === coach.fixtureId)?.events ?? [];
  expect(events).toContainEqual({ type: "substitution", minute: 30, clubId: "bahia-ba", playerId: onId, offId });
  expect(changed.coach?.lastChangeMinute).toBe(30);
});

test("the final whistle puts the coach's score in the inbox and ends the live round", async () => {
  const engine = await onMatchDay();
  await engine.startRound({});
  const { events } = await engine.finishRound();
  const played = events.find((e) => e.type === "matchPlayed" && (e.fixture.homeId === "bahia-ba" || e.fixture.awayId === "bahia-ba"));
  if (played?.type !== "matchPlayed") throw new Error("the coach's match was played");
  const { result } = played.fixture;
  expect((await engine.inbox()).map((line) => line.text)).toContainEqual(expect.stringContaining(`${result?.homeGoals} x ${result?.awayGoals}`));
  expect(await engine.liveRound()).toBeNull();
});

test("kicking off on a day the coach has no match fails", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await expect(engine.matchDayPlan()).rejects.toThrow("the coach has no match today");
});
