import { keyedStream } from "../../engine/random.js";
import type { Competition, ContinentalCompetition, CupAbroadCompetition, Fixture } from "../gameState.js";
import type { EditionHost, Stadium } from "../hosts/venue.js";
import { CUP_STAGES } from "./conmebolCups.js";
import { finalVenueOf } from "./finalVenues.js";
import { DERBY_OF_THE_AMERICAS } from "./intercontinentalCup.js";

// FIFA played the Intercontinental Cup's last three rounds in Qatar, its first two at a club's ground:
// 2024 at Stadium 974 and the Lusail Stadium, 2025 all at the Ahmad bin Ali Stadium in Al Rayyan
// (Wikipedia, "2024 FIFA Intercontinental Cup" and "2025 FIFA Intercontinental Cup"). guess: every
// edition where the latest was played.
const QATAR_GROUND = "Estádio Ahmad bin Ali";

// The 2025 Club World Cup's twelve American stadiums, its semi-finals and final at MetLife
// (Wikipedia, "2025 FIFA Club World Cup" and "2025 FIFA Club World Cup knockout stage"): where a game saved
// before hosts plays a later edition, each earlier match at one of the other eleven picked by the fixture.
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

/** Whether a stage of a CONMEBOL cup is its one-match final, which a cup with a host plays at its ground. */
const isConmebolFinal = (competition: ContinentalCompetition, stage: number) =>
  (competition.cup === "libertadores" || competition.cup === "sul-americana") && isOneMatchFinal(competition, stage);

/**
 * Whether a competition plays a stage on neutral grounds: the Intercontinental Cup from the Derby of the Americas on,
 * every Club World Cup match, a national round its draw puts there, UEFA's finals a human club plays abroad, and the
 * Libertadores' and Sul-Americana's one-match finals at their host's ground.
 */
export function isOnNeutralGround(competition: Competition, stage: number): boolean {
  if (competition.kind === "national") return competition.neutral[stage] === true;
  if (competition.kind === "cupAbroad") return isUefaFinal(competition, stage);
  if (competition.kind !== "continental") return false;
  if (isConmebolFinal(competition, stage)) return competition.host !== undefined;
  return competition.cup === "club-world-cup" || (competition.cup === "intercontinental-cup" && stage >= DERBY_OF_THE_AMERICAS);
}

/** Whether a stage is a competition's one-match final: a FIFA, CONMEBOL or UEFA cup's, the Super Cup, or a national tournament's. */
export function isOneMatchFinal(competition: Competition, stage: number): boolean {
  if (competition.kind === "national") return competition.rounds[stage] === "final";
  if (competition.kind === "cupAbroad") return isUefaFinal(competition, stage);
  if (competition.kind !== "continental") return false;
  return CUP_STAGES[competition.cup][stage]?.name === "final" && (competition.stageDates[stage]?.length ?? 0) === 1;
}

/** One of a tournament's grounds for a fixture, picked by the fixture: the final's for its final, else any of the rest. */
function groundOf(host: EditionHost, fixtureId: string, isFinal: boolean): Stadium | null {
  const others = host.grounds.filter((ground) => ground.name !== host.final.name);
  if (isFinal || others.length === 0) return host.final;
  return others[Math.floor(keyedStream(0, fixtureId)() * others.length)] ?? host.final;
}

/**
 * The ground of a fixture played on neutral ground at its edition's host (hosts/drawHosts.ts): a CONMEBOL or UEFA final's,
 * a Club World Cup's (its semi-finals and final at the final's), a national final tournament's (its final at the final's);
 * null when the stage is at a club's ground or the competition has no host.
 */
export function neutralVenue(competition: Competition, fixture: Pick<Fixture, "id" | "stage">): Stadium | null {
  const host = competition.kind === "national" || competition.kind === "continental" || competition.kind === "cupAbroad" ? competition.host : undefined;
  if (!host || !isOnNeutralGround(competition, fixture.stage)) return null;
  if (competition.kind === "national") return groundOf(host, fixture.id, competition.rounds[fixture.stage] === "final");
  if (competition.kind === "continental" && competition.cup === "club-world-cup") return groundOf(host, fixture.id, fixture.stage >= CLUB_WORLD_CUP_SEMI_FINALS);
  return host.final;
}

/** The name of the neutral ground a fixture is played at, or null when it is at the first-listed club's or the game names no ground (a UEFA final not announced in a game saved before hosts). */
export function neutralGround(competition: Competition, fixture: Pick<Fixture, "id" | "stage">): string | null {
  if (!isOnNeutralGround(competition, fixture.stage)) return null;
  const venue = neutralVenue(competition, fixture);
  if (venue || competition.kind === "national") return venue?.name ?? null;
  if (competition.kind === "cupAbroad") return competition.cup === "national-cup" ? null : (finalVenueOf(competition.cup, competition.season)?.name ?? null);
  if (competition.kind === "continental" && competition.cup === "intercontinental-cup") return QATAR_GROUND;
  if (fixture.stage >= CLUB_WORLD_CUP_SEMI_FINALS) return US_FINALS_GROUND;
  return US_GROUNDS[Math.floor(keyedStream(0, fixture.id)() * US_GROUNDS.length)] ?? null;
}
