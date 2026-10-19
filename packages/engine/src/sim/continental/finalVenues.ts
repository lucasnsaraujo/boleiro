import { ANNOUNCED_HOSTS } from "../hosts/announcedHosts.js";
import type { HostedCup, Stadium } from "../hosts/venue.js";

/**
 * The ground of `cup`'s final of `season` (the year a UEFA season starts) as its organiser announced it
 * (hosts/announcedHosts.ts); undefined before it has. A cup the game opened with a host plays at the competition's
 * `host` instead, announced or drawn; this names the final of one opened before hosts.
 */
export function finalVenueOf(cup: HostedCup, season: number): Stadium | undefined {
  return ANNOUNCED_HOSTS[`${cup}-${season}`]?.final;
}
