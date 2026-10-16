import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import type { HotSeatView } from "../hub/hotSeat.js";
import type { InboxLine } from "../hub/inboxLines.js";
import type { BoardAnswer } from "../market/boardDesk.js";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession, type CommandResults, type CommandType, type GameCommand } from "./createEngineSession.js";

const ANA = { name: "Ana", clubId: "flamengo-rj" };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };
// The season needs both boards to keep their coach all year.
const SEED = 3;
const CLOCK_SECONDS = 300;
const MAX_STEPS = 800;

const twoCoaches = { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] }, marketClockSeconds: CLOCK_SECONDS };

type Applied = { command: GameCommand; result: unknown };

function recordedSession() {
  const session = createEngineSession(bundledGameFiles);
  const applied: Applied[] = [];
  function apply<T extends CommandType>(command: GameCommand<T>): CommandResults[T];
  function apply(command: GameCommand): unknown {
    const result = session.apply(command);
    applied.push({ command, result });
    return result;
  }
  return { session, applied, apply };
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function seatedOf(view: HotSeatView | null) {
  const coach = view?.coaches[view.seated];
  if (!view || !coach) throw new Error("a hot-seat game has a coach in the seat");
  return coach;
}

/** A season of two hot-seat coaches through commands alone: each takes his turn, the last one plays the day. */
function playHotSeatSeason() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: twoCoaches });

  const { players } = session.read(["players"]);
  const brunoRenewal = Object.values(players).find((p) => p.clubId === BRUNO.clubId && p.contractUntil === "2026-12-31");
  if (!brunoRenewal) throw new Error("Bruno's club has a contract to renew");

  let anasReserve: { playerId: string; appsBefore: number } | null = null;
  let anasReserveAppsAfter: number | null = null;
  let brunoAsked = false;
  let brunoAnswer: BoardAnswer | undefined;
  let anaDeskAnswers: BoardAnswer[] = [];
  let brunoNews: InboxLine[] = [];
  const seatedAtTurns: string[] = [];
  let rounds = 0;

  for (let step = 0; step < MAX_STEPS && session.read(["season"]).season === 2026; step++) {
    for (let point = session.turningPoint(); point; point = session.turningPoint()) apply({ type: "closeTurningPoint" });
    const view = session.hotSeat();
    const seated = seatedOf(view);
    seatedAtTurns.push(seated.name);
    if (!view?.isLastTurn) {
      if (seated.playsToday && !anasReserve) {
        const plan = session.matchDayPlan();
        const { history } = session.read(["history"]);
        const reserve = plan.squad.find((p) => p.group !== "GK" && p.status === null && !plan.lineup.includes(p.id));
        const benched = plan.lineup.find((id) => plan.squad.find((p) => p.id === id)?.group === reserve?.group);
        if (!reserve || !benched) throw new Error("Ana has a reserve to start");
        anasReserve = { playerId: reserve.id, appsBefore: history.players[ANA.clubId]?.[reserve.id]?.apps ?? 0 };
        apply({ type: "passTurn", lineup: plan.lineup.map((id) => (id === benched ? reserve.id : id)) });
      } else apply({ type: "passTurn" });
      continue;
    }
    if (!brunoAsked) {
      apply({ type: "ask", request: { kind: "renew", playerId: brunoRenewal.id, years: 2 } });
      brunoAsked = true;
    }
    brunoAnswer ??= session.desk().answers.find((answer) => answer.request.playerId === brunoRenewal.id);
    if (!brunoNews.length) brunoNews = session.inbox();
    const played = apply({ type: "playToMatchDay" });
    if (played.daysPlayed > 0) continue;
    apply({ type: "startRound" });
    apply({ type: "finishRound" });
    rounds++;
    if (anasReserve && anasReserveAppsAfter === null) {
      anasReserveAppsAfter = session.read(["history"]).history.players[ANA.clubId]?.[anasReserve.playerId]?.apps ?? 0;
      anaDeskAnswers = session.desk().answers;
    }
  }
  return { recorded, anasReserve, anasReserveAppsAfter, brunoRenewal: brunoRenewal.id, brunoAnswer, anaDeskAnswers, brunoNews, seatedAtTurns, rounds };
}

/** One step of a hot-seat game: the seated coach passes, or, last of the turn, plays on and plays the round when it is today. */
function playOn(session: ReturnType<typeof createEngineSession>) {
  if (!session.hotSeat()?.isLastTurn) {
    session.apply({ type: "passTurn" });
    return;
  }
  if (session.apply({ type: "playToMatchDay" }).daysPlayed > 0) return;
  session.apply({ type: "startRound" });
  session.apply({ type: "finishRound" });
}

