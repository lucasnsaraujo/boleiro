import { randomStream } from "../../engine/random.js";
import { tierOf } from "../finances/tierOf.js";
import { sellPlayer } from "../finances/sellPlayer.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { NO_SQUAD_WAGE, professionalOf, YOUTH_CONTRACT_YEARS } from "../players/developPlayers.js";
import { isHumanClub } from "../coach/humanCoaches.js";
import { recordTransfer } from "../history/recordTransfer.js";
import { isWindowOpen } from "../transfers/transferWindows.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { isClubFull } from "../transfers/squadCap.js";
import { SQUAD_TARGET } from "../transfers/squadNeeds.js";
import { valuePlayer } from "../transfers/valuePlayer.js";
import { wageRateOf } from "../transfers/wageDemand.js";
import type { Prospect, Youth } from "./academy.js";

// guess: a club keeps a kid who plays within 4 points of the middle of its squad at his position.
const FIT_MARGIN = 4;

/** A kid who reached 21 and was let go at the season's turn. */
export type ProspectReleased = { type: "prospectReleased"; prospectId: string; clubId: string; name: string };
export type ProspectSold = { type: "prospectSold"; playerId: string; clubId: string; buyerId: string; fee: number };

/** Why a coach's move on a prospect did not go through. */
export type ProspectRefusal = "notYours" | "squadFull" | "noBuyer" | "windowClosed";

const squadOf = (state: Pick<GameState, "players">, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

/** A kid's first professional wage: the squad's going rate for his strength, at least the minimum wage. */
export const firstWage = (prospect: Pick<Prospect, "strength">, squad: readonly SimPlayer[]) => Math.max(NO_SQUAD_WAGE, wageRateOf(squad)(prospect.strength));

const withoutProspect = (youth: Youth, id: string): Youth => ({ ...youth, prospects: Object.fromEntries(Object.entries(youth.prospects).filter(([key]) => key !== id)) });

/** Whether the club with `squad` would keep the kid: there is room and he plays near the middle of its squad at his position. */
export function isWorthPromoting(state: GameState, prospect: Prospect, squad: readonly SimPlayer[]): boolean {
  if (isClubFull(state, prospect.clubId, squad.length)) return false;
  const rivals = squad.filter((p) => p.group === prospect.group).map((p) => p.strength).sort((a, b) => a - b);
  const middle = rivals[rivals.length >> 1];
  return middle === undefined || prospect.strength >= middle - FIT_MARGIN;
}

/** Lets the kid go; he leaves the game. */
function release(state: GameState, prospect: Prospect): GameState {
  if (!state.youth) throw new Error("the game has no academies");
  return { ...state, youth: withoutProspect(state.youth, prospect.id) };
}

function coachProspect(state: GameState, prospectId: string): Prospect | null {
  const prospect = state.youth?.prospects[prospectId];
  return prospect && prospect.clubId === state.coachClubId ? prospect : null;
}

/** The coach puts a kid of his academy into his squad, unless the squad is at the registration cap. */
export function promoteProspect(state: GameState, prospectId: string): { state: GameState; refusal: ProspectRefusal | null } {
  const prospect = coachProspect(state, prospectId);
  if (!prospect || !state.youth) return { state, refusal: "notYours" };
  const academies = state.youth;
  const squad = squadOf(state, prospect.clubId);
  if (isClubFull(state, prospect.clubId, squad.length)) return { state, refusal: "squadFull" };
  return withYouthStream(state, (random) => {
    const player = professionalOf(prospect, prospect.clubId, firstWage(prospect, squad), state.date, random);
    return { ...state, players: { ...state.players, [player.id]: player }, youth: withoutProspect(academies, prospect.id) };
  });
}

/** The coach lets a kid of his academy go. */
export function releaseProspect(state: GameState, prospectId: string): { state: GameState; refusal: ProspectRefusal | null } {
  const prospect = coachProspect(state, prospectId);
  if (!prospect) return { state, refusal: "notYours" };
  return { state: release(state, prospect), refusal: null };
}

/**
 * The club that buys the kid: the biggest national club, other than his own, below its usual squad
 * size with room under the cap, cash for the fee, and a squad he would make; with its fee in BRL.
 */
function buyerOf(state: GameState, prospect: Prospect): { buyerId: string; fee: number } | null {
  let best: { buyerId: string; fee: number; fans: number } | null = null;
  const squads = squadsByClub(state.players);
  for (const club of Object.values(state.clubs)) {
    // Another human coach's club never buys behind his back.
    if (club.id === prospect.clubId || club.division === null || isHumanClub(state, club.id)) continue;
    const squad = squads.get(club.id) ?? [];
    if (squad.length >= SQUAD_TARGET[tierOf(club)]) continue;
    if (!isWorthPromoting(state, { ...prospect, clubId: club.id }, squad)) continue;
    const contractUntil = `${Number(state.date.slice(0, 4)) + YOUTH_CONTRACT_YEARS - 1}-12-31`;
    const fee = Math.round(valuePlayer({ ...prospect, contractUntil }, tierOf(club), state.date) * state.market.eurBrl);
    if ((state.finances[club.id]?.cash ?? 0) < fee) continue;
    if (!best || club.fanbase > best.fans) best = { buyerId: club.id, fee, fans: club.fanbase };
  }
  return best && { buyerId: best.buyerId, fee: best.fee };
}

/** The coach sells a kid of his academy, inside a transfer window, to the club that wants him most at his market value; nobody may want him. */
export function sellProspect(state: GameState, prospectId: string): { state: GameState; refusal: ProspectRefusal | null; sale?: ProspectSold } {
  const prospect = coachProspect(state, prospectId);
  const academies = state.youth;
  if (!prospect || !academies) return { state, refusal: "notYours" };
  if (!isWindowOpen(state, state.date)) return { state, refusal: "windowClosed" };
  const buyer = buyerOf(state, prospect);
  if (!buyer) return { state, refusal: "noBuyer" };
  const sold = withYouthStream(state, (random) => {
    const player = professionalOf(prospect, buyer.buyerId, firstWage(prospect, squadOf(state, buyer.buyerId)), state.date, random);
    const youth = withoutProspect(academies, prospect.id);
    const atSeller = { ...state, youth, players: { ...state.players, [player.id]: { ...player, clubId: prospect.clubId } } };
    const moved = sellPlayer(atSeller, { playerId: player.id, buyerId: buyer.buyerId, fee: buyer.fee });
    const history = recordTransfer(moved.history, { season: state.season, date: state.date, playerId: player.id, name: player.name, fromId: prospect.clubId, toId: buyer.buyerId, fee: buyer.fee });
    return { ...moved, history };
  });
  return { ...sold, sale: { type: "prospectSold", playerId: prospect.id, clubId: prospect.clubId, buyerId: buyer.buyerId, fee: buyer.fee } };
}

/** Runs `change` on the academies' own stream and keeps where the stream got to. */
function withYouthStream(state: GameState, change: (random: () => number) => GameState): { state: GameState; refusal: null } {
  const random = randomStream(state.youth?.rngState ?? 0);
  const changed = change(random.next);
  if (!changed.youth) throw new Error("the game has no academies");
  return { state: { ...changed, youth: { ...changed.youth, rngState: random.state() } }, refusal: null };
}
