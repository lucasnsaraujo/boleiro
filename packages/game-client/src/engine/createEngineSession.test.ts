import { createHash } from "node:crypto";
import { addDays } from "@boleiro/engine/sim/dates";
import { freeFriendlyDates, friendlyAnswer } from "@boleiro/engine/sim/friendlies/friendlies";
import type { SimPlayer } from "@boleiro/engine/sim/gameState";
import type { BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { sellerPrice } from "@boleiro/engine/sim/transfers/askingPrice";
import { beforeAll, expect, test } from "vitest";
import type { TurningPoint } from "../hub/turningPoints.js";
import type { BoardAnswer } from "../market/boardDesk.js";
import { NO_FILTERS } from "../market/marketFilters.js";
import type { LiveRound } from "../round/liveRoundOf.js";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession, type CommandResults, type CommandType, type GameCommand } from "./createEngineSession.js";

const CLUB = "flamengo-rj";
const SEED = 7;
// The season test needs a coach the board keeps all year, and the events test an event that asks him within it: seed 8 gives both on today's engine.
const SEASON_SEED = 8;
// Enough steps for a season of play-ons and match days; a stuck loop fails instead of hanging.
const MAX_STEPS = 400;

type Applied = { command: GameCommand; result: unknown };

/** A session that keeps every command it applies and what each returned, in order. */
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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function answerFor(answers: readonly BoardAnswer[], playerId: string): BoardAnswer | undefined {
  return answers.find((answer) => answer.request.playerId === playerId);
}

type Season = {
  recorded: ReturnType<typeof recordedSession>;
  signingId: string;
  signingAnswer: BoardAnswer | undefined;
  signingClubAfterAnswer: string | undefined;
  renewal: { playerId: string; until: string; wage: number };
  renewalAnswer: BoardAnswer | undefined;
  renewedPlayer: SimPlayer | undefined;
  pendingAfterWithdraw: readonly string[];
  lineup: string[];
  kickOff: LiveRound;
  substitution: { offId: string; onId: string };
  afterSubstitution: LiveRound;
  turningPoints: TurningPoint[];
};

/** The coach's players, weakest first. */
function ownPlayers(players: Record<string, SimPlayer>): SimPlayer[] {
  return Object.values(players)
    .filter((p) => p.clubId === CLUB)
    .sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id));
}

