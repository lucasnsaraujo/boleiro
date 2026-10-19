import { describe, expect, it } from "vitest";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { developPlayers, retiresAtSeasonTurn } from "./developPlayers.js";
import { persuadeToStay, retirePlayer } from "./retirement.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(11, { coachClubId: COACH_CLUB });
const withPlayers = (state: GameState, change: (p: SimPlayer) => SimPlayer): GameState => ({
  ...state,
  players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, change(p)])),
});
const minutes = (p: SimPlayer, seasonMinutes: number): SimPlayer => ({ ...p, condition: { ...p.condition, seasonMinutes } });
const retiredIn = (state: GameState) => new Set(developPlayers(state).events.flatMap((e) => (e.type === "playerRetired" ? [e.playerId] : [])));
const veterans = (state: GameState) => Object.values(state.players).filter((p) => p.age >= 33 && p.age <= 37 && p.clubId !== COACH_CLUB);
const shareRetired = (players: readonly SimPlayer[], retired: ReadonlySet<string>) => players.filter((p) => retired.has(p.id)).length / players.length;

/** Every veteran plays a full season except the odd-numbered ones, who barely play; over a few saves. */
function retirementsBy(change: (p: SimPlayer, isOdd: boolean) => SimPlayer, seeds = 6) {
  const odd: number[] = [];
  const even: number[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    const state = withPlayers({ ...start, seed }, (p) => change(p, Number(p.id.replace(/\D/g, "")) % 2 === 1));
    const retired = retiredIn(state);
    const old = veterans(state);
    odd.push(shareRetired(old.filter((p) => Number(p.id.replace(/\D/g, "")) % 2 === 1), retired));
    even.push(shareRetired(old.filter((p) => Number(p.id.replace(/\D/g, "")) % 2 === 0), retired));
  }
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  return { odd: mean(odd), even: mean(even) };
}

describe("AI players' retirement", () => {
  it("comes sooner for veterans who barely played", () => {
    const { odd, even } = retirementsBy((p, isOdd) => minutes(p, isOdd ? 90 : 34 * 90));
    expect(odd).toBeGreaterThan(even * 1.5);
  });

  it("comes later for veterans stronger than their club's level", () => {
    const { odd, even } = retirementsBy((p, isOdd) => minutes({ ...p, strength: p.strength + (isOdd ? 8 : -8) }, 20 * 90));
    expect(even).toBeGreaterThan(odd * 1.5);
  });

  it("lands in the early to mid thirties on average", () => {
    const state = withPlayers(start, (p) => minutes(p, 15 * 90));
    const ages = developPlayers(state).events.flatMap((e) => (e.type === "playerRetired" ? [e.age] : []));
    const mean = ages.reduce((sum, a) => sum + a, 0) / ages.length;
    expect(mean).toBeGreaterThan(32);
    expect(mean).toBeLessThan(36.5);
  });
});

/** The coach's squad with every veteran as sure to retire as the age table allows: aged 41. */
const coachVeterans = withPlayers(start, (p) => (p.clubId === COACH_CLUB && p.group !== "GK" ? { ...p, age: 41 } : p));

