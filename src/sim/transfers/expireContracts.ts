import { addDays } from "../dates.js";
import { tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { SQUAD_TARGET } from "./squadNeeds.js";
import { movePlayer } from "./movePlayer.js";
import type { PlayerContractRenewed, PlayerMoved } from "./transferEvents.js";
import { wageDemand } from "./wageDemand.js";

// guess: an AI club offers a new deal to the players inside its usual squad size (SQUAD_TARGET) who
// are under 34, and four in five of them sign it; the rest leave as free agents.
const RENEWAL_MAX_AGE = 34;
const RENEWAL_CHANCE = 0.8;
// guess: renewals and free-transfer deals run one to three seasons.
const NEW_CONTRACT_YEARS = 3;
// guess: a free agent nobody signs within a year retires or leaves Brazilian football.
const FREE_AGENT_DAYS = 365;

/** A new contract to 31 December, one to `NEW_CONTRACT_YEARS` seasons from `year`. */
export function contractEnd(year: number, random: () => number): string {
  return `${year + Math.floor(random() * NEW_CONTRACT_YEARS)}-12-31`;
}

/** Whether any contract ran out before today or any free agent has waited a year: a loop, no copies. */
export function hasExpiries(state: GameState): boolean {
  for (const id in state.players) if ((state.players[id]?.contractUntil ?? "") < state.date) return true;
  const staleBefore = addDays(state.date, -FREE_AGENT_DAYS);
  for (const id in state.market.freeAgents) if ((state.market.freeAgents[id]?.contractUntil ?? "") < staleBefore) return true;
  return false;
}

/**
 * Ends every contract that ran out before today. A player with a pre-contract joins that club for
 * free; an AI club renews its key players and releases the rest; the coach's club keeps only those
 * it renewed through the board. Free agents left unsigned for a year leave the game.
 */
export function expireContracts(state: GameState, random: () => number): { state: GameState; events: (PlayerMoved | PlayerContractRenewed)[] } {
  const expired = Object.values(state.players).filter((p) => p.contractUntil < state.date);
  const staleBefore = addDays(state.date, -FREE_AGENT_DAYS);
  const stale = Object.values(state.market.freeAgents).filter((p) => p.contractUntil < staleBefore);
  if (!expired.length && !stale.length) return { state, events: [] };
  const events: (PlayerMoved | PlayerContractRenewed)[] = [];
  const freeAgents = { ...state.market.freeAgents };
  for (const p of stale) Reflect.deleteProperty(freeAgents, p.id);
  let next: GameState = { ...state, market: { ...state.market, freeAgents } };
  const squads = new Map<string, SimPlayer[]>();
  for (const p of Object.values(state.players)) squads.set(p.clubId, [...(squads.get(p.clubId) ?? []), p]);
  const year = Number(state.date.slice(0, 4));

  const staying: SimPlayer[] = [];
  for (const player of expired.sort((a, b) => a.id.localeCompare(b.id))) {
    if (state.market.loans[player.id]) continue;
    const joining = state.market.preContracts[player.id];
    if (!joining || !next.clubs[joining]) {
      staying.push(player);
      continue;
    }
    const contract = { wage: wageDemand(player, squads.get(joining) ?? []), until: contractEnd(year, random) };
    const moved = movePlayer(next, { playerId: player.id, kind: "preContract", toClubId: joining, fee: 0, contract });
    next = moved.state;
    events.push(moved.event);
  }

  // Renewals and releases are many on 1 January, so they edit one copy of the players instead of moving each.
  const players = { ...next.players };
  const released = { ...next.market.freeAgents };
  for (const player of staying) {
    const squad = squads.get(player.clubId) ?? [];
    const rank = squad.filter((p) => p.strength > player.strength).length;
    const tier = tierOf(state.clubs[player.clubId] ?? { division: null });
    const keeps = player.clubId !== state.coachClubId && rank < SQUAD_TARGET[tier] && player.age < RENEWAL_MAX_AGE && random() < RENEWAL_CHANCE;
    if (keeps) {
      const until = contractEnd(year, random);
      players[player.id] = { ...player, contractUntil: until };
      events.push({ type: "playerContractRenewed", playerId: player.id, clubId: player.clubId, until, wage: player.wage });
      continue;
    }
    Reflect.deleteProperty(players, player.id);
    released[player.id] = player;
    events.push({ type: "playerMoved", kind: "released", playerId: player.id, name: player.name, fromClubId: player.clubId, toClubId: null, fee: 0 });
  }
  return { state: { ...next, players, market: { ...next.market, freeAgents: released } }, events };
}
