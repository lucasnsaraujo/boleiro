import type { Club } from "@boleiro/data/clubs";
import { DERBIES } from "@boleiro/data/derbies";

// Every gate asks for the rivals while the clubs change only between seasons, so each set of clubs is worked out once.
const known = new WeakMap<Record<string, Club>, ReadonlyMap<string, ReadonlySet<string>>>();

/** Each club's rivals among these clubs: its real derby opponents (rivalries/rivalryOf.ts), the biggest derby first. */
export function rivalsOf(clubs: Record<string, Club>): ReadonlyMap<string, ReadonlySet<string>> {
  const cached = known.get(clubs);
  if (cached) return cached;
  const ranked = DERBIES.filter(({ clubs: [a, b] }) => a in clubs && b in clubs).sort(
    (x, y) => y.intensity - x.intensity || x.clubs[0].localeCompare(y.clubs[0]) || x.clubs[1].localeCompare(y.clubs[1]),
  );
  const rivals = new Map<string, Set<string>>();
  for (const { clubs: [a, b] } of ranked) {
    rivals.set(a, (rivals.get(a) ?? new Set()).add(b));
    rivals.set(b, (rivals.get(b) ?? new Set()).add(a));
  }
  known.set(clubs, rivals);
  return rivals;
}
