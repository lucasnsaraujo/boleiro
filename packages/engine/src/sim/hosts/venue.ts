/** A football ground: its name, city (by the name Brazilian fans know it), country (the national-teams pack's id, "spain") and seats. */
export type Stadium = { name: string; city: string; country: string; capacity: number };

/** Where an edition of a cup is played: its host countries, its final's ground and every ground it uses, the final's first. */
export type EditionHost = { countries: string[]; final: Stadium; grounds: Stadium[] };

/** The cups whose editions the game gives a host: one-match finals at a ground chosen ahead, and tournaments in a host country. */
export const HOSTED_CUPS = ["world-cup", "euro", "copa-america", "club-world-cup", "libertadores", "sul-americana", "champions-league", "europa-league", "uefa-super-cup"] as const;
export type HostedCup = (typeof HOSTED_CUPS)[number];

/** Each edition's host by its id, the competition's: `world-cup-2030`, `libertadores-2027`, `champions-league-2026` (the season it starts). */
export type Hosts = Readonly<Record<string, EditionHost>>;
