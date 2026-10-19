import type { Division } from "@boleiro/data/players";
import type { GameState, IsoDate } from "../gameState.js";
import { championOf } from "../history/championOf.js";
import { competitionKey, type CompetitionKey } from "../history/history.js";
import { standings } from "../standings.js";
import type { Country } from "../world/world.js";
import { squadLevel } from "./aiCoaches.js";

/** How far each club got in a cup of the season just played: stages short of the final (0 the final), and the winner. */
export type CupRun = { fromFinal: Record<string, number>; championId: string | null };

/**
 * The full tier's season as it ended: each cup's runs by competition key, each full-tier league abroad's
 * final order with its level, and the day each competition's last stage was played. Read before the
 * season's fixtures go.
 */
export type SeasonRuns = { cups: Record<string, CupRun>; leaguesAbroad: { level: number; order: string[] }[]; finals: Record<CompetitionKey, IsoDate> };

export function seasonRuns(state: Pick<GameState, "competitions" | "fixtures">): SeasonRuns {
  const runs: SeasonRuns = { cups: {}, leaguesAbroad: [], finals: {} };
  for (const competition of Object.values(state.competitions)) {
    const fixtures = state.fixtures.filter((f) => f.competitionId === competition.id);
    const lastStage = fixtures.filter((f) => f.stage === competition.stageDates.length - 1).map((f) => f.date);
    if (lastStage.length) runs.finals[competitionKey(competition.id)] = lastStage.reduce((latest, date) => (date > latest ? date : latest));
    if (competition.kind === "league" && competition.abroad) {
      const championId = championOf(competition, fixtures);
      const table = standings(competition.clubIds, fixtures.filter((f) => f.stage === 0), competition.drawOrder).map((row) => row.clubId);
      runs.leaguesAbroad.push({ level: competition.abroad.level, order: championId ? [championId, ...table.filter((id) => id !== championId)] : table });
    }
    if (competition.kind !== "cup" && competition.kind !== "continental") continue;
    const last = competition.stageDates.length - 1;
    const reached = new Map<string, number>();
    for (const f of fixtures) for (const id of [f.homeId, f.awayId]) reached.set(id, Math.max(reached.get(id) ?? 0, f.stage));
    runs.cups[competitionKey(competition.id)] = { fromFinal: Object.fromEntries([...reached].map(([id, stage]) => [id, last - stage])), championId: championOf(competition, fixtures) };
  }
  return runs;
}

/**
 * The CBF's national ranking convention (Ranking Nacional de Clubes): a league's champion gets its
 * division's points, Série A 800, B 400, C 200, D 100; the runner-up 80%, third 75%, fourth 70%, then a
 * point of percentage less for each place below down to 51% at the 23rd, which every place below keeps.
 * The Copa do Brasil, since 2021, gives 600 to its champion, 480 to the runner-up, 450 to semi-finalists,
 * 400 to quarter-finalists, 200 for the round of 16 and 100, 50, 25 for the three phases before. Seasons
 * weigh 5 (the latest) down to 1 (the fifth). Sources: https://pt.wikipedia.org/wiki/Ranking_da_CBF and
 * https://trivela.com.br/brasil/como-funciona-o-ranking-da-cbf/. guess: the 2026 format's longer early
 * rounds map from the final back, so its first three phases all get the 25 of the old first phase.
 */
const DIVISION_POINTS: Record<Division, number> = { A: 800, B: 400, C: 200, D: 100 };
const COPA_POINTS = [480, 450, 400, 200, 100, 50, 25] as const;
const COPA_CHAMPION = 600;
export const SEASON_WEIGHTS = [5, 4, 3, 2, 1] as const;

const LOWEST_SHARE = 0.51;

/** A league place's share of the champion's points, the CBF's way. */
export function placeShare(position: number): number {
  if (position <= 1) return 1;
  if (position === 2) return 0.8;
  if (position === 3) return 0.75;
  return Math.max(LOWEST_SHARE, 0.7 - 0.01 * (position - 4));
}

