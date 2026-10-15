import { createHash } from "node:crypto";
import { addDays } from "@boleiro/engine/sim/dates";
import { freeFriendlyDates, friendlyAnswer } from "@boleiro/engine/sim/friendlies/friendlies";
import type { SimPlayer } from "@boleiro/engine/sim/gameState";
import type { BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { sellerPrice } from "@boleiro/engine/sim/transfers/askingPrice";
import { beforeAll, expect, test } from "vitest";
import type { TurningPoint } from "../hub/turningPoints.js";
import type { BoardAnswer } from "../market/boardDesk.js";
import type { LiveRound } from "../round/liveRoundOf.js";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession, type CommandResults, type CommandType, type GameCommand } from "./createEngineSession.js";

const CLUB = "flamengo-rj";
const SEED = 7;
// The season test needs a coach the board keeps all year; the board sacks him on seeds 1, 7 and 8 of today's engine.
const SEASON_SEED = 2;
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

let season: Season;
let career: ReturnType<typeof playCareerStart>;
let marketWindow: ReturnType<typeof playMarketWindow>;
let money: ReturnType<typeof playMoney>;

beforeAll(() => {
  season = playSeason();
  career = playCareerStart();
  marketWindow = playMarketWindow();
  money = playMoney();
}, 120_000);

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

test("the season, career, market, money and hot-seat logs between them send every kind of command", () => {
  const logs = [season, career, marketWindow, money, playHotSeatTurn()].flatMap(({ recorded }) => recorded.applied);
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
    passTurn: true,
    spendMarketTime: true,
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
