import { DERBIES } from "@boleiro/data/derbies";

/** A real derby: its name in the papers (empty when the lists give none) and how big it is, 1 (a local match) to 5 (it stops the country). */
export type Rivalry = { name: string; intensity: number };

/** The biggest intensity a derby can have. */
export const TOP_INTENSITY = 5;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const BY_PAIR: ReadonlyMap<string, Rivalry> = new Map(DERBIES.map(({ clubs: [a, b], name, intensity }) => [pairKey(a, b), { name, intensity }]));

/** The derby between two clubs, from Wikipedia's rivalry lists (data/derbies.csv); null when they have none. */
export function rivalryOf(clubA: string, clubB: string): Rivalry | null {
  return clubA === clubB ? null : (BY_PAIR.get(pairKey(clubA, clubB)) ?? null);
}
