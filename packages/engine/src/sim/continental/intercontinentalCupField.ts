import type { GameState } from "../gameState.js";
import { confederationOf, type Confederation } from "./clubWorldCup.js";
import { byStrength, countryOf, FIRST_FIELD, latestChampion } from "./clubWorldCupField.js";
import { latestChampionsLeagueWinner } from "./uefaCups.js";

/** The Intercontinental Cup's clubs known when its season opens, by the stage each joins at, and each one's country. */
export type IntercontinentalCupField = { entries: string[][]; countries: Record<string, string> };

/**
 * The `season`'s Intercontinental Cup clubs from the confederations whose cups the game doesn't play,
 * by the titles in the game state.
 * guess: the AFC's champion is the Saudi league's latest, CONCACAF's the stronger of MLS's and Liga
 * MX's latest, as Saudi clubs won the AFC Champions League Elite of 2025 and Mexican and US ones the
 * CONCACAF Champions Cup; CAF's and the OFC's, and any confederation whose leagues have filed no
 * champion yet, the strongest of its clubs at FIFA's 2025 Club World Cup. The OFC's club meets the
 * AFC's in the play-off in even years and CAF's in odd ones, as in 2024 and 2025. The Libertadores'
 * and the Champions League's winners join later. Null in a game without the Club World Cup's guests or
 * whose world lacks the latest Champions League winner.
 */
export function intercontinentalCupField(state: GameState, season: number): IntercontinentalCupField | null {
  const championsLeague = latestChampionsLeagueWinner(state.europe);
  if (!state.guests || !championsLeague || !countryOf(state, championsLeague)) return null;
  const strongest = (ids: readonly (string | null)[]) => byStrength(state, ids.filter((id): id is string => id !== null && countryOf(state, id) !== null))[0] ?? null;
  const earlier = (confederation: Confederation) => strongest(FIRST_FIELD.filter((id) => confederationOf(countryOf(state, id) ?? "") === confederation));
  const afc = latestChampion(state, "sa") ?? earlier("afc");
  const concacaf = strongest([latestChampion(state, "us"), latestChampion(state, "mx")]) ?? earlier("concacaf");
  const caf = earlier("caf");
  const ofc = earlier("ofc");
  if (!afc || !concacaf || !caf || !ofc) return null;
  const [playOff, bye] = season % 2 === 0 ? [afc, caf] : [caf, afc];
  const entries = [[playOff, ofc], [bye], [concacaf], [], []];
  return { entries, countries: Object.fromEntries(entries.flat().map((id) => [id, countryOf(state, id) ?? ""])) };
}