let season: ReturnType<typeof playHotSeatSeason>;

beforeAll(() => {
  season = playHotSeatSeason();
}, 600_000);

test("two hot-seat coaches play a season through commands, and the year turns with both in turn order", () => {
  const { session } = season.recorded;
  expect(session.read(["season"]).season).toBe(2027);
  expect(season.rounds).toBeGreaterThan(30);
  expect(session.hotSeat()?.coaches.map((coach) => coach.name)).toEqual([ANA.name, BRUNO.name]);
});

test("the coaches take their turns in order, the first one in the seat after every day played", () => {
  const turns = season.seatedAtTurns;
  expect(turns[0]).toBe(ANA.name);
  for (let index = 1; index < turns.length; index++) {
    if (turns[index - 1] === ANA.name) expect(turns[index]).toBe(BRUNO.name);
  }
});

test("the eleven a coach picks on his turn takes the field when the last coach plays the round", () => {
  expect(season.anasReserve).not.toBeNull();
  expect(season.anasReserveAppsAfter).toBe((season.anasReserve?.appsBefore ?? 0) + 1);
});

test("a waiting coach's request reaches his board and its answer lands on his desk only", () => {
  expect(season.brunoAnswer?.request.playerId).toBe(season.brunoRenewal);
  expect(season.anaDeskAnswers.some((answer) => answer.request.playerId === season.brunoRenewal)).toBe(false);
});

test("each coach reads his own club's news", () => {
  expect(season.brunoNews.length).toBeGreaterThan(0);
});

test("the hot-seat season replays alike from its commands sent through JSON", () => {
  const { session, applied } = season.recorded;
  const twin = createEngineSession(bundledGameFiles);
  for (const { command } of applied) twin.apply(JSON.parse(JSON.stringify(command)));
  expect(sha256(twin.save())).toBe(sha256(session.save()));
});

test("only the last coach of the turn plays the day, and the last coach can't pass", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: twoCoaches });
  expect(() => session.apply({ type: "playToMatchDay" })).toThrow("before the last coach's turn");
  expect(() => session.apply({ type: "advance", days: [{}] })).toThrow("before the last coach's turn");
  expect(() => session.apply({ type: "startRound" })).toThrow("before the last coach's turn");
  const next = session.apply({ type: "passTurn" });
  expect(seatedOf(next).name).toBe(BRUNO.name);
  expect(session.read(["coachClubId"]).coachClubId).toBe(BRUNO.clubId);
  expect(() => session.apply({ type: "passTurn" })).toThrow("the last coach of the turn plays the day instead");
  expect(session.apply({ type: "playToMatchDay" }).daysPlayed).toBeGreaterThan(0);
  expect(seatedOf(session.hotSeat()).name).toBe(ANA.name);
});

test("a save in the middle of a turn loads with the same coach in the seat and the same turn", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: twoCoaches });
  session.apply({ type: "ask", request: { kind: "renew", playerId: Object.values(session.read(["players"]).players).find((p) => p.clubId === ANA.clubId)?.id ?? "", years: 1 } });
  session.apply({ type: "passTurn" });
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: session.saveShards() });
  expect(loaded.hotSeat()).toEqual(session.hotSeat());
  expect(JSON.parse(loaded.save())).toEqual(JSON.parse(session.save()));
  loaded.apply({ type: "playToMatchDay" });
  expect(seatedOf(loaded.hotSeat()).name).toBe(ANA.name);
  expect(loaded.desk().pending).toEqual([]);
});

test("the market clock runs only on market screens' time inside a window, per coach, and at zero stops new signings", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: twoCoaches });
  expect(session.marketClock()).toBeNull();
  expect(session.apply({ type: "spendMarketTime", seconds: 60 })).toBeNull();
  for (let step = 0; step < 40 && (session.marketClock() === null || seatedOf(session.hotSeat()).name !== ANA.name); step++) playOn(session);
  expect(seatedOf(session.hotSeat()).name).toBe(ANA.name);
  expect(session.marketClock()).toEqual({ budgetSeconds: CLOCK_SECONDS, leftSeconds: CLOCK_SECONDS });
  const { players } = session.read(["players"]);
  const own = Object.values(players).find((p) => p.clubId === ANA.clubId);
  const other = Object.values(players).find((p) => p.clubId === "santos-sp");
  if (!own || !other) throw new Error("both clubs have players");
  expect(session.apply({ type: "spendMarketTime", seconds: 40, playerId: own.id })).toEqual({ budgetSeconds: CLOCK_SECONDS, leftSeconds: CLOCK_SECONDS });
  expect(session.apply({ type: "spendMarketTime", seconds: 40, playerId: other.id })).toEqual({ budgetSeconds: CLOCK_SECONDS, leftSeconds: 260 });
  expect(session.apply({ type: "spendMarketTime", seconds: 1_000 })).toEqual({ budgetSeconds: CLOCK_SECONDS, leftSeconds: 0 });
  expect(() => session.apply({ type: "ask", request: { kind: "sign", playerId: other.id } })).toThrow("the market clock has run out");
  expect(session.apply({ type: "ask", request: { kind: "sell", playerId: own.id } }).pending.map((r) => r.playerId)).toEqual([own.id]);
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: session.save() });
  expect(loaded.marketClock()?.leftSeconds).toBe(0);
  session.apply({ type: "passTurn" });
  expect(session.marketClock()).toEqual({ budgetSeconds: CLOCK_SECONDS, leftSeconds: CLOCK_SECONDS });
});