/** Plays the first season from a new game to the rollover, sending only commands. */
function playSeason(): Season {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEASON_SEED, choices: { coachClubId: CLUB } });

  const { players, clubs, market } = session.read(["players", "clubs", "market"]);
  const signing = Object.values(players)
    .filter((p) => p.clubId !== CLUB && clubs[p.clubId]?.division === "C" && p.contractUntil > "2026-12-31" && !market.loans[p.id])
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))[0];
  if (!signing) throw new Error("a Série C club has a player to sign");
  apply({ type: "ask", request: { kind: "sign", playerId: signing.id } });

  const own = ownPlayers(players);
  const renewing = own.find((p) => p.contractUntil === "2026-12-31") ?? own[0];
  const sold = own.find((p) => p.id !== renewing?.id);
  if (!renewing || !sold) throw new Error("the coach's club has players");
  apply({ type: "ask", request: { kind: "renew", playerId: renewing.id, years: 3 } });
  apply({ type: "ask", request: { kind: "sell", playerId: sold.id } });
  const desk = apply({ type: "withdraw", playerId: sold.id });

  let signingAnswer: BoardAnswer | undefined;
  let signingClubAfterAnswer: string | undefined;
  let renewalAnswer: BoardAnswer | undefined;
  let renewedPlayer: SimPlayer | undefined;
  let firstMatch: Pick<Season, "lineup" | "kickOff" | "substitution" | "afterSubstitution"> | null = null;
  let hasReloaded = false;
  const turningPoints: TurningPoint[] = [];
  /** Offers for his players wait for his answer as soon as he sees them: he takes Europe's, as the board used to on its own, and turns down the rest. */
  const answerOffers = () => {
    for (const bid of Object.values(session.read(["market"]).market.coach?.bids ?? {})) {
      apply({ type: "answerBid", playerId: bid.playerId, answer: { kind: bid.buyerId === null ? "accept" : "decline" } });
    }
  };

  for (let step = 0; step < MAX_STEPS && session.read(["season"]).season === 2026; step++) {
    const { stop } = apply({ type: "playToMatchDay" });
    answerOffers();
    const answers = session.desk().answers;
    if (!signingAnswer) {
      signingAnswer = answerFor(answers, signing.id);
      signingClubAfterAnswer = session.read(["players"]).players[signing.id]?.clubId;
    }
    if (!renewalAnswer) {
      renewalAnswer = answerFor(answers, renewing.id);
      renewedPlayer = session.read(["players"]).players[renewing.id];
    }

    if (stop === "matchDay" && !firstMatch) {
      const plan = session.matchDayPlan();
      const benched = plan.lineup.find((id) => plan.squad.find((p) => p.id === id)?.group === "ATT");
      const promoted = plan.squad.find((p) => p.group === "ATT" && p.status === null && !plan.lineup.includes(p.id));
      if (!benched || !promoted) throw new Error("the coach has a forward to swap");
      const lineup = plan.lineup.map((id) => (id === benched ? promoted.id : id));
      const kickOff = apply({ type: "startRound", lineup, tactics: { ...plan.tactics, posture: "attacking" } });
      const onId = kickOff.coach?.benchIds[0];
      if (!onId) throw new Error("the coach has a bench");
      const substitution = { offId: promoted.id, onId };
      apply({ type: "seeMinute", minute: 30 });
      const afterSubstitution = apply({ type: "changeLive", minute: 60, change: { substitutions: [substitution] } });
      apply({ type: "finishRound" });
      answerOffers();
      firstMatch = { lineup, kickOff, substitution, afterSubstitution };
    } else if (stop === "matchDay") {
      apply({ type: "startRound" });
      apply({ type: "finishRound" });
      answerOffers();
    }

    for (let point = session.turningPoint(); point; point = session.turningPoint()) {
      turningPoints.push(point);
      apply({ type: "closeTurningPoint" });
    }

    if (!hasReloaded && session.read(["date"]).date >= "2026-07-01") {
      apply({ type: "advance", days: [{}] });
      apply({ type: "load", save: session.save() });
      hasReloaded = true;
    }
  }
  if (!firstMatch) throw new Error("the coach played a match");

  return {
    recorded,
    signingId: signing.id,
    signingAnswer,
    signingClubAfterAnswer,
    renewal: { playerId: renewing.id, until: renewing.contractUntil, wage: renewing.wage },
    renewalAnswer,
    renewedPlayer,
    pendingAfterWithdraw: desk.pending.map((request) => request.playerId),
    ...firstMatch,
    turningPoints,
  };
}

/**
 * Feeds a fresh session the same commands, each sent through JSON as it would cross a wire. A load
 * overwrites the game, so the hash of the session's own save just before each load is kept too.
 */
function replay(applied: readonly Applied[]) {
  const session = createEngineSession(bundledGameFiles);
  const savesBeforeLoad: string[] = [];
  const results = applied.map(({ command }) => {
    const sent: GameCommand = JSON.parse(JSON.stringify(command));
    if (sent.type === "load") savesBeforeLoad.push(sha256(session.save()));
    return session.apply(sent);
  });
  return { session, results, savesBeforeLoad };
}

function loadedSaves(applied: readonly Applied[]): string[] {
  return applied.flatMap(({ command }) => (command.type === "load" ? [sha256(typeof command.save === "string" ? command.save : JSON.stringify(command.save))] : []));
}

/** A career start: one offer turned down, another signed, then on to the first stop. */
function playCareerStart() {
  const recorded = recordedSession();
  recorded.apply({ type: "newGame", seed: SEED, choices: { coachClubId: null, careerMode: true } });
  const [declined, signed] = recorded.session.read(["coach"]).coach.offers;
  if (!declined || !signed) throw new Error("a career game starts with two offers or more");
  recorded.apply({ type: "declineOffer", clubId: declined.clubId });
  recorded.apply({ type: "advance", days: [{ acceptOffer: signed.clubId }] });
  recorded.apply({ type: "playToMatchDay" });
  return { recorded, declined: declined.clubId, signed: signed.clubId };
}

