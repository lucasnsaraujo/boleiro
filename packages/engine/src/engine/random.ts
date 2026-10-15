export type RandomStream = {
  next: () => number;
  state: () => number;
};

export function randomStream(seed: number): RandomStream {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => state,
  };
}

/** A stream of its own for one thing in the game (a fixture, say), seeded by the save's seed and the thing's key. */
export function keyedStream(seed: number, key: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return randomStream(seed ^ hash).next;
}

export function seededRandom(seed: number): () => number {
  return randomStream(seed).next;
}
