import type { Club } from "@boleiro/data/clubs";

// guess: a state's classic derbies are played among its biggest fanbases (Flamengo, Vasco,
// Fluminense and Botafogo in Rio; Corinthians, Palmeiras, São Paulo and Santos in São Paulo).
// Taking the top four by fanbase reproduces those and the Gre-Nal, Atletiba and Ba-Vi
// without a curated list; smaller clubs get no rivals.
const BIG_CLUBS_PER_STATE = 4;

/** Each club's rivals: the other big-fanbase clubs of its state. */
export function rivalsOf(clubs: Record<string, Club>): Map<string, ReadonlySet<string>> {
  const byState = new Map<string, Club[]>();
  for (const club of Object.values(clubs)) byState.set(club.state, [...(byState.get(club.state) ?? []), club]);
  const rivals = new Map<string, ReadonlySet<string>>();
  for (const members of byState.values()) {
    const big = members
      .filter((club) => club.fanbase > 0)
      .sort((a, b) => b.fanbase - a.fanbase || a.id.localeCompare(b.id))
      .slice(0, BIG_CLUBS_PER_STATE)
      .map((club) => club.id);
    for (const id of big) rivals.set(id, new Set(big.filter((other) => other !== id)));
  }
  return rivals;
}
