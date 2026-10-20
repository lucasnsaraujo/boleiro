/** Pairs the best seed with the worst, the second with the second-worst, and so on; the better seed comes first. */
export function seededTies(rankedIds) {
    const half = rankedIds.length / 2;
    return rankedIds.slice(0, half).map((id, i) => [id, rankedIds[rankedIds.length - 1 - i] ?? ""]);
}
