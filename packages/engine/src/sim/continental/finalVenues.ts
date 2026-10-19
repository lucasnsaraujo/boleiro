import type { CupAbroad } from "../gameState.js";

/** Where a final is played: the ground by the name Brazilian fans know it, its city and country, and the seats it has for it. */
export type FinalVenue = { name: string; city: string; country: string; capacity: number };

/** The one-match finals the game plays at a venue of their own. */
export type FinalCup = Exclude<CupAbroad, "national-cup">;

// UEFA's announced finals by the season they close (the year it starts): the 2027 Champions League final at the
// Estadio Metropolitano (UEFA, 11 Sep 2025) and the 2028 one at the Munich Football Arena, the 2027 Europa League
// final at the Frankfurt stadium (UEFA, 22 May 2024) and the 2028 one at the National Arena, Bucharest, the 2026
// Super Cup in Salzburg (UEFA, 11 Sep 2025, which names the city alone: guess, its UEFA ground, the Red Bull Arena),
// the 2027 one at the Johan Cruyff ArenA and the 2028 one at the Astana Arena (UEFA, 15 Sep 2026). Capacities for
// European matches where Wikipedia gives one, else for football (Wikipedia's infoboxes, read 2026-10-18).
const ANNOUNCED: Record<FinalCup, Readonly<Record<number, FinalVenue>>> = {
  "champions-league": {
    2026: { name: "Estádio Metropolitano", city: "Madri", country: "Espanha", capacity: 70_813 },
    2027: { name: "Allianz Arena", city: "Munique", country: "Alemanha", capacity: 70_000 },
  },
  "europa-league": {
    2026: { name: "Deutsche Bank Park", city: "Frankfurt", country: "Alemanha", capacity: 53_800 },
    2027: { name: "Arena Națională", city: "Bucareste", country: "Romênia", capacity: 55_634 },
  },
  "uefa-super-cup": {
    2026: { name: "Red Bull Arena", city: "Wals-Siezenheim", country: "Áustria", capacity: 29_520 },
    2027: { name: "Johan Cruyff ArenA", city: "Amsterdã", country: "Holanda", capacity: 56_120 },
    2028: { name: "Astana Arena", city: "Astana", country: "Cazaquistão", capacity: 30_244 },
  },
};

/** The venue of `cup`'s final of `season`, as UEFA announced it; undefined for a season it has not. */
export function finalVenueOf(cup: FinalCup, season: number): FinalVenue | undefined {
  return ANNOUNCED[cup][season];
}
