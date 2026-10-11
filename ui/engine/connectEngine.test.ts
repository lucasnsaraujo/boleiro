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

test("a save keeps the desk: a request still pending and the board's answers come back on load", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.ask({ kind: "renew", playerId: await ownPlayerOf(engine, "bahia-ba"), years: 2 });
  await engine.playToMatchDay();
  await engine.ask({ kind: "sign", playerId: await ownPlayerOf(engine, "palmeiras-sp") });
  const desk = await engine.desk();
  const save = await engine.save();
  await engine.newGame(8, { coachClubId: "bahia-ba" });
  await engine.load(save);
  expect(await engine.desk()).toEqual(desk);
  expect(desk.pending).toHaveLength(1);
  expect(desk.answers).toHaveLength(1);
});

test("a save from before the desk was saved loads with an empty desk and no turning point waiting", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.advance([{}]);
  const save: { game: unknown } = JSON.parse(await engine.save());
  await engine.ask({ kind: "sign", playerId: await ownPlayerOf(engine, "palmeiras-sp") });
  expect(await engine.load(JSON.stringify(save.game))).toEqual({ date: "2026-01-02", season: 2026, coachClubId: "bahia-ba" });
  expect(await engine.desk()).toEqual({ pending: [], answers: [], forcedSales: [] });
  expect(await engine.turningPoint()).toBeNull();
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

test("a request made on the match day goes with the round and is answered after the final whistle", async () => {
  const engine = await onMatchDay();
  const { coachClubId } = await engine.read(["coachClubId"]);
  const playerId = await ownPlayerOf(engine, coachClubId ?? "");
  const request = { kind: "renew", playerId, years: 2 } as const;
  await engine.ask(request);
  await engine.startRound({});
  await engine.finishRound();
  const desk = await engine.desk();
  expect(desk.pending).toEqual([]);
  expect(desk.answers.map((answer) => answer.request)).toEqual([request]);
});

test("a request withdrawn during the round is not decided at the final whistle", async () => {
  const engine = await onMatchDay();
  const { coachClubId } = await engine.read(["coachClubId"]);
  const playerId = await ownPlayerOf(engine, coachClubId ?? "");
  await engine.ask({ kind: "renew", playerId, years: 2 });
  await engine.startRound({});
  await engine.withdraw(playerId);
  await engine.finishRound();
  expect(await engine.desk()).toMatchObject({ pending: [], answers: [] });
});

test("a request changed during the round is decided once, as changed", async () => {
  const engine = await onMatchDay();
  const { coachClubId } = await engine.read(["coachClubId"]);
  const playerId = await ownPlayerOf(engine, coachClubId ?? "");
  await engine.ask({ kind: "renew", playerId, years: 2 });
  await engine.startRound({});
  await engine.ask({ kind: "renew", playerId, years: 4 });
  await engine.finishRound();
  const desk = await engine.desk();
  expect(desk.pending).toEqual([]);
  expect(desk.answers.map((answer) => answer.request)).toEqual([{ kind: "renew", playerId, years: 4 }]);
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

test("a round left mid-match comes back at the furthest minute shown, and no change can go back before it", async () => {
  const engine = await onMatchDay();
  await engine.startRound({});
  await engine.seeMinute(89);
  await engine.seeMinute(40);
  expect((await engine.liveRound())?.seenMinute).toBe(89);
  await expect(engine.changeLive(10, { posture: "attacking" })).rejects.toThrow("a change can't come before minute 89");
  await expect(engine.changeLive(89, { posture: "attacking" })).resolves.toMatchObject({ seenMinute: 89 });
});

test("a save made mid-match brings the round back at the furthest minute shown, and no change can go back before it", async () => {
  const engine = await onMatchDay();
  await engine.startRound({});
  await engine.seeMinute(60);
  const round = await engine.liveRound();
  const save = await engine.save();
  await engine.newGame(8, { coachClubId: "bahia-ba" });
  await engine.load(save);
  expect(await engine.liveRound()).toEqual(round);
  await expect(engine.changeLive(30, { posture: "attacking" })).rejects.toThrow("a change can't come before minute 60");
  const reloaded = await engine.finishRound();
  const twin = await onMatchDay();
  await twin.startRound({});
  expect(reloaded).toEqual(await twin.finishRound());
});

test("a save from before the live round was saved loads with no round under way", async () => {
  const engine = await onMatchDay();
  await engine.startRound({});
  const older: Record<string, unknown> = JSON.parse(await engine.save());
  delete older.live;
  await engine.load(JSON.stringify(older));
  expect(await engine.liveRound()).toBeNull();
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

test("playing past the last day of the season leaves its review waiting until the coach closes it", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "flamengo-rj" });
  expect(await engine.turningPoint()).toBeNull();
  const { date } = await engine.advance(Array.from({ length: 364 }, () => ({})));
  expect(date).toBe("2026-12-31");
  await engine.playToMatchDay();
  const seen = [];
  for (let point = await engine.turningPoint(); point; point = await engine.turningPoint()) {
    seen.push(point);
    await engine.closeTurningPoint();
  }
  expect(seen.at(-1)).toMatchObject({ kind: "seasonEnd", review: { season: 2026 } });
  expect(await engine.read(["season"])).toEqual({ season: 2027 });
});

test("a save keeps the turning point the coach has not closed yet", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "flamengo-rj" });
  await engine.advance(Array.from({ length: 365 }, () => ({})));
  const point = await engine.turningPoint();
  expect(point).toMatchObject({ kind: "seasonEnd", review: { season: 2026 } });
  const save = await engine.save();
  await engine.newGame(8, { coachClubId: "flamengo-rj" });
  await engine.load(save);
  expect(await engine.turningPoint()).toEqual(point);
});

test("a new game starts with no turning point waiting", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: "flamengo-rj" });
  await engine.advance(Array.from({ length: 364 }, () => ({})));
  await engine.playToMatchDay();
  await engine.newGame(7, { coachClubId: "flamengo-rj" });
  expect(await engine.turningPoint()).toBeNull();
});

test("declining an offer takes it off the table and keeps the others", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: null, careerMode: true });
  const [declined, ...kept] = (await engine.read(["coach"])).coach.offers;
  await engine.declineOffer(declined?.clubId ?? "");
  expect((await engine.read(["coach"])).coach.offers).toEqual(kept);
});

test("an offer can't be declined while a round is under way, since the final whistle would undo it", async () => {
  const engine = await onMatchDay();
  await engine.startRound({});
  await expect(engine.declineOffer("flamengo-rj")).rejects.toThrow("an offer can't be declined while a match day is under way");
});

test("requests waiting on the desk are dropped when the coach changes club, so the new board never decides them", async () => {
  const engine = startEngine();
  await engine.newGame(7, { coachClubId: null, careerMode: true });
  const [offer] = (await engine.read(["coach"])).coach.offers;
  if (!offer) throw new Error("a career game starts with offers");
  await engine.ask({ kind: "sign", playerId: await ownPlayerOf(engine, "palmeiras-sp") });
  await engine.advance([{ acceptOffer: offer.clubId }]);
  expect((await engine.read(["coachClubId"])).coachClubId).toBe(offer.clubId);
  expect((await engine.desk()).pending).toEqual([]);
  await engine.playToMatchDay();
  expect((await engine.desk()).answers).toEqual([]);
});
