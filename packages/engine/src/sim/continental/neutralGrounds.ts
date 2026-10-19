import { keyedStream } from "../../engine/random.js";
import type { Competition, CupAbroadCompetition, Fixture } from "../gameState.js";
import { finalVenueOf } from "./finalVenues.js";
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

/** The neutral ground a FIFA cup or a UEFA final plays a fixture at, or null when it is at the first-listed club's or the game names no ground (a national team's, a UEFA final not announced yet). */
export function neutralGround(competition: Competition, fixture: Pick<Fixture, "id" | "stage">): string | null {
  if (competition.kind === "national" || !isOnNeutralGround(competition, fixture.stage)) return null;
  if (competition.kind === "cupAbroad") return competition.cup === "national-cup" ? null : (finalVenueOf(competition.cup, competition.season)?.name ?? null);
  if (competition.kind === "continental" && competition.cup === "intercontinental-cup") return QATAR_GROUND;
  if (fixture.stage >= CLUB_WORLD_CUP_SEMI_FINALS) return US_FINALS_GROUND;
  return US_GROUNDS[Math.floor(keyedStream(0, fixture.id)() * US_GROUNDS.length)] ?? null;
}