test("a one-coach game has no turns to pass and no clock unless asked for one", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: { coachClubId: ANA.clubId } });
  expect(session.hotSeat()).toBeNull();
  expect(() => session.apply({ type: "passTurn" })).toThrow("a one-coach game has no turns to pass");
  expect(JSON.parse(session.save())).not.toHaveProperty("seats");
  expect(JSON.parse(session.save())).not.toHaveProperty("clock");
});

test("a waiting coach substitutes live in his own match, and his change survives a save mid-round", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: twoCoaches });
  let anasSide = null;
  for (let step = 0; step < 60 && !anasSide; step++) {
    if (!session.hotSeat()?.isLastTurn) {
      session.apply({ type: "passTurn" });
      continue;
    }
    if (session.apply({ type: "playToMatchDay" }).daysPlayed > 0) continue;
    const round = session.apply({ type: "startRound" });
    anasSide = round.humanSides?.find((side) => side.clubId === ANA.clubId) ?? null;
    if (!anasSide) session.apply({ type: "finishRound" });
  }
  if (!anasSide) throw new Error("Ana plays a round while Bruno sits");
  expect(session.read(["coachClubId"]).coachClubId).toBe(BRUNO.clubId);
  expect(anasSide).toMatchObject({ coachName: ANA.name, incidentHandling: "askCoach" });
  const offId = anasSide.starters.at(-1) ?? "";
  const onId = anasSide.benchIds[0] ?? "";
  session.apply({ type: "seeMinute", minute: 40 });
  const changed = session.apply({ type: "changeLive", minute: 40, change: { substitutions: [{ offId, onId }] }, clubId: ANA.clubId });
  const anasMatch = changed.matches.find((m) => m.fixtureId === anasSide.fixtureId);
  expect(anasMatch?.events).toContainEqual({ type: "substitution", minute: 40, clubId: ANA.clubId, playerId: onId, offId });
  expect(changed.humanSides?.find((side) => side.clubId === ANA.clubId)?.lastChangeMinute).toBe(40);

  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: session.saveShards() });
  expect(loaded.liveRound()).toEqual(session.liveRound());
  const { history } = session.read(["history"]);
  const appsBefore = history.players[ANA.clubId]?.[onId]?.apps ?? 0;
  loaded.apply({ type: "finishRound" });
  expect(loaded.read(["history"]).history.players[ANA.clubId]?.[onId]?.apps).toBe(appsBefore + 1);
});

test("each hot-seat coach meets his own club's events on his turn and answers them himself", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: twoCoaches });
  const answeredBy = new Set<string>();
  for (let step = 0; step < MAX_STEPS && answeredBy.size < 2; step++) {
    const view = session.hotSeat();
    const seated = seatedOf(view);
    const pending = session.pendingEvent();
    if (pending) {
      expect(pending.clubId).toBe(seated.clubId);
      const answered = session.apply({ type: "answerEvent", choice: pending.choices.length - 1 });
      expect(answered).toMatchObject({ clubId: seated.clubId, byAssistant: false });
      expect(session.pendingEvent()).toBeNull();
      answeredBy.add(seated.name);
    }
    if (!view?.isLastTurn) session.apply({ type: "passTurn" });
    else {
      // Days played hand the seat back to the first coach; on the match day itself the last one kicks off.
      const played = session.apply({ type: "playToMatchDay" });
      if (played.stop === "matchDay" && played.daysPlayed === 0) {
        session.apply({ type: "startRound" });
        session.apply({ type: "finishRound" });
      }
    }
    for (let point = session.turningPoint(); point; point = session.turningPoint()) session.apply({ type: "closeTurningPoint" });
  }
  expect([...answeredBy].sort()).toEqual([ANA.name, BRUNO.name]);
}, 120_000);