describe("the coach's veterans", () => {
  const turned = developPlayers(coachVeterans);
  const announced = turned.events.flatMap((e) => (e.type === "playerWantsToRetire" ? [e] : []));

  it("announce their last season at the turn of the year instead of retiring", () => {
    expect(announced.length).toBeGreaterThan(3);
    for (const { playerId } of announced) expect(turned.state.players[playerId]?.retiring).toEqual({ afterSeason: start.season + 1, hasBeenAsked: false });
    expect(turned.events.some((e) => e.type === "playerRetired" && e.clubId === COACH_CLUB)).toBe(false);
  });

  it("retire at the next turn of the year unless the coach talked them round", () => {
    const [first] = announced;
    if (!first) throw new Error("nobody announced");
    const nextYear = { ...turned.state, season: start.season + 1, rngState: 99 };
    const again = developPlayers(nextYear);
    expect(again.events.some((e) => e.type === "playerRetired" && e.playerId === first.playerId)).toBe(true);
    expect(again.state.players[first.playerId]).toBeUndefined();
  });

  it("are foreseen at each turn of the year as they go, so the clubs talking contracts the day before know", () => {
    expect(Object.values(coachVeterans.players).filter((p) => p.clubId === COACH_CLUB && retiresAtSeasonTurn(coachVeterans, p))).toEqual([]);
    const nextYear = { ...turned.state, season: start.season + 1 };
    const retired = developPlayers(nextYear).events.flatMap((e) => (e.type === "playerRetired" ? [e.playerId] : []));
    expect(Object.values(nextYear.players).filter((p) => retiresAtSeasonTurn(nextYear, p)).map((p) => p.id).sort()).toEqual(retired.sort());
    for (const { playerId } of announced) expect(retired).toContain(playerId);
  });

  it("stay one more year about half the time when the coach asks, and can be asked only once", () => {
    const answers = announced.map(({ playerId }) => persuadeToStay(turned.state, playerId));
    const stayed = answers.filter((a) => a.event.stays);
    expect(stayed.length).toBeGreaterThan(0);
    expect(stayed.length).toBeLessThan(answers.length);
    for (const answer of answers) {
      const player = answer.state.players[answer.event.playerId];
      expect(player?.retiring).toEqual(answer.event.stays ? undefined : { afterSeason: start.season + 1, hasBeenAsked: true });
    }
    const refused = answers.find((a) => !a.event.stays);
    if (refused) expect(() => persuadeToStay(refused.state, refused.event.playerId)).toThrow(/already/);
  });

  it("can't be asked to stay when they don't want to leave, or when they're not his", () => {
    const keen = Object.values(turned.state.players).find((p) => p.clubId === COACH_CLUB && !p.retiring);
    const other = Object.values(turned.state.players).find((p) => p.clubId !== COACH_CLUB);
    if (!keen || !other) throw new Error("no players");
    expect(() => persuadeToStay(turned.state, keen.id)).toThrow(/doesn't want to retire/);
    expect(() => persuadeToStay(turned.state, other.id)).toThrow(/not at the coach's club/);
  });
});

describe("retiring a player by hand", () => {
  const [player] = Object.values(start.players).filter((p) => p.clubId === COACH_CLUB);
  if (!player) throw new Error("no Flamengo player");

  it("takes him out of the game with the news, and his pre-contract with him", () => {
    const withPreContract = { ...start, market: { ...start.market, preContracts: { [player.id]: "palmeiras-sp" } } };
    const retired = retirePlayer(withPreContract, player.id);
    expect(retired.state.players[player.id]).toBeUndefined();
    expect(retired.state.market.preContracts[player.id]).toBeUndefined();
    expect(retired.event).toEqual({ type: "playerRetired", playerId: player.id, clubId: COACH_CLUB, name: player.name, age: player.age });
  });

  it("takes him off the market: his listing, his auction and the offers for him go", () => {
    const market = {
      ...start.market,
      coach: {
        listings: { [player.id]: { mode: "cheap" as const, price: 1_000_000 } },
        auctions: { [player.id]: { minBid: 1_000_000, closesOn: start.date, bids: [] } },
        bids: { [player.id]: { playerId: player.id, buyerId: "palmeiras-sp", fee: 2_000_000, feeEur: null, ceiling: 2_500_000, isFinal: false, madeOn: start.date, until: start.date } },
        counters: {},
      },
    };
    const retired = retirePlayer({ ...start, market }, player.id).state.market.coach;
    expect([retired?.listings[player.id], retired?.auctions[player.id], retired?.bids[player.id]]).toEqual([undefined, undefined, undefined]);
  });

  it("refuses a player on loan to the coach, who belongs to another club", () => {
    const loan = { fromClubId: "palmeiras-sp", until: "2026-12-31", lenderWageShare: 0.5, buyOption: null };
    const lent = { ...start, market: { ...start.market, loans: { [player.id]: loan } } };
    expect(() => retirePlayer(lent, player.id)).toThrow(/on loan/);
  });

  it("refuses a player of another club", () => {
    const other = Object.values(start.players).find((p) => p.clubId !== COACH_CLUB);
    if (!other) throw new Error("no other player");
    expect(() => retirePlayer(start, other.id)).toThrow(/not at the coach's club/);
  });
});
