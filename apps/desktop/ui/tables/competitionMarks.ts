import type { Competition } from "@boleiro/engine/sim/gameState";
import clubWorldCup from "../../../../assets/competitions/club-world-cup.webp";
import intercontinentalCup from "../../../../assets/competitions/intercontinental-cup.webp";

/** The logo of one of FIFA's club cups (data/SOURCES.md); null for every other competition, which the tables show without one. */
export function competitionMarkOf(competition: Competition): string | null {
  if (competition.kind !== "continental") return null;
  if (competition.cup === "club-world-cup") return clubWorldCup;
  if (competition.cup === "intercontinental-cup") return intercontinentalCup;
  return null;
}
