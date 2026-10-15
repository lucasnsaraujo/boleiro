import { CONMEBOL_CUPS } from "./conmebolCups.js";
import { nationalRanking } from "../copaDoBrasilEntrants.js";
import { COPA_DO_BRASIL } from "../copaDoBrasil.js";
import type { ContinentalCup, GameState } from "../gameState.js";
import { standings } from "../standings.js";
import { BRAZIL } from "../world/brazil.js";
import { continentalPlaces, type ContinentalSlot, type CupFinal, type LeaguePlace } from "../world/continentalPlaces.js";
import { leagueTable } from "../world/resultOnlyLeague.js";
import { SOUTH_AMERICA, type ContinentalEntry } from "../world/southAmerica.js";
import type { World, WorldClub } from "../world/world.js";

/**
 * Who plays CONMEBOL's cups in a season: the clubs joining the Libertadores and the Sul-Americana at
 * each stage, best seed first, the Recopa's two champions, and each club's country.
 */
export type ContinentalField = { libertadores: string[][]; sulAmericana: string[][]; recopa: string[]; countries: Record<string, string> };

/** Last season's Libertadores and Sul-Americana champions, who go straight to the Libertadores groups. */
type Holders = { libertadores: string | null; sulAmericana: string | null };

type CountryPlaces = { country: string; places: ReadonlyMap<ContinentalEntry, readonly string[]> };

// The 2025 champions, who open the game's first season in the 2026 Libertadores groups and Recopa:
// Flamengo won the Libertadores final against Palmeiras on 29 Nov 2025 and Lanús the Sul-Americana
// final against Atlético-MG on 22 Nov 2025 (CONMEBOL).
const FIRST_HOLDERS: Holders = { libertadores: "flamengo-rj", sulAmericana: "tm-333" };

const BRAZIL_ENTRIES = { libertadoresGroups: "libertadoresGroups", libertadoresPreliminary: "libertadoresStage2", sulAmericana: "sulAmericanaGroups" } as const;

/** The country's places with its cup places handed down the league table, as when no cup final decides them. */
function leagueOnly<Entry extends string>(slots: readonly ContinentalSlot<Entry>[]): LeaguePlace<Entry>[] {
  const counts = new Map<Entry, number>();
  for (const slot of slots) if (slot.from === "league") counts.set(slot.entry, (counts.get(slot.entry) ?? 0) + slot.places);
  for (const slot of slots) if (slot.from !== "league" && counts.has(slot.entry)) counts.set(slot.entry, (counts.get(slot.entry) ?? 0) + 1);
  return [...counts].map(([entry, places]) => ({ entry, from: "league", places }));
}

/** Brazil's places from its Série A table and Copa do Brasil final; a final involving a champion hands its places down the table. */
function brazilPlaces(table: readonly string[], copa: CupFinal | null, holders: ReadonlySet<string>): CountryPlaces {
  const isCupUsable = copa !== null && !holders.has(copa.championId) && !holders.has(copa.runnerUpId);
  const places = continentalPlaces(isCupUsable ? BRAZIL.continental : leagueOnly(BRAZIL.continental), table.filter((id) => !holders.has(id)), isCupUsable ? copa : null);
  return { country: "br", places: new Map([...places].map(([entry, ids]) => [BRAZIL_ENTRIES[entry], ids])) };
}

function isContinentalEntry(entry: string): entry is ContinentalEntry {
  return ["libertadoresGroups", "libertadoresStage2", "libertadoresStage1", "sulAmericanaGroups", "sulAmericanaStage1"].includes(entry);
}

/** A result-only country's places down its top table; null for a country that sends no club to CONMEBOL's cups. */
function worldPlaces(id: string, world: World, table: readonly string[], holders: ReadonlySet<string>): CountryPlaces | null {
  const country = world[id];
  const slots = (country?.structure.continental ?? []).flatMap((slot) => (isContinentalEntry(slot.entry) ? [{ ...slot, entry: slot.entry }] : []));
  if (slots.length === 0) return null;
  return { country: id, places: continentalPlaces(slots, table.filter((club) => !holders.has(club)), null) };
}

/** The lists' clubs taken rank by rank across the lists: every first, then every second, and so on. */
function byRank(lists: readonly (readonly string[])[]): string[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, rank) => lists.flatMap((list) => (list[rank] === undefined ? [] : [list[rank]]))).flat();
}

