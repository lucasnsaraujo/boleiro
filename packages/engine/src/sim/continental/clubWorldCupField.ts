import { isCurrentOf } from "../currentCompetitions.js";
import type { GameState } from "../gameState.js";
import { finalOrderOf } from "../leagueFormats.js";
import { leagueMatches, leagueTable } from "../world/resultOnlyLeague.js";
import type { WorldClub } from "../world/world.js";
import { CLUB_WORLD_CUP_PLACES, CONFEDERATIONS, confederationOf, isClubWorldCupSeason, type Confederation } from "./clubWorldCup.js";
import { CONMEBOL_CUPS } from "./conmebolCups.js";
import { CHAMPIONS_LEAGUE_BEFORE, cupChampion, leaguePhaseTable } from "./uefaCups.js";
import { compareText } from "../compareText.js";

/** The Club World Cup's clubs, best seed first, and each one's country. */
export type ClubWorldCupField = { clubIds: string[]; countries: Record<string, string> };

// FIFA's 2025 field (Wikipedia, "2025 FIFA Club World Cup", Qualified teams), which opens an edition
// that starts a game, as no game state holds the titles and rankings it came from; later editions keep
// its clubs where the game holds none of a confederation's titles or rankings.
export const FIRST_FIELD = [
  "tm-631", "tm-418", "tm-281", "tm-27", "tm-583", "tm-46", "tm-720", "tm-294", "tm-16", "tm-506", "tm-13", "tm-409",
  "palmeiras-sp", "flamengo-rj", "fluminense-rj", "botafogo-rj", "tm-209", "tm-189",
  "tm-2407", "tm-9636", "tm-4035", "tm-51828", "tm-69261",
  "tm-1114", "tm-828", "tm-2150", "tm-3535",
  "tm-7", "tm-6603", "tm-3342", "tm-6356",
  "tm-11391",
];

// The Libertadores' real winners before the game's first season, newest last: 2022 to 2025 (CONMEBOL).
const LIBERTADORES_BEFORE = ["flamengo-rj", "fluminense-rj", "botafogo-rj", "flamengo-rj"];
// FIFA's window: the champions of the last four seasons qualify.
const CHAMPION_SEASONS = 4;
const COUNTRY_CAP = 2;
// FIFA's place for the 2025 host, one of CONCACAF's five, which the game keeps for an MLS club.
const HOST = { confederation: "concacaf", country: "us" } as const;

/** A club's country, as the draws need it: Brazil's, a country's abroad or in the world, or a guest's. */
export function countryOf(state: Pick<GameState, "clubs" | "world" | "guests">, id: string): string | null {
  const club = state.clubs[id];
  if (club) return club.abroad?.country ?? "br";
  const inWorld = Object.entries(state.world ?? {}).find(([, country]) => id in country.clubs)?.[0];
  return inWorld ?? Object.entries(state.guests ?? {}).find(([, clubs]) => clubs.some((guest) => guest.id === id))?.[0] ?? null;
}

const eleven = (strengths: readonly number[]) => [...strengths].sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0) / 11;

/** The average of the club's best eleven, from its game squad or its result-only one. */
function strengthOf(state: Pick<GameState, "clubs" | "players" | "world" | "guests">, id: string, squads: ReadonlyMap<string, number[]>): number {
  const squad = squads.get(id);
  if (squad) return eleven(squad);
  const worldClub: WorldClub | undefined = Object.values(state.world ?? {}).find((country) => id in country.clubs)?.clubs[id] ?? Object.values(state.guests ?? {}).flat().find((guest) => guest.id === id);
  return eleven(worldClub?.strengths ?? []);
}

/** The clubs by strength, strongest first. */
export function byStrength(state: Pick<GameState, "clubs" | "players" | "world" | "guests">, clubIds: readonly string[]): string[] {
  const squads = new Map<string, number[]>();
  for (const player of Object.values(state.players)) if (clubIds.includes(player.clubId)) squads.set(player.clubId, [...(squads.get(player.clubId) ?? []), player.strength]);
  const strength = new Map(clubIds.map((id) => [id, strengthOf(state, id, squads)]));
  return [...clubIds].sort((a, b) => (strength.get(b) ?? 0) - (strength.get(a) ?? 0) || compareText(a, b));
}

/** The field seeded by strength, strongest first; null unless every club of it is in the game. */
function seededField(state: Pick<GameState, "clubs" | "players" | "world" | "guests">, clubIds: readonly string[]): ClubWorldCupField | null {
  const countries = Object.fromEntries(clubIds.map((id) => [id, countryOf(state, id)]));
  if (clubIds.some((id) => !countries[id])) return null;
  const seeded = byStrength(state, clubIds);
  return { clubIds: seeded, countries: Object.fromEntries(seeded.map((id) => [id, countries[id] ?? ""])) };
}

/** FIFA's 2025 field, for a game whose first season plays an edition. */
export function openingClubWorldCupField(state: Pick<GameState, "season" | "clubs" | "players" | "world" | "guests">): ClubWorldCupField | null {
  return state.guests && isClubWorldCupSeason(state.season) ? seededField(state, FIRST_FIELD) : null;
}

/** The league's champion this season once its matches are played, else the last one its country filed. */
export function latestChampion(state: GameState, country: string): string | null {
  const found = state.world?.[country];
  if (!found) return null;
  const isCurrent = isCurrentOf(state);
  const league = Object.values(state.competitions).find((c) => c.kind === "league" && isCurrent(c) && c.abroad?.country === country && c.abroad.level === 0);
  if (league?.kind === "league" && state.fixtures.some((f) => f.competitionId === league.id) && state.fixtures.every((f) => f.competitionId !== league.id || f.result)) {
    return finalOrderOf(league, state.fixtures.filter((f) => f.competitionId === league.id))[0] ?? null;
  }
  const [top] = found.leagues;
  if (top && !found.structure.rollover && leagueMatches(top).every((match) => match.result)) return leagueTable(top)[0] ?? null;
  return found.seasons.at(-1)?.champions[0] ?? null;
}

