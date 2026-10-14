export type Pairing = [homeId: string, awayId: string];

export function roundRobin(clubIds: readonly string[], legs: 1 | 2): Pairing[][] {
  if (clubIds.length % 2 !== 0) throw new Error(`round robin needs an even number of clubs, got ${clubIds.length}`);
  const [fixed, ...rotating] = clubIds;
  if (fixed === undefined) return [];
  const rounds: Pairing[][] = [];
  for (let round = 0; round < clubIds.length - 1; round++) {
    const order = [fixed, ...rotating.slice(round), ...rotating.slice(0, round)];
    const pairs: Pairing[] = [];
    for (let i = 0; i < order.length / 2; i++) {
      const a = order[i] ?? "";
      const b = order[order.length - 1 - i] ?? "";
      pairs.push((i === 0 ? round % 2 === 0 : i % 2 === 1) ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
  }
  return legs === 1 ? rounds : [...rounds, ...rounds.map((pairs) => pairs.map(([h, a]): Pairing => [a, h]))];
}