/** A coach who walks out of his club, applies for a job (his old club's, which won't have him back) and plays on unemployed. */
function playCoachMoves() {
  const recorded = recordedSession();
  recorded.apply({ type: "newGame", seed: SEED, choices: { coachClubId: "bahia-ba" } });
  recorded.apply({ type: "advance", days: [{}, {}] });
  recorded.apply({ type: "resign" });
  const answer = recorded.apply({ type: "applyForJob", clubId: "bahia-ba" });
  recorded.apply({ type: "advance", days: [{}, {}, {}] });
  return { recorded, answer, page: recorded.session.coaches() };
}

/**
 * The coach's own market in the January window: weak players listed cheap, one put at auction and
 * taken off, an offer under a club's price that draws its counter, which he turns down, and the first
 * club's offer for one of his players, which he counters and then settles.
 */
function playMarketWindow() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  apply({ type: "priceTickets", price: 60 });
  const stadiumAnswer = apply({ type: "askStadiumWorks", seats: 2_000 });
  apply({ type: "advance", days: Array.from({ length: 5 }, () => ({})) });
  const { players, clubs, market, date } = session.read(["players", "clubs", "market", "date"]);
  const own = ownPlayers(players);
  for (const player of own.slice(0, 8)) apply({ type: "listPlayer", playerId: player.id, way: "cheap" });
  const auctioned = own[8];
  if (!auctioned) throw new Error("the coach's club has players");
  apply({ type: "listPlayer", playerId: auctioned.id, way: "auction" });
  apply({ type: "listPlayer", playerId: auctioned.id, way: null });

  const target = Object.values(players)
    .filter((p) => clubs[p.clubId]?.division === "B" && p.contractUntil > "2026-12-31" && !market.loans[p.id])
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))[0];
  if (!target) throw new Error("a Série B club has a player to buy");
  const sellerSquad = Object.values(players).filter((p) => p.clubId === target.clubId);
  const price = sellerPrice(target, sellerSquad, "B", addDays(date, 1), market.eurBrl);
  apply({ type: "advance", days: [{ requests: [{ kind: "sign", playerId: target.id, fee: Math.round(price * 0.8) }] }] });
  const counter = session.read(["market"]).market.coach?.counters[target.id];
  if (counter) apply({ type: "declineCounter", playerId: target.id });

  const outcomes: BidOutcome[] = [];
  for (let day = 0; day < 30 && !outcomes.length; day++) {
    apply({ type: "advance", days: [{}] });
    const [bid] = Object.values(session.read(["market"]).market.coach?.bids ?? {});
    if (!bid) continue;
    const answer = apply({ type: "answerBid", playerId: bid.playerId, answer: { kind: "counter", fee: Math.round(bid.fee * 1.05) } });
    outcomes.push(answer);
    if (answer === "finalOffer") outcomes.push(apply({ type: "answerBid", playerId: bid.playerId, answer: { kind: "accept" } }));
  }
  return { recorded, counter, outcomes, counterAfterDecline: session.read(["market"]).market.coach?.counters[target.id], stadiumAnswer };
}

/** The coach's money: a bank loan taken, a friendly booked at home and played, then the loan paid off. */
function playMoney() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  const loan = apply({ type: "takeBankLoan", amount: 30_000_000, months: 24 });
  const booking = session.read(["date", "season", "fixtures", "competitions", "clubs", "finances", "friendlies", "coachClubId"]);
  const opponentId = "vasco-rj";
  const date = freeFriendlyDates(booking).find((d) => friendlyAnswer(booking, opponentId, d, true).booked);
  if (!date) throw new Error("Flamengo has a free date for a friendly");
  const friendly = apply({ type: "bookFriendly", opponentId, date, isHome: true });
  const days = apply({ type: "advance", days: Array.from({ length: 70 }, () => ({})) });
  const played = days.events.find((event) => event.type === "friendlyPlayed");
  const cashBeforeRepay = session.read(["finances"]).finances[CLUB]?.cash ?? 0;
  apply({ type: "repayBankLoan" });
  return { recorded, loan, friendly, played, cashBeforeRepay };
}