function copaPoints(run: CupRun, clubId: string): number {
  if (run.championId === clubId) return COPA_CHAMPION;
  const fromFinal = run.fromFinal[clubId];
  return fromFinal === undefined ? 0 : (COPA_POINTS[Math.min(fromFinal, COPA_POINTS.length - 1)] ?? 0);
}

type Points = Record<string, number>;
const adder = (points: Points) => (clubId: string, value: number) => {
  if (value > 0 && clubId) points[clubId] = Math.round((points[clubId] ?? 0) + value);
};

/** Brazil's clubs' points for the season, the CBF's way: the Série A–D final tables and the Copa do Brasil. */
export function nationalPoints(history: GameState["history"], season: number, cups: Readonly<Record<string, CupRun>>): Points {
  const points: Points = {};
  const add = adder(points);
  const filed = history.seasons.find((record) => record.season === season);
  for (const division of ["A", "B", "C", "D"] as const) filed?.tables[division].forEach((clubId, index) => add(clubId, DIVISION_POINTS[division] * placeShare(index + 1)));
  const copa = cups["copa-do-brasil"];
  if (copa) for (const clubId of Object.keys(copa.fromFinal)) add(clubId, copaPoints(copa, clubId));
  return points;
}

/**
 * guess, after UEFA's and IFFHS's club rankings, kept to what every country's filed seasons hold: a
 * top league's first ten places score the CBF's way from 800, a second level's champion 400, a national
 * cup's finalists 600 and 480; a continental cup's winner: the Club World Cup 1500, the Libertadores and
 * the Champions League 1000, the Sul-Americana and the Europa League 500, the Intercontinental 700, the
 * Recopa and the UEFA Super Cup 300. All of them are weighed by the club's country when ranked, so a
 * Libertadores won by a Brazilian club counts below a Champions League won by an English one.
 */
const TOP_PLACES = 10;
const CONTINENTAL_POINTS: Record<string, number> = {
  "club-world-cup": 1500,
  "intercontinental-cup": 700,
  libertadores: 1000,
  "sul-americana": 500,
  recopa: 300,
};
const UEFA_POINTS = { championsLeague: 1000, europaLeague: 500, superCup: 300 } as const;
const CUP_FINAL_POINTS = { champion: 600, runnerUp: 480 } as const;

/** A season's points of one part of the game, before each club's country weighs them when ranked: domestic ones and continental ones. */
export type ClubSeasonPoints = { domestic: Points; continental: Points };

export type UefaWinner = NonNullable<GameState["europe"]>["winners"][number];

function uefaPoints(winners: readonly UefaWinner[], isOurs: (clubId: string) => boolean, add: (clubId: string, value: number) => void): void {
  for (const won of winners) {
    if (isOurs(won.championsLeague)) add(won.championsLeague, UEFA_POINTS.championsLeague);
    if (isOurs(won.europaLeague)) add(won.europaLeague, UEFA_POINTS.europaLeague);
    if (won.superCup && isOurs(won.superCup)) add(won.superCup, UEFA_POINTS.superCup);
  }
}

/** A top league's first places from its final order, top first. */
function topPlaces(order: readonly string[], add: (clubId: string, value: number) => void): void {
  order.slice(0, TOP_PLACES).forEach((clubId, index) => add(clubId, DIVISION_POINTS.A * placeShare(index + 1)));
}

