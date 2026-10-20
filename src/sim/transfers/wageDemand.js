// The opening wages' own rule (openingFinances.ts, guess): wages rise about 10% per strength point.
const WAGE_GROWTH_PER_STRENGTH_POINT = 0.1;
// guess: a player changing clubs wants a fifth more than he earns.
const MOVE_RAISE = 1.2;
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0;
/** The club's going rate: its median wage, scaled by strength like the opening wages. Sorts once, so reuse it. */
export function wageRateOf(squad) {
    if (!squad.length)
        return () => 0;
    const medianStrength = median(squad.map((p) => p.strength));
    const medianWage = median(squad.map((p) => p.wage));
    return (strength) => Math.round(medianWage * Math.exp(WAGE_GROWTH_PER_STRENGTH_POINT * (strength - medianStrength)));
}
export const goingRate = (strength, squad) => wageRateOf(squad)(strength);
/** Monthly wage in BRL a player asks to join a club paying `rate`. */
export function wageDemandAt(player, rate) {
    return Math.max(1, Math.round(Math.max(player.wage * MOVE_RAISE, rate(player.strength))));
}
/** Monthly wage in BRL a player asks to join a club with this squad. */
export const wageDemand = (player, squad) => wageDemandAt(player, wageRateOf(squad));
