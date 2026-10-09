/** Pairs the best seed with the worst, the second with the second-worst, and so on; the better seed comes first. */
export function seededTies(rankedIds: readonly string[]): [string, string][] {
  const half = rankedIds.length / 2;
  return rankedIds.slice(0, half).map((id, i): [string, string] => [id, rankedIds[rankedIds.length - 1 - i] ?? ""]);
}