/** A new game's academy moves through commands, then the days to the Copinha. */
function playAcademy() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  // Into the January window, where a kid can be sold.
  apply({ type: "advance", days: Array.from({ length: 4 }, () => ({})) });
  const { youth } = session.read(["youth"]);
  const kids = Object.values(youth?.prospects ?? {});
  const [promoted, released, sold] = kids.filter((p) => p.clubId === CLUB).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const otherClubs = kids.find((p) => p.clubId !== CLUB);
  if (!promoted || !released || !sold || !otherClubs) throw new Error("the academies have kids");
  const answers = {
    promoted: apply({ type: "promoteProspect", prospectId: promoted.id }),
    released: apply({ type: "releaseProspect", prospectId: released.id }),
    sold: apply({ type: "sellProspect", prospectId: sold.id }),
    otherClubs: apply({ type: "promoteProspect", prospectId: otherClubs.id }),
  };
  const days = apply({ type: "advance", days: Array.from({ length: 22 }, () => ({})) });
  return { recorded, ids: { promoted: promoted.id, released: released.id, sold: sold.id }, answers, copinha: days.events.find((event) => event.type === "copinhaPlayed") };
}

/** A hot-seat turn: the first coach spends time on the market and passes, the second plays on. */
function playHotSeatTurn() {
  const recorded = recordedSession();
  recorded.apply({
    type: "newGame",
    seed: SEED,
    choices: { coachClubId: CLUB, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] }, marketClockSeconds: 300 },
  });
  recorded.apply({ type: "spendMarketTime", seconds: 30 });
  recorded.apply({ type: "passTurn" });
  recorded.apply({ type: "playToMatchDay" });
  return { recorded };
}

const STRIKERS = { ...NO_FILTERS, group: "ATT" as const, minStrength: 70 };

/** A hot-seat game whose two coaches each watch a player and save a search, one of them forgetting another. */
function playScouting() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({
    type: "newGame",
    seed: SEED,
    choices: { coachClubId: CLUB, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] } },
  });
  const { players } = session.read(["players"]);
  const [first, second] = Object.values(players).filter((p) => p.clubId === "vitoria-ba");
  if (!first || !second) throw new Error("Vitória has players");
  apply({ type: "watchPlayer", playerId: first.id, isWatched: true });
  apply({ type: "saveFilter", name: "Atacantes", filters: STRIKERS });
  apply({ type: "saveFilter", name: "Rascunho", filters: NO_FILTERS });
  apply({ type: "deleteFilter", name: "Rascunho" });
  const anas = session.scouting();
  apply({ type: "passTurn" });
  const brunosFirst = session.scouting();
  apply({ type: "watchPlayer", playerId: second.id, isWatched: true });
  return { recorded, anas, brunosFirst, brunos: session.scouting(), watched: [first.id, second.id] as const, save: session.save(), shards: session.saveShards() };
}

/** Plays on until an event asks the coach, answers it, hands one area to the assistant and plays on. */
function playEvents() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  // The board keeps the coach all year on the season's seed, so his club's events keep coming.
  apply({ type: "newGame", seed: SEASON_SEED, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && !session.pendingEvent(); step++) {
    if (apply({ type: "playToMatchDay" }).stop === "matchDay") {
      apply({ type: "startRound" });
      apply({ type: "finishRound" });
    }
  }
  const pending = session.pendingEvent();
  if (!pending) throw new Error("an event asks the coach within a season");
  const before = session.read(["mood", "boards", "finances"]);
  const answered = apply({ type: "answerEvent", choice: 0 });
  const after = session.read(["mood", "boards", "finances"]);
  const inbox = session.inbox();
  apply({ type: "handToAssistant", area: "press", isHanded: true });
  apply({ type: "setAssistantDuty", duty: "contracts", isOn: false });
  const [candidate] = session.assistant().candidates;
  if (!candidate) throw new Error("the coach can call another assistant");
  apply({ type: "hireAssistant", candidateId: candidate.id });
  apply({ type: "fireAssistant" });
  apply({ type: "playToMatchDay" });
  return { recorded, pending, answered, before, after, inbox };
}

/** Names the coach's least likely captain, plays to the next match day and saves. */
function playCaptain() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  const before = session.chemistry();
  const kid = before?.candidates.at(-1);
  if (!before || !kid) throw new Error("the coach's club has a chemistry screen");
  apply({ type: "nameCaptain", playerId: kid.playerId });
  const named = session.chemistry();
  apply({ type: "playToMatchDay" });
  const plan = session.matchDayPlan();
  return { recorded, before, kid, named, plan, save: session.save() };
}

