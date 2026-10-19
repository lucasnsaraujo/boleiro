import type { CupAbroad } from "../gameState.js";
import { ANNOUNCED_HOSTS } from "../hosts/announcedHosts.js";
import type { HostedCup, Hosts, Stadium } from "../hosts/venue.js";

/** Where a final is played: the ground by the name Brazilian fans know it, its city and country, and the seats it has for it. */
export type FinalVenue = Stadium;

/** The one-match finals the game plays at a venue of their own. */
export type FinalCup = Exclude<CupAbroad, "national-cup">;

/**
 * The ground of `cup`'s final of `season` (the year a UEFA season starts): the game's host for that edition, else as
 * its organiser announced it (hosts/announcedHosts.ts); undefined when neither names one.
 */
export function finalVenueOf(cup: HostedCup, season: number, hosts: Hosts = {}): FinalVenue | undefined {
  const id = `${cup}-${season}`;
  return hosts[id]?.final ?? ANNOUNCED_HOSTS[id]?.final;
}
