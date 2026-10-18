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
import { REPLACEMENT_BAND } from "./squadNeeds.js";
import { isBrazilian, willingToJoin } from "./willingToJoin.js";
import { isHumanClub } from "../coach/humanCoaches.js";

// guess: chance a club looks abroad on a market day; Série A clubs sign a few foreigners and
// returning Brazilians a year, lower divisions almost never.
const LOOKS_ABROAD: Record<Tier, number> = { A: 0.8, B: 0.25, C: 0.03, D: 0.02, state: 0.01 };
// guess: half of a lower-division club's signings from abroad are Brazilians coming home.
const RETURNING_SHARE = 0.5;
// Série A's foreigners by first citizenship in data/players.csv (2026): 157 of its 672 players, here those
// of every country with two or more. A foreigner signed from abroad comes from these, in these proportions.
const FOREIGN_ORIGINS: readonly [nationality: string, players: number][] = [
  ["Argentina", 47], ["Uruguay", 31], ["Colombia", 27], ["Paraguay", 11], ["Ecuador", 10], ["Portugal", 6], ["Venezuela", 3],
  ["Morocco", 2], ["Angola", 2], ["Chile", 2], ["Spain", 2], ["Peru", 2], ["Ghana", 2],
];
const FOREIGN_TOTAL = FOREIGN_ORIGINS.reduce((sum, [, players]) => sum + players, 0);
// The CBF lets a Série A club name nine foreigners for a match in 2026 (Times Brasil/CNBC, 21 Sep 2026,
// https://timesbrasil.com.br/esportes/cbf-e-clubes-aprovam-reducao-do-limite-de-estrangeiros-a-partir-de-2027/);
// a club with fewer looks abroad for a foreigner, one with that many for a Brazilian coming home. The cut to
// five by 2030 approved that day isn't played: the game keeps 2026's nine.
const FOREIGNERS_PER_MATCH = 9;
const AGES = { min: 22, spread: 13 }; // guess: offers from abroad span 22 to 34
// guess: an upgrade from abroad comes in 0 to 6 points above the club's average starter.
const STRENGTH_ABOVE_STARTERS = 6;
// guess: a player abroad earns half again the club's going rate for his strength.
const ABROAD_WAGE_PREMIUM = 1.5;
// guess: from 30 a player abroad usually comes at the end of his contract, without a fee.
const FREE_FROM_AGE = 30;
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

/** Where a club's signing from abroad comes from: a foreigner for a Série A club below FOREIGNERS_PER_MATCH, a Brazilian for one at it, half and half below Série A. */
function nationalityOf(tier: Tier, foreigners: number, random: () => number): string {
  const isForeign = tier === "A" ? foreigners < FOREIGNERS_PER_MATCH : random() >= RETURNING_SHARE;
  if (!isForeign) return "Brazil";
  let roll = random() * FOREIGN_TOTAL;
  for (const [nationality, players] of FOREIGN_ORIGINS) {
    if (roll < players) return nationality;
    roll -= players;
  }
  return FOREIGN_ORIGINS[0]?.[0] ?? "Argentina";
}

/** One market day of AI clubs signing players from clubs abroad: foreigners, mostly South Americans, and Brazilians coming home. */
export function signFromAbroad(state: GameState, random: () => number, serial: () => string): { state: GameState; events: PlayerMoved[] } {
  const events: PlayerMoved[] = [];
  let next = state;
  const year = Number(state.date.slice(0, 4));
  const view = marketView(next);
  for (const clubId of Object.keys(state.finances).sort()) {
    const club = next.clubs[clubId];
    const finance = next.finances[clubId];
    if (isHumanClub(state, clubId) || !club || !finance || random() >= LOOKS_ABROAD[view.tier(clubId)]) continue;
    const squad = view.squad(clubId);
    if (squad.length < 11 || isClubFull(next, clubId, squad.length)) continue;
    const tier = view.tier(clubId);
    const nationality = nationalityOf(tier, squad.filter((p) => !isBrazilian(p.nationalities)).length, random);
    const age = AGES.min + Math.floor(random() * AGES.spread);
    // A short squad brings in a replacement for its thinnest group near the middle of the squad, as it would at home
    // (tradeBetweenClubs); a full one an upgrade on its average starter.
    const needs = view.needs(clubId);
    const isReplacing = needs.short > 0;
    const starters = pickLineup([...squad]);
    const level = starters.reduce((sum, p) => sum + p.strength, 0) / starters.length;
    const band = isReplacing ? { min: needs.middle - REPLACEMENT_BAND.below, max: needs.middle + REPLACEMENT_BAND.above } : { min: level, max: level + STRENGTH_ABOVE_STARTERS };
    const strength = Math.round((band.min + (band.max - band.min) * random()) * 10) / 10;
    const group = isReplacing ? needs.thinnest : (GROUPS[Math.floor(random() * GROUPS.length)] ?? "MID");
    const wage = Math.round(goingRate(strength, squad) * ABROAD_WAGE_PREMIUM);
    const player: SimPlayer = {
      id: serial(), clubId, group, name: inventName(random), strength, age,
      nationalities: [nationality], trait: rollTrait(random), wage: Math.round(wage / ABROAD_WAGE_PREMIUM),
      contractUntil: `${year + 2}-12-31`, condition: freshCondition(state.date),
    };
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