/** Retires one of the coach's players and asks a veteran who announced his last season to stay. */
function playPlayerLife() {
  const recorded = recordedSession();
  const { session, apply } = recorded;
  apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  const [retiring, veteran] = Object.values(session.read(["players"]).players).filter((p) => p.clubId === CLUB);
  if (!retiring || !veteran) throw new Error("the coach's club has players");
  apply({ type: "retirePlayer", playerId: retiring.id });
  const saved = JSON.parse(session.save()) as { game: { players: Record<string, SimPlayer> } };
  saved.game.players[veteran.id] = { ...veteran, retiring: { afterSeason: 2026, hasBeenAsked: false } };
  apply({ type: "load", save: JSON.stringify(saved) });
  apply({ type: "persuadeToStay", playerId: veteran.id });
  return { recorded };
}

let season: Season;
let career: ReturnType<typeof playCareerStart>;
let marketWindow: ReturnType<typeof playMarketWindow>;
let money: ReturnType<typeof playMoney>;
let academy: ReturnType<typeof playAcademy>;
let events: ReturnType<typeof playEvents>;
let captain: ReturnType<typeof playCaptain>;
let coachMoves: ReturnType<typeof playCoachMoves>;
let scouting: ReturnType<typeof playScouting>;

beforeAll(() => {
  season = playSeason();
  career = playCareerStart();
  marketWindow = playMarketWindow();
  money = playMoney();
  academy = playAcademy();
  events = playEvents();
  captain = playCaptain();
  coachMoves = playCoachMoves();
  scouting = playScouting();
}, 120_000);

test("a coach who resigns is out of work with his old club's job open, and the club won't take him back", () => {
  const { recorded, answer, page } = coachMoves;
  expect(recorded.session.read(["coachClubId"]).coachClubId).toBeNull();
  expect(answer).toBe("notWelcome");
  expect(page.jobs.find((job) => job.clubId === "bahia-ba")).toMatchObject({ wouldHire: false });
  expect(page.you.stints.at(-1)).toMatchObject({ clubId: "bahia-ba", left: "resigned" });
});

test("the coach-move commands survive JSON and replay alike from the same seed", () => {
  const { session, applied } = coachMoves.recorded;
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});

test("the coach names a captain: the chemistry screen and the lineup sheet show him, a save keeps him, and the meter pays for his lack of standing", () => {
  const { before, kid, named, plan, save } = captain;
  expect(before.captain?.isNamed).toBe(false);
  expect(named?.captain).toMatchObject({ playerId: kid.playerId, isNamed: true });
  expect(named?.value ?? 100).toBeLessThan(before.value);
  expect(plan.chemistry.captainId).toBe(kid.playerId);
  expect(plan.chemistry.suggestedCaptainId).toBe(before.candidates[0]?.playerId);
  const reloaded = createEngineSession(bundledGameFiles);
  reloaded.apply({ type: "load", save });
  expect(reloaded.chemistry()?.captain?.playerId).toBe(kid.playerId);
});

test("each hot-seat coach watches players and saves searches of his own", () => {
  const [anasPlayer, brunosPlayer] = scouting.watched;
  expect(scouting.anas).toEqual({ watchList: [anasPlayer], savedFilters: [{ name: "Atacantes", filters: STRIKERS }] });
  expect(scouting.brunosFirst).toEqual({ watchList: [], savedFilters: [] });
  expect(scouting.brunos.watchList).toEqual([brunosPlayer]);
});

test("a save keeps every coach's scouting, whole or in shards, and a load gives each his own back", () => {
  for (const save of [scouting.save, scouting.shards]) {
    const reloaded = createEngineSession(bundledGameFiles);
    reloaded.apply({ type: "load", save });
    expect(reloaded.scouting()).toEqual(scouting.brunos);
    reloaded.apply({ type: "advance", days: [{}] });
    expect(reloaded.scouting()).toEqual(scouting.anas);
  }
});

test("the scouting commands survive JSON and replay alike from the same seed", () => {
  const { session, applied } = scouting.recorded;
  for (const { command } of applied) expect(JSON.parse(JSON.stringify(command))).toStrictEqual(command);
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});

