/** The localStorage key an e2e test sets to fix the next new game's world. */
export const E2E_SEED_KEY = "boleiro.e2eSeed";

/** The seed of a new game's world: random, or the one an e2e build finds under E2E_SEED_KEY. */
export function worldSeed(store: Pick<Storage, "getItem">, isE2eBuild: boolean): number {
  const fixed = Number(store.getItem(E2E_SEED_KEY));
  if (isE2eBuild && Number.isInteger(fixed) && fixed > 0) return fixed;
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}
