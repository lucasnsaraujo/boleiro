// guess: Transfermarkt has no birth date for 8 of 6,764 players; 26 is the squad median age.
const UNKNOWN_AGE = 26;
// guess: no public data rates these traits; about three players in ten have one, so most have none.
export const AGGRESSIVE_SHARE = 0.1;
const TRAIT_SHARES = [
    ["injuryProne", 0.08],
    ["poorOnArtificialTurf", 0.1],
    ["aggressive", AGGRESSIVE_SHARE],
];
export function rollTrait(random) {
    let roll = random();
    for (const [trait, share] of TRAIT_SHARES) {
        if (roll < share)
            return trait;
        roll -= share;
    }
    return null;
}
export function freshCondition(date) {
    return { fatigue: 0, fatigueOn: date, injuredUntil: null, arrivedOn: null, seasonMinutes: 0, seasonPoints: 0 };
}
/** Age, nationality, trait and a rested condition for a player from the data, at the start of a game. */
export function openingProfile(player, date, random) {
    return {
        age: player.age ?? UNKNOWN_AGE,
        nationalities: player.nationalities,
        trait: rollTrait(random),
        condition: freshCondition(date),
    };
}