test("the chemistry screen draws the eleven in its formation with lines between known players", () => {
  const page = captain.before;
  expect(page.players.filter((p) => !p.isReserve)).toHaveLength(11);
  for (const link of page.links) for (const id of link.playerIds) expect(page.players.map((p) => p.id)).toContain(id);
  expect(page.links.some((link) => link.kind === "good")).toBe(true);
  expect(page.reasons.reduce((sum, r) => sum + r.points, 50)).toBe(page.value);
});

test("a captain from another club is refused", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: { coachClubId: CLUB } });
  const other = Object.values(session.read(["players"]).players).find((p) => p.clubId !== CLUB);
  expect(() => session.apply({ type: "nameCaptain", playerId: other?.id ?? "" })).toThrow();
});

test("an event that asks the coach waits for his answer, the answer lands, and the log replays alike", () => {
  const { pending, answered, before, after, recorded, inbox } = events;
  expect(answered).toMatchObject({ type: "eventAnswered", clubId: CLUB, typeId: pending.typeId, choice: 0, byAssistant: false });
  const effects = pending.choices[0]?.effects ?? {};
  const mood = (state: typeof before) => state.mood[CLUB];
  if (effects.morale) expect(mood(after)?.squad).not.toBe(mood(before)?.squad);
  if (effects.fans) expect(mood(after)?.fans).not.toBe(mood(before)?.fans);
  if (effects.money) expect(after.finances[CLUB]?.cash).toBe((before.finances[CLUB]?.cash ?? 0) + effects.money);
  if (effects.board) expect(after.boards[CLUB]?.pressure).not.toBe(before.boards[CLUB]?.pressure);
  if (effects.morale || effects.fans || effects.board || effects.money) expect(after).not.toEqual(before);
  expect(recorded.session.pendingEvent()?.date ?? null).not.toBe(pending.date);
  expect(recorded.session.read(["coach"]).coach.assistantAreas).toEqual(["press"]);
  expect(inbox.some((line) => line.text === answered.headline)).toBe(true);
  const twin = replay(recorded.applied);
  expect(twin.results).toEqual(recorded.applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(recorded.session.save()));
});

test("a season played through commands alone ends, turns the year and crowns a champion", () => {
  const { session } = season.recorded;
  const review = season.turningPoints.find((point) => point.kind === "seasonEnd");
  expect(review).toMatchObject({ kind: "seasonEnd", review: { season: 2026, clubId: CLUB } });
  expect(session.read(["season"])).toEqual({ season: 2027 });
  const [record] = session.read(["history"]).history.seasons;
  const champion = record?.tables.A[0];
  expect(champion).toBeDefined();
  expect(Object.values(record?.champions ?? {})).toContain(champion);
  expect(review).toMatchObject({ review: { placing: { division: "A", position: (record?.tables.A.indexOf(CLUB) ?? -1) + 1 } } });
});

test("the coach's own eleven and tactics take the field, and his substitution shows at its minute", () => {
  const { lineup, kickOff, substitution, afterSubstitution } = season;
  expect(kickOff.coach?.starters).toEqual(lineup);
  expect(kickOff.coach?.tactics.posture).toBe("attacking");
  const events = afterSubstitution.matches.find((match) => match.fixtureId === kickOff.coach?.fixtureId)?.events ?? [];
  expect(events).toContainEqual({ type: "substitution", minute: 60, clubId: CLUB, playerId: substitution.onId, offId: substitution.offId });
});

test("a signing asked of the board is answered, and approved it brings the player to the club", () => {
  expect(season.signingAnswer).toMatchObject({ request: { kind: "sign", playerId: season.signingId }, approved: true });
  expect(season.signingClubAfterAnswer).toBe(CLUB);
});

test("a renewal asked of the board extends the player's contract", () => {
  const { renewal, renewalAnswer, renewedPlayer } = season;
  expect(renewalAnswer).toMatchObject({ request: { kind: "renew", playerId: renewal.playerId }, approved: true });
  expect(renewedPlayer?.contractUntil).toBe(`${Math.max(2026, Number(renewal.until.slice(0, 4))) + 3}-12-31`);
  expect(renewedPlayer?.wage).toBeGreaterThanOrEqual(renewal.wage);
});