/** The full tier's clubs' points for the season: Série A and the leagues abroad it plays, Série B's champion, the Copa do Brasil's final, its continental winners and UEFA's new winners among its clubs. */
export function fullTierPoints(history: GameState["history"], season: number, runs: SeasonRuns, uefaWinners: readonly UefaWinner[], isOurs: (clubId: string) => boolean): ClubSeasonPoints {
  const domestic: Points = {};
  const continental: Points = {};
  const addDomestic = adder(domestic);
  const addContinental = adder(continental);
  const filed = history.seasons.find((record) => record.season === season);
  topPlaces(filed?.tables.A ?? [], addDomestic);
  addDomestic(filed?.tables.B[0] ?? "", DIVISION_POINTS.B);
  for (const { level, order } of runs.leaguesAbroad) {
    if (level === 0) topPlaces(order, addDomestic);
    else if (level === 1) addDomestic(order[0] ?? "", DIVISION_POINTS.B);
  }
  const copa = runs.cups["copa-do-brasil"];
  if (copa?.championId) {
    addDomestic(copa.championId, CUP_FINAL_POINTS.champion);
    for (const [clubId, fromFinal] of Object.entries(copa.fromFinal)) if (fromFinal === 0 && clubId !== copa.championId) addDomestic(clubId, CUP_FINAL_POINTS.runnerUp);
  }
  for (const [key, run] of Object.entries(runs.cups)) if (run.championId) addContinental(run.championId, CONTINENTAL_POINTS[key] ?? 0);
  uefaPoints(uefaWinners, isOurs, addContinental);
  return { domestic, continental };
}

/**
 * A result-only country's clubs' points from its seasons filed since the rankings last read it: its
 * champion and the clubs placed for the continent, in order, as the top of its table (a filed season
 * keeps no more of it); its second level's champion; its cup final; and UEFA's new winners among its clubs.
 */
export function countryPoints(country: Country, fromRecord: number, uefaWinners: readonly UefaWinner[]): ClubSeasonPoints {
  const domestic: Points = {};
  const continental: Points = {};
  const add = adder(domestic);
  for (const record of country.seasons.slice(fromRecord)) {
    topPlaces([...new Set([record.champions[0] ?? "", ...Object.values(record.continental).flat()])].filter(Boolean), add);
    if (record.champions[1]) add(record.champions[1], DIVISION_POINTS.B);
    if (record.cup) {
      add(record.cup.championId, CUP_FINAL_POINTS.champion);
      add(record.cup.runnerUpId, CUP_FINAL_POINTS.runnerUp);
    }
  }
  uefaPoints(uefaWinners, (clubId) => clubId in country.clubs, adder(continental));
  return { domestic, continental };
}

// guess: a country's league counts by how strong its top division is, squared, from a floor of 50 (a lower-division level).
const LEVEL_FLOOR = 50;
const FACTOR_MIN = 0.05;

/** Each country's weight for its clubs' domestic points, 0.05 to 1: its top division's mean squad level against the strongest country's. */
export function countryFactors(state: Pick<GameState, "clubs" | "players" | "world">): Map<string, number> {
  const squads = new Map<string, number[]>();
  for (const p of Object.values(state.players)) {
    const club = state.clubs[p.clubId];
    if (club?.division === "A" || club?.abroad?.level === 0) {
      const squad = squads.get(p.clubId);
      if (squad) squad.push(p.strength);
      else squads.set(p.clubId, [p.strength]);
    }
  }
  const byCountry = new Map<string, number[]>();
  for (const [clubId, strengths] of squads) {
    const country = state.clubs[clubId]?.abroad?.country ?? "br";
    byCountry.set(country, [...(byCountry.get(country) ?? []), squadLevel(strengths)]);
  }
  for (const [id, country] of Object.entries(state.world ?? {})) {
    if (byCountry.has(id)) continue;
    const top = country.leagues[0]?.clubIds ?? Object.keys(country.clubs);
    byCountry.set(id, top.flatMap((clubId) => (country.clubs[clubId] ? [squadLevel(country.clubs[clubId].strengths)] : [])));
  }
  const levels = new Map([...byCountry].map(([id, values]) => [id, values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length)]));
  const best = Math.max(LEVEL_FLOOR + 1, ...levels.values());
  return new Map([...levels].map(([id, level]) => [id, Math.max(FACTOR_MIN, Math.min(1, ((level - LEVEL_FLOOR) / (best - LEVEL_FLOOR)) ** 2))]));
}