/** The season's Libertadores clubs, the furthest first: by the last stage each played, then entry order. */
function libertadoresRanking(state: GameState): string[] {
  const cup = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === state.season);
  if (cup?.kind !== "continental") return [];
  const reached = new Map<string, number>();
  for (const f of state.fixtures) if (f.competitionId === cup.id) for (const id of [f.homeId, f.awayId]) reached.set(id, Math.max(reached.get(id) ?? -1, f.stage));
  const champion = CONMEBOL_CUPS.finalists(cup, state.fixtures.filter((f) => f.competitionId === cup.id))?.championId;
  const entered = cup.entries.flat();
  return [...reached.keys()].sort((a, b) => Number(b === champion) - Number(a === champion) || (reached.get(b) ?? 0) - (reached.get(a) ?? 0) || entered.indexOf(a) - entered.indexOf(b));
}

/** The Champions League's clubs as it stands, the furthest first: by the knockout round each reached, then the league phase's table. */
function championsLeagueRanking(state: GameState): string[] {
  const cup = state.europe?.cups.find((c) => c.cup === "champions-league");
  if (!cup) return [];
  const table = leaguePhaseTable(cup);
  const round = (id: string) => cup.knockout.findLastIndex((r) => r.ties.some((tie) => tie.includes(id)));
  return [...table].sort((a, b) => round(b) - round(a) || table.indexOf(a) - table.indexOf(b));
}

/**
 * Next season's field from the game state at this season's end, per confederation: its champions
 * first, whatever their country (the last four Libertadores and Champions League winners; as stand-ins
 * for the cups the game doesn't play, CONCACAF's from MLS's and Liga MX's champions and the AFC's
 * from Saudi Arabia's), then its ranking at no more than two clubs a country, then FIFA's 2025 clubs
 * strongest first; CONCACAF's last place, FIFA's host's, to the strongest MLS club of those left out;
 * then the 2025 clubs past the cap when it would leave places empty. guess: the rankings are the
 * season's Libertadores and the Champions League as it stands, the furthest first, for FIFA's four-year
 * club rankings. Null unless next season plays an edition and the game has the cup's guests.
 */
export function seasonEndClubWorldCupField(state: GameState): ClubWorldCupField | null {
  if (!state.guests || !isClubWorldCupSeason(state.season + 1)) return null;
  const earlier = byStrength(state, FIRST_FIELD.filter((id) => countryOf(state, id)));
  const confederation = (id: string): Confederation | null => {
    const country = countryOf(state, id);
    return country ? confederationOf(country) : null;
  };
  const recent = (before: readonly string[], filed: readonly { season: number; id: string | undefined | null }[]) =>
    [...before, ...filed.toSorted((a, b) => a.season - b.season).flatMap(({ id }) => (id ? [id] : []))].slice(-CHAMPION_SEASONS);
  const libertadores = recent(LIBERTADORES_BEFORE, [
    ...state.history.seasons.map((record) => ({ season: record.season, id: record.champions.libertadores })),
    { season: state.season, id: state.history.current.champions.libertadores },
  ]);
  const europe = state.europe;
  const championsLeagueCup = europe?.cups.find((c) => c.cup === "champions-league");
  const unfiled = europe && championsLeagueCup && !europe.winners.some((w) => w.season === europe.season) ? cupChampion(championsLeagueCup) : null;
  const championsLeague = recent(CHAMPIONS_LEAGUE_BEFORE, [
    ...(europe?.winners ?? []).map((w) => ({ season: w.season, id: w.championsLeague })),
    ...(europe ? [{ season: europe.season, id: unfiled }] : []),
  ]);
  const champions: Record<Confederation, (string | null)[]> = {
    uefa: championsLeague.toReversed(),
    conmebol: libertadores.toReversed(),
    concacaf: [latestChampion(state, "us"), latestChampion(state, "mx")],
    afc: [latestChampion(state, "sa")],
    caf: [],
    ofc: [],
  };
  const rankings: Record<Confederation, string[]> = { uefa: championsLeagueRanking(state), conmebol: libertadoresRanking(state), concacaf: [], afc: [], caf: [], ofc: [] };
  const field = CONFEDERATIONS.flatMap((name) => {
    const places = CLUB_WORLD_CUP_PLACES[name];
    const isHost = name === HOST.confederation;
    const picked: string[] = [];
    const perCountry = new Map<string, number>();
    const take = (id: string, isChampion: boolean, upTo = isHost ? places - 1 : places) => {
      const country = countryOf(state, id);
      if (picked.length >= upTo || picked.includes(id) || !country || confederation(id) !== name) return;
      if (!isChampion && (perCountry.get(country) ?? 0) >= COUNTRY_CAP) return;
      picked.push(id);
      perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
    };
    for (const id of champions[name]) if (id) take(id, true);
    for (const id of rankings[name]) take(id, false);
    for (const id of earlier) take(id, false);
    const host = earlier.find((id) => !picked.includes(id) && countryOf(state, id) === HOST.country);
    if (isHost && host) take(host, true, places);
    // Places a country's cap left empty go to the 2025 clubs past it.
    for (const id of earlier) take(id, true, places);
    return picked;
  });
  return seededField(state, field);
}
