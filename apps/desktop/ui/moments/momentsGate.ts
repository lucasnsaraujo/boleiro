/** The localStorage key an e2e test sets to see career moments interrupt the screens, as every player does. */
export const E2E_MOMENTS_KEY = "boleiro.e2eMoments";

/**
 * Whether waiting career moments take over the screen: always in the game, and in an e2e build only for a
 * test that asks, so the specs of other screens keep their flows when a title or a farewell happens on the way.
 */
export function doMomentsInterrupt(store: Pick<Storage, "getItem">, isE2eBuild: boolean): boolean {
  return !isE2eBuild || store.getItem(E2E_MOMENTS_KEY) === "1";
}
