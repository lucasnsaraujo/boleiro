import { pickLineup, type PositionGroup } from "../../engine/match.js";
import type { GameState, SimPlayer, Tier } from "../gameState.js";
import { freshCondition, rollTrait } from "../players/openingProfile.js";
import { inventName } from "../players/inventName.js";
import { boardRefusal } from "./boardRefusal.js";
import { contractEnd } from "./expireContracts.js";
import { marketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import { isClubFull } from "./squadCap.js";
import type { PlayerMoved } from "./transferEvents.js";
import { valuePlayer } from "./valuePlayer.js";
import { goingRate } from "./wageDemand.js";
import { willingToJoin } from "./willingToJoin.js";

// guess: chance a club looks abroad on a market day; Série A clubs sign a few foreigners and
// returning Brazilians a year, lower divisions almost never.
const LOOKS_ABROAD: Record<Tier, number> = { A: 0.8, B: 0.25, C: 0.03, D: 0.02, state: 0.01 };
// guess: who is offered from abroad: half returning Brazilians, a third other South Americans, the rest Europeans.
const ORIGINS: readonly [nationality: string, share: number][] = [["Brazil", 0.5], ["Argentina", 0.12], ["Uruguay", 0.08], ["Colombia", 0.08], ["Paraguay", 0.05], ["Portugal", 0.09], ["Spain", 0.08]];
const AGES = { min: 22, spread: 13 }; // guess: offers from abroad span 22 to 34
// guess: he would come in 0 to 6 points above the club's average starter.
const STRENGTH_ABOVE_STARTERS = 6;
// guess: a player abroad earns half again the club's going rate for his strength.
const ABROAD_WAGE_PREMIUM = 1.5;
// guess: from 30 a player abroad usually comes at the end of his contract, without a fee.
const FREE_FROM_AGE = 30;
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

function nationalityOf(random: () => number): string {
  let roll = random();
  for (const [nationality, share] of ORIGINS) {
    if (roll < share) return nationality;
    roll -= share;
  }
  return "Brazil";
}

/** One market day of AI clubs signing players from clubs abroad: returning Brazilians, other South Americans, a few Europeans. */
export function signFromAbroad(state: GameState, random: () => number, serial: () => string): { state: GameState; events: PlayerMoved[] } {
  const events: PlayerMoved[] = [];
  let next = state;
  const year = Number(state.date.slice(0, 4));
  const view = marketView(next);
  for (const clubId of Object.keys(state.finances).sort()) {
    const club = next.clubs[clubId];
    const finance = next.finances[clubId];
    if (clubId === state.coachClubId || !club || !finance || random() >= LOOKS_ABROAD[view.tier(clubId)]) continue;
    const squad = view.squad(clubId);
    if (squad.length < 11 || isClubFull(next, clubId, squad.length)) continue;
    const starters = pickLineup([...squad]);
    const level = starters.reduce((sum, p) => sum + p.strength, 0) / starters.length;
    const nationality = nationalityOf(random);
    const age = AGES.min + Math.floor(random() * AGES.spread);
    const strength = Math.round((level + STRENGTH_ABOVE_STARTERS * random()) * 10) / 10;
    const wage = Math.round(goingRate(strength, squad) * ABROAD_WAGE_PREMIUM);
    const player: SimPlayer = {
      id: serial(), clubId, group: GROUPS[Math.floor(random() * GROUPS.length)] ?? "MID", name: inventName(random), strength, age,
      nationalities: [nationality], trait: rollTrait(random), wage: Math.round(wage / ABROAD_WAGE_PREMIUM),
      contractUntil: `${year + 2}-12-31`, condition: freshCondition(state.date),
    };
    const tier = view.tier(clubId);
    const fee = age >= FREE_FROM_AGE ? 0 : Math.round(valuePlayer(player, "A", state.date) * next.market.eurBrl);
    if (boardRefusal(finance, view.bill(clubId), { upFront: fee + 3 * wage, wageChange: wage })) continue;
    if (random() >= willingToJoin({ player, from: "abroad", to: { tier, fanbase: club.fanbase }, wage })) continue;
    const moved = movePlayer(next, { playerId: player.id, kind: "fromAbroad", toClubId: clubId, fee, contract: { wage, until: contractEnd(year + 1, random) }, incoming: player });
    next = moved.state;
    events.push(moved.event);
    view.record(null, next.players[player.id] ?? null);
  }
  return { state: next, events };
}