test("a request withdrawn before the board sees it leaves the desk", () => {
  expect(season.pendingAfterWithdraw).toEqual([season.signingId, season.renewal.playerId]);
});

test("every command survives a JSON round trip unchanged", () => {
  const commands = [...season.recorded.applied, ...career.recorded.applied].map(({ command }) => command);
  for (const command of commands) expect(JSON.parse(JSON.stringify(command))).toStrictEqual(command);
});

test("two sessions fed the same command log from the same seed end in the same save, answering every command alike", () => {
  const { session, applied } = season.recorded;
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(twin.savesBeforeLoad).toHaveLength(1);
  expect(twin.savesBeforeLoad).toEqual(loadedSaves(applied));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
}, 120_000);

test("a career start, an offer turned down and another signed, replays alike from its commands", () => {
  const { session, applied } = career.recorded;
  expect(session.read(["coachClubId"])).toEqual({ coachClubId: career.signed });
  expect(session.read(["coach"]).coach.offers.map((offer) => offer.clubId)).not.toContain(career.declined);
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});

test("an offer under a club's price draws its counter, which the coach can turn down", () => {
  expect(marketWindow.counter).toBeDefined();
  expect(marketWindow.counterAfterDecline).toBeUndefined();
});

test("a club's offer for a listed player waits for the coach, and his counter settles it", () => {
  const [first, second] = marketWindow.outcomes;
  expect(["sold", "finalOffer", "walkedAway"]).toContain(first);
  if (first === "finalOffer") expect(second).toBe("sold");
});

test("the coach's ticket price is in the game his commands leave, and works on the ground he shares are refused", () => {
  const { finances } = marketWindow.recorded.session.read(["finances"]);
  expect(finances[CLUB]?.ticketPrice).toBe(60);
  expect(marketWindow.stadiumAnswer).toMatchObject({ approved: false, reason: "shared", quote: { seats: 2_000 } });
  expect(finances[CLUB]?.stadiumWorks).toBeUndefined();
});

test("the market window's commands survive JSON and replay alike from the same seed", () => {
  const { session, applied } = marketWindow.recorded;
  for (const { command } of applied) expect(JSON.parse(JSON.stringify(command))).toStrictEqual(command);
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});

test("a bank loan taken through a command puts its money in the bank, and a later command pays it off", () => {
  expect(money.loan).toMatchObject({ approved: true, loan: { amount: 30_000_000, balance: 30_000_000, instalmentsLeft: 24 } });
  const { finances } = money.recorded.session.read(["finances"]);
  expect(finances[CLUB]?.bankLoan).toBeUndefined();
  expect(finances[CLUB]?.cash).toBeLessThan(money.cashBeforeRepay);
});

test("a friendly booked through a command is played on its day with its fee paid", () => {
  expect(money.friendly).toMatchObject({ booked: true, friendly: { homeId: CLUB, awayId: "vasco-rj" } });
  expect(money.played).toMatchObject({ type: "friendlyPlayed", friendly: { homeId: CLUB, awayId: "vasco-rj" } });
  const inbox = money.recorded.session.inbox();
  expect(inbox.some((line) => line.text.startsWith("Amistoso: Flamengo"))).toBe(true);
});

test("the money commands survive JSON and replay alike from the same seed", () => {
  const { session, applied } = money.recorded;
  for (const { command } of applied) expect(JSON.parse(JSON.stringify(command))).toStrictEqual(command);
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});

