import { keyedStream } from "../../engine/random.js";
import type { GameState, SimPlayer } from "../gameState.js";
import type { TransferMarket } from "../transfers/transferMarket.js";
import type { PlayerRetired } from "./developPlayers.js";

/** A human coach's player who has announced his last season: he retires at the turn of the year after `afterSeason`. */
export type Retiring = { afterSeason: number; hasBeenAsked: boolean };

export type PlayerWantsToRetire = { type: "playerWantsToRetire"; playerId: string; clubId: string; name: string; age: number; afterSeason: number };
/** The coach asked a player who announced his retirement to play one more year; `stays` is his answer. */
export type PlayerPersuaded = { type: "playerPersuaded"; playerId: string; clubId: string; name: string; stays: boolean };

/**
 * Chance of leaving the game at the end of a season by age. Smoothed from how much smaller each
 * age group is than the one a year younger in the 2026 squads (data/players.csv: 350 aged 28,
 * 345, 312, 295, 216, 247 at 33, 226, 149 at 35, 136, 113, 79, 41 at 39, 41, 12 at 41): about 6%
 * a year from 29 (players dropping out of professional squads), rising to 70% past 40.
 */
const RETIREMENT: readonly [minAge: number, chance: number][] = [
  [40, 0.7], [39, 0.55], [38, 0.45], [37, 0.3], [36, 0.25], [35, 0.2], [34, 0.15], [33, 0.08], [29, 0.06],
];
// Players with more senior games and more seasons at top clubs retire later (Rebelo et al. 2025, "The
// Last Whistle", J Hum Kinet 98:253–261: 3,467 Portuguese professionals retired at 32.7 ± 4.3, games
// correlate with the age at r = 0.33). guess: a veteran who played all his club's minutes is half as
// likely to stop as the age table says, one who never played one and a half times as likely.
const MINUTES_WEIGHT = 1;
const IDLE_RISK = 1.5;
// guess: each strength point above the level his club's players have at his age makes him 10% less likely
// to stop (clubs keep offering him contracts), each point below 10% more; never under half or over twice.
const STRENGTH_RISK_PER_POINT = 1.1;
const LOWEST_STRENGTH_RISK = 0.5;
const HIGHEST_STRENGTH_RISK = 2;
// guess: a 34-year-old who announced his last season stays one more when asked three times in five,
// one chance in ten fewer for each year older, never under one in five.
const STAY_AT_34 = 0.6;
const STAY_LOST_PER_YEAR = 0.1;
const LOWEST_STAY = 0.2;
const STAY_SALT = 0x57a7;

/** The age table's chance that a player stops at the end of the season. */
export function retirementChance(age: number): number {
  return RETIREMENT.find(([minAge]) => age >= minAge)?.[1] ?? 0;
}

/**
 * How much likelier than the age table a player is to stop: more for a veteran who barely played
 * (`minutesShare`, his minutes over the club's most-used player's), less for one stronger than his
 * club's level for his age (`aboveLevel`, in strength points).
 */
export function retirementWeight(minutesShare: number, aboveLevel: number): number {
  const idle = IDLE_RISK - MINUTES_WEIGHT * Math.min(1, Math.max(0, minutesShare));
  return idle * Math.min(HIGHEST_STRENGTH_RISK, Math.max(LOWEST_STRENGTH_RISK, STRENGTH_RISK_PER_POINT ** -aboveLevel));
}

function coachsPlayer(state: GameState, playerId: string): SimPlayer {
  const player = state.players[playerId];
  if (!player || !state.coachClubId || player.clubId !== state.coachClubId) throw new Error(`${playerId} is not at the coach's club`);
  return player;
}

/** The market with only the players `isPlaying` keeps: a player who stopped takes his pre-contract, loan, listing, auction and offers with him. */
export function marketOf(market: TransferMarket, isPlaying: (playerId: string) => boolean): TransferMarket {
  const kept = <T>(byPlayer: Record<string, T>) => Object.fromEntries(Object.entries(byPlayer).filter(([id]) => isPlaying(id)));
  const { coach } = market;
  return {
    ...market,
    preContracts: kept(market.preContracts),
    loans: kept(market.loans),
    ...(coach ? { coach: { ...coach, listings: kept(coach.listings), auctions: kept(coach.auctions), bids: kept(coach.bids) } } : {}),
  };
}

/** The game without a player who stopped, and without his business on the market. */
function withoutPlayer(state: GameState, playerId: string): GameState {
  const { [playerId]: gone, ...players } = state.players;
  if (!gone) return state;
  return { ...state, players, market: marketOf(state.market, (id) => id !== playerId) };
}

/** The coach retires one of his players now, whatever his age. */
export function retirePlayer(state: GameState, playerId: string): { state: GameState; event: PlayerRetired } {
  const player = coachsPlayer(state, playerId);
  return { state: withoutPlayer(state, playerId), event: { type: "playerRetired", playerId, clubId: player.clubId, name: player.name, age: player.age } };
}

/**
 * The coach asks a player who announced his last season to play one more year. The answer comes from
 * the player's own stream for the season: yes clears the announcement, no stands and can't be asked again.
 */
export function persuadeToStay(state: GameState, playerId: string): { state: GameState; event: PlayerPersuaded } {
  const player = coachsPlayer(state, playerId);
  if (!player.retiring) throw new Error(`${player.name} doesn't want to retire`);
  if (player.retiring.hasBeenAsked) throw new Error(`${player.name} was already asked to stay`);
  const chance = Math.max(LOWEST_STAY, STAY_AT_34 - STAY_LOST_PER_YEAR * Math.max(0, player.age - 34));
  const stays = keyedStream(state.seed ^ STAY_SALT, `${playerId}:${state.season}`)() < chance;
  const { retiring, ...rest } = player;
  const next: SimPlayer = stays ? rest : { ...player, retiring: { ...retiring, hasBeenAsked: true } };
  return {
    state: { ...state, players: { ...state.players, [playerId]: next } },
    event: { type: "playerPersuaded", playerId, clubId: player.clubId, name: player.name, stays },
  };
}
