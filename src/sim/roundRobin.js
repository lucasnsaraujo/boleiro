export function roundRobin(clubIds, legs) {
    if (clubIds.length % 2 !== 0)
        throw new Error(`round robin needs an even number of clubs, got ${clubIds.length}`);
    const [fixed, ...rotating] = clubIds;
    if (fixed === undefined)
        return [];
    const rounds = [];
    for (let round = 0; round < clubIds.length - 1; round++) {
        const order = [fixed, ...rotating.slice(round), ...rotating.slice(0, round)];
        const pairs = [];
        for (let i = 0; i < order.length / 2; i++) {
            const a = order[i] ?? "";
            const b = order[order.length - 1 - i] ?? "";
            pairs.push((i === 0 ? round % 2 === 0 : i % 2 === 1) ? [a, b] : [b, a]);
        }
        rounds.push(pairs);
    }
    return legs === 1 ? rounds : [...rounds, ...rounds.map((pairs) => pairs.map(([h, a]) => [a, h]))];
}
