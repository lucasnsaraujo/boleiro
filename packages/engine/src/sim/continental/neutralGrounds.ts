import { keyedStream } from "../../engine/random.js";
import type { Competition, CupAbroad, CupAbroadCompetition, Fixture } from "../gameState.js";
import { DERBY_OF_THE_AMERICAS } from "./intercontinentalCup.js";

// FIFA played the Intercontinental Cup's last three rounds in Qatar, its first two at a club's ground:
// 2024 at Stadium 974 and the Lusail Stadium, 2025 all at the Ahmad bin Ali Stadium in Al Rayyan
// (Wikipedia, "2024 FIFA Intercontinental Cup" and "2025 FIFA Intercontinental Cup"). guess: every
// edition where the latest was played.
const QATAR_GROUND = "Estádio Ahmad bin Ali";

// The 2025 Club World Cup's twelve American stadiums, its semi-finals and final at MetLife
// (Wikipedia, "2025 FIFA Club World Cup" and "2025 FIFA Club World Cup knockout stage"). guess: every
// edition in the same grounds, each earlier match at one of the other eleven picked by the fixture.
const US_FINALS_GROUND = "MetLife Stadium";
const US_GROUNDS = [
  "Lincoln Financial Field",
  "Audi Field",
  "Lumen Field",
  "Rose Bowl",
  "TQL Stadium",
  "Bank of America Stadium",
  "Mercedes-Benz Stadium",
  "Hard Rock Stadium",
  "Geodis Park",
  "Camping World Stadium",
  "Inter&Co Stadium",
];
const CLUB_WORLD_CUP_SEMI_FINALS = 3;

// UEFA's finals, by the season they close (the year it starts): the 2027 Champions League final at the Estadio
// Metropolitano, Madrid (UEFA, 11 Sep 2025), the 2027 Europa League final at the Frankfurt stadium (UEFA, 22 May
// 2024), the 2028 finals at the Munich Football Arena and the National Arena, Bucharest, the 2026 Super Cup in
// Salzburg (UEFA, 11 Sep 2025), the 2027 one at the Johan Cruyff ArenA, Amsterdam, and the 2028 one at the Astana
// Arena (UEFA, 15 Sep 2026); each by the name Brazilian fans know it. guess: UEFA named only the city for 2026's
// Super Cup, whose UEFA ground there is the Red Bull Arena. guess: a later season plays where the latest given did.
const UEFA_FINAL_GROUNDS: Record<Exclude<CupAbroad, "national-cup">, readonly [season: number, ground: string][]> = {
  "champions-league": [
    [2026, "Estádio Metropolitano"],
    [2027, "Allianz Arena"],
  ],
  "europa-league": [
    [2026, "Deutsche Bank Park"],
    [2027, "Arena Națională"],
  ],
  "uefa-super-cup": [
    [2026, "Red Bull Arena"],
    [2027, "Johan Cruyff ArenA"],
    [2028, "Astana Arena"],
  ],
};

/** The ground of a UEFA final of `season`: its own when UEFA gave it, else the latest one UEFA gave before it. */
function uefaFinalGround(cup: Exclude<CupAbroad, "national-cup">, season: number): string | null {
  const grounds = UEFA_FINAL_GROUNDS[cup];
  return (grounds.findLast(([from]) => from <= season) ?? grounds[0])?.[1] ?? null;
}

/** Whether a stage of a human club's cup abroad is a UEFA final: its Champions League or Europa League final, or the Super Cup. */
const isUefaFinal = (competition: CupAbroadCompetition, stage: number) => competition.cup === "uefa-super-cup" || (competition.cup !== "national-cup" && competition.stageNames?.[stage] === "final");

/**
 * Whether a competition plays a stage on neutral grounds: the Intercontinental Cup from the Derby of the Americas on,
 * every Club World Cup match, a national round its draw puts there, and UEFA's finals a human club plays abroad.
 */
export function isOnNeutralGround(competition: Competition, stage: number): boolean {
  if (competition.kind === "national") return competition.neutral[stage] === true;
  if (competition.kind === "cupAbroad") return isUefaFinal(competition, stage);
  if (competition.kind !== "continental") return false;
  return competition.cup === "club-world-cup" || (competition.cup === "intercontinental-cup" && stage >= DERBY_OF_THE_AMERICAS);
}

/** The neutral ground a FIFA cup or a UEFA final plays a fixture at, or null when it is at the first-listed club's or the game names no ground (a national team's). */
export function neutralGround(competition: Competition, fixture: Pick<Fixture, "id" | "stage">): string | null {
  if (competition.kind === "national" || !isOnNeutralGround(competition, fixture.stage)) return null;
  if (competition.kind === "cupAbroad") return competition.cup === "national-cup" ? null : uefaFinalGround(competition.cup, competition.season);
  if (competition.kind === "continental" && competition.cup === "intercontinental-cup") return QATAR_GROUND;
  if (fixture.stage >= CLUB_WORLD_CUP_SEMI_FINALS) return US_FINALS_GROUND;
  return US_GROUNDS[Math.floor(keyedStream(0, fixture.id)() * US_GROUNDS.length)] ?? null;
}