test("the season, career, market, money, academy and hot-seat logs between them send every kind of command", () => {
  const logs = [season, career, marketWindow, money, academy, events, captain, coachMoves, scouting, playHotSeatTurn(), playPlayerLife()].flatMap(({ recorded }) => recorded.applied);
  const sent = new Set(logs.map(({ command }) => command.type));
  const every: Record<CommandType, true> = {
    newGame: true,
    load: true,
    advance: true,
    playToMatchDay: true,
    startRound: true,
    seeMinute: true,
    changeLive: true,
    finishRound: true,
    closeTurningPoint: true,
    declineOffer: true,
    resign: true,
    applyForJob: true,
    ask: true,
    withdraw: true,
    listPlayer: true,
    answerBid: true,
    declineCounter: true,
    priceTickets: true,
    askStadiumWorks: true,
    takeBankLoan: true,
    repayBankLoan: true,
    bookFriendly: true,
    promoteProspect: true,
    releaseProspect: true,
    sellProspect: true,
    passTurn: true,
    spendMarketTime: true,
    answerEvent: true,
    handToAssistant: true,
    setAssistantDuty: true,
    hireAssistant: true,
    fireAssistant: true,
    nameCaptain: true,
    watchPlayer: true,
    saveFilter: true,
    deleteFilter: true,
    retirePlayer: true,
    persuadeToStay: true,
  };
  expect([...sent].sort()).toEqual(Object.keys(every).sort());
});

test("a command of a type the session doesn't know fails instead of reaching anything else", () => {
  const session = createEngineSession(bundledGameFiles);
  for (const type of ["constructor", "toString", "setTicketPrice"]) {
    const forged: GameCommand = JSON.parse(JSON.stringify({ type }));
    expect(() => session.apply(forged)).toThrow(`unknown command: ${type}`);
  }
});

test("a season through commands holds trials at every academy, forces out its 21-year-olds and leaves no club under 18 players", () => {
  const opening = createEngineSession(bundledGameFiles);
  opening.apply({ type: "newGame", seed: SEASON_SEED, choices: { coachClubId: CLUB } });
  const before = Object.values(opening.read(["youth"]).youth?.prospects ?? {});
  const { youth, players, clubs } = season.recorded.session.read(["youth", "players", "clubs"]);
  const after = Object.values(youth?.prospects ?? {});

  // Clubs that joined Série D at the turn open their academy at the next one.
  const academyClubs = new Set(before.map((p) => p.clubId));
  expect(academyClubs.size).toBeGreaterThan(100);
  for (const clubId of academyClubs) {
    const trialists = after.filter((p) => p.clubId === clubId && p.joinedSeason === 2027);
    expect(trialists.length).toBeGreaterThanOrEqual(2);
    expect(trialists.every((p) => p.age === 16)).toBe(true);
  }
  expect(after.every((p) => p.age <= 20)).toBe(true);
  const leaving = before.filter((p) => p.age === 20);
  expect(leaving.length).toBeGreaterThan(0);
  for (const p of leaving) expect(youth?.prospects[p.id]).toBeUndefined();
  expect(leaving.some((p) => players[p.id]?.clubId === p.clubId)).toBe(true);
  expect(leaving.some((p) => !players[p.id])).toBe(true);

  const squadSizes = new Map<string, number>();
  for (const p of Object.values(players)) squadSizes.set(p.clubId, (squadSizes.get(p.clubId) ?? 0) + 1);
  for (const club of Object.values(clubs)) expect(squadSizes.get(club.id) ?? 0).toBeGreaterThanOrEqual(18);
});

test("the coach promotes, releases and sells kids of his academy through commands, but not another club's", () => {
  const { session } = academy.recorded;
  const { players, youth } = session.read(["players", "youth"]);
  expect(academy.answers).toMatchObject({ promoted: { refusal: null }, released: { refusal: null }, sold: { refusal: null }, otherClubs: { refusal: "notYours" } });
  expect(players[academy.ids.promoted]?.clubId).toBe(CLUB);
  expect(players[academy.ids.released]).toBeUndefined();
  expect(players[academy.ids.sold]?.clubId).toBe(academy.answers.sold.sale?.buyerId);
  for (const id of Object.values(academy.ids)) expect(youth?.prospects[id]).toBeUndefined();
});

test("the Copinha is played in January and its champion is kept with the academies", () => {
  const { youth } = academy.recorded.session.read(["youth"]);
  expect(academy.copinha).toEqual({ type: "copinhaPlayed", season: 2026, championId: youth?.copinha?.championId });
});

test("the academy's commands survive JSON and replay alike from the same seed", () => {
  const { session, applied } = academy.recorded;
  for (const { command } of applied) expect(JSON.parse(JSON.stringify(command))).toStrictEqual(command);
  const twin = replay(applied);
  expect(twin.results).toEqual(applied.map(({ result }) => result));
  expect(sha256(twin.session.save())).toBe(sha256(session.save()));
});