/** The field from every country's places; null unless all of South America is in the game, as the draws need every country's clubs. */
function fieldOf(countries: readonly CountryPlaces[], holders: Holders, countryOf: (id: string) => string | null): ContinentalField | null {
  if (!SOUTH_AMERICA.every((structure) => countries.some((c) => c.country === structure.id))) return null;
  const at = (entry: ContinentalEntry) => countries.map((c) => c.places.get(entry) ?? []);
  const champions = [holders.libertadores, holders.sulAmericana].filter((id): id is string => id !== null);
  const libertadores = [byRank(at("libertadoresStage1")), byRank(at("libertadoresStage2")), [], [...champions, ...byRank(at("libertadoresGroups"))]];
  const sulAmericana = [at("sulAmericanaStage1").flat(), byRank(at("sulAmericanaGroups"))];
  const everyone = [...libertadores.flat(), ...sulAmericana.flat()];
  return {
    libertadores,
    sulAmericana,
    recopa: holders.libertadores && holders.sulAmericana ? [holders.libertadores, holders.sulAmericana] : [],
    countries: Object.fromEntries(everyone.flatMap((id) => {
      const country = countryOf(id);
      return country ? [[id, country]] : [];
    })),
  };
}

/** Each club's country: "br" for the full tier's clubs, the result-only country's id for the others. */
export function countryOfClub(state: Pick<GameState, "clubs" | "world">): (id: string) => string | null {
  return (id) => {
    if (state.clubs[id]) return "br";
    return Object.entries(state.world ?? {}).find(([, country]) => id in country.clubs)?.[0] ?? null;
  };
}

const elevenAverage = (club: WorldClub | undefined) => [...(club?.strengths ?? [])].sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0) / 11;

/**
 * The first season's field. guess: with no 2025 tables in the game, the 2025 champions open the
 * Libertadores groups and every country fills its places down a stand-in table: Brazil's national
 * ranking (division, then fanbase), each other country's top league by its best eleven's strength.
 */
export function openingField(state: Pick<GameState, "clubs" | "world">): ContinentalField | null {
  const countryOf = countryOfClub(state);
  const holders: Holders = {
    libertadores: FIRST_HOLDERS.libertadores && countryOf(FIRST_HOLDERS.libertadores) ? FIRST_HOLDERS.libertadores : null,
    sulAmericana: FIRST_HOLDERS.sulAmericana && countryOf(FIRST_HOLDERS.sulAmericana) ? FIRST_HOLDERS.sulAmericana : null,
  };
  const held = new Set([holders.libertadores, holders.sulAmericana].filter((id): id is string => id !== null));
  const world = state.world ?? {};
  const foreign = Object.entries(world).flatMap(([id, country]) => {
    const [top] = country.leagues;
    const table = [...(top?.clubIds ?? [])].sort((a, b) => elevenAverage(country.clubs[b]) - elevenAverage(country.clubs[a]) || a.localeCompare(b));
    return worldPlaces(id, world, table, held) ?? [];
  });
  return fieldOf([brazilPlaces(nationalRanking(Object.values(state.clubs)), null, held), ...foreign], holders, countryOf);
}

/** Next season's field from the season just played: its CONMEBOL champions, Série A table and Copa do Brasil final, and each country's top table. */
export function seasonEndField(state: GameState): ContinentalField | null {
  const seasonCompetitions = Object.values(state.competitions).filter((c) => c.season === state.season);
  const fixturesOf = (id: string) => state.fixtures.filter((f) => f.competitionId === id);
  const championOf = (cup: ContinentalCup) => {
    const competition = seasonCompetitions.find((c) => c.kind === "continental" && c.cup === cup);
    return competition?.kind === "continental" ? (CONMEBOL_CUPS.finalists(competition, fixturesOf(competition.id))?.championId ?? null) : null;
  };
  const holders: Holders = { libertadores: championOf("libertadores"), sulAmericana: championOf("sul-americana") };
  const held = new Set([holders.libertadores, holders.sulAmericana].filter((id): id is string => id !== null));
  const serieA = seasonCompetitions.find((c) => c.kind === "league" && c.division === "A");
  const table = serieA ? standings(serieA.clubIds, fixturesOf(serieA.id), serieA.drawOrder).map((row) => row.clubId) : [];
  const cup = seasonCompetitions.find((c) => c.kind === "cup");
  const copa = cup?.kind === "cup" ? COPA_DO_BRASIL.finalists(cup, fixturesOf(cup.id)) : null;
  const world = state.world ?? {};
  const foreign = Object.entries(world).flatMap(([id, country]) => {
    const [top] = country.leagues;
    return (top && worldPlaces(id, world, leagueTable(top), held)) ?? [];
  });
  return fieldOf([brazilPlaces(table, copa, held), ...foreign], holders, countryOfClub(state));
}
