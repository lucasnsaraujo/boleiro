import { describe, expect, it } from "vitest";
import type { ContinentalCompetition, Fixture, GameState } from "../gameState.js";
import { RAPIDO } from "../formats.js";
import { loadNewGame } from "../loadNewGame.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadGuests } from "../world/loadGuests.js";
import { loadMarketLeagues } from "../world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { confederationOf } from "./clubWorldCup.js";
import { seasonEndField } from "./continentalField.js";
import { payContinentalPrizes } from "./payContinentalPrizes.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);
const SEED = 7;
// FIFA's first edition after 2025, which the game's first Club World Cup is.
const EDITION = 2029;

// FIFA's 2025 field (Wikipedia, "2025 FIFA Club World Cup", Qualified teams), by Transfermarkt and the game's ids.
const FIELD_2025 = [
  "tm-631", "tm-418", "tm-281", "tm-27", "tm-583", "tm-46", "tm-720", "tm-294", "tm-16", "tm-506", "tm-13", "tm-409",
  "palmeiras-sp", "flamengo-rj", "fluminense-rj", "botafogo-rj", "tm-209", "tm-189",
  "tm-2407", "tm-9636", "tm-4035", "tm-51828", "tm-69261",
  "tm-1114", "tm-828", "tm-2150", "tm-3535",
  "tm-7", "tm-6603", "tm-3342", "tm-6356",
  "tm-11391",
];

function clubWorldCupOf(state: GameState): ContinentalCompetition | undefined {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === "club-world-cup" && c.season === state.season);
  return found?.kind === "continental" ? found : undefined;
}

const confederationsIn = (competition: ContinentalCompetition, ids: readonly string[]) => ids.map((id) => confederationOf(competition.countries[id] ?? ""));
const count = <T,>(values: readonly T[]) => values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<T, number>());

describe("the Club World Cup of a game of the whole world", () => {
  const start = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, season: EDITION });
  const cup = clubWorldCupOf(start);

  it("is played every four years from 2029, as FIFA's, and not in the seasons between", () => {
    const playedIn = (season: number) => clubWorldCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, season })) !== undefined;
    expect([2026, 2027, 2028, 2029, 2030, 2033].filter(playedIn)).toEqual([2029, 2033]);
    expect(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests }).fixtures.filter((f) => f.competitionId.startsWith("club-world-cup"))).toEqual([]);
  });

  it("opens in an edition year that starts the game on FIFA's 2025 field, 12 clubs from Europe, 6 from South America, 5 from North America, 4 each from Asia and Africa, 1 from Oceania", () => {
    expect(cup?.clubIds.toSorted()).toEqual(FIELD_2025.toSorted());
    expect(cup && Object.fromEntries(count(confederationsIn(cup, cup.clubIds)))).toEqual({ uefa: 12, conmebol: 6, concacaf: 5, afc: 4, caf: 4, ofc: 1 });
  });

  it("draws eight groups of four, none with two clubs of a confederation but Europe's, which has two at most, nor two of a country", () => {
    const groups = cup?.stages[0]?.kind === "groups" ? cup.stages[0].groups : [];
    expect(groups.map((group) => group.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    for (const group of groups) {
      if (!cup) continue;
      const confederations = count(confederationsIn(cup, group));
      expect([...confederations].filter(([confederation, n]) => n > (confederation === "uefa" ? 2 : 1))).toEqual([]);
      expect(new Set(group.map((id) => cup.countries[id])).size).toBe(4);
    }
  });

  it("is played in June and July: three group days a week apart, then single matches from the round of 16 to the final", () => {
    expect(cup?.stageDates).toEqual([["2029-06-05", "2029-06-12", "2029-06-19"], ["2029-06-26"], ["2029-07-03"], ["2029-07-10"], ["2029-07-15"]]);
    const groupGames = start.fixtures.filter((f) => f.competitionId === cup?.id);
    expect(groupGames).toHaveLength(48);
    const flamengo = groupGames.filter((f) => f.homeId === "flamengo-rj" || f.awayId === "flamengo-rj").map((f) => f.date);
    expect(flamengo).toEqual(["2029-06-05", "2029-06-12", "2029-06-19"]);
  });

  it("keeps Brazil's Série A clear of its days, as of CONMEBOL's", () => {
    const days = new Set(cup?.stageDates.flat());
    const serieA = Object.values(start.competitions).find((c) => c.kind === "league" && c.division === "A");
    const near = (date: string) => [-1, 0, 1].some((shift) => days.has(new Date(Date.parse(date) + shift * 86_400_000).toISOString().slice(0, 10)));
    expect(serieA?.stageDates.flat().filter(near)).toEqual([]);
  });

  it("keeps the same days on the unified calendar, every league's grid clear of them", () => {
    const rapido = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, formats: RAPIDO, season: EDITION });
    const days = clubWorldCupOf(rapido)?.stageDates;
    expect(days).toEqual(cup?.stageDates);
    expect(rapido.calendar.leagueGrid?.filter((date) => days?.flat().includes(date))).toEqual([]);
  });

  it("draws the same groups from the same seed", () => {
    const again = clubWorldCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, season: EDITION }));
    expect(again?.stages).toEqual(cup?.stages);
  });

  it("is not played in a game without its guests, as in one saved before them", () => {
    expect(clubWorldCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, season: EDITION }))).toBeUndefined();
  });

  it("pays a Brazilian club FIFA's South American participation on its first match and two million dollars a win", () => {
    if (!cup) throw new Error("no Club World Cup");
    const first = start.fixtures.find((f) => f.competitionId === cup.id && f.homeId === "flamengo-rj") ?? start.fixtures.find((f) => f.competitionId === cup.id && f.awayId === "flamengo-rj");
    if (!first) throw new Error("Flamengo plays no group game");
    const isHome = first.homeId === "flamengo-rj";
    const won: Fixture = { ...first, result: { homeGoals: isHome ? 2 : 0, awayGoals: isHome ? 0 : 2 } };
    const brl = (usd: number) => Math.round(usd * start.economy.continental.usdBrl * (start.market.eurBrl / OPENING_EUR_BRL));
    const paid = payContinentalPrizes({ ...start, fixtures: start.fixtures.map((f) => (f.id === won.id ? won : f)) }, [won]).events.filter((e) => e.clubId === "flamengo-rj");
    expect(paid.map((e) => e.amount)).toEqual([brl(15_210_000), brl(2_000_000)]);
  });
});

describe("the next Club World Cup's field", () => {
  const start = loadNewGame(SEED, { coachClubId: null, world, guests, season: EDITION - 1 });
  const filed = (country: string, championId: string): GameState["world"] => {
    const found = start.world?.[country];
    if (!found) throw new Error(`no ${country}`);
    return { [country]: { ...found, seasons: [{ season: EDITION - 1, champions: [championId], promoted: [[]], relegated: [[]], continental: {} }] } };
  };
  const champions = { ...start.history.current.champions, libertadores: "bahia-ba" };
  const state: GameState = {
    ...start,
    history: { ...start.history, current: { ...start.history.current, champions } },
    world: { ...start.world, ...filed("us", "tm-40058"), ...filed("mx", "tm-3631"), ...filed("sa", "tm-18544") },
  };
  const field = seasonEndField(state);
  const clubIds = field?.clubWorldCup ?? [];

  it("is drawn only at the end of the season before an edition", () => {
    const edition = loadNewGame(SEED, { coachClubId: null, world, guests, season: EDITION });
    expect(seasonEndField(edition)?.clubWorldCup).toEqual([]);
    expect(seasonEndField(loadNewGame(SEED, { coachClubId: null, world, guests }))?.clubWorldCup).toEqual([]);
  });

  it("takes the last four Libertadores and Champions League winners and the season's MLS, Liga MX and Saudi champions", () => {
    expect(clubIds).toHaveLength(32);
    // The Libertadores' 2023 to 2025 winners and the game's; the Champions League's 2022/23 to 2025/26.
    expect(clubIds).toEqual(expect.arrayContaining(["fluminense-rj", "botafogo-rj", "flamengo-rj", "bahia-ba", "tm-281", "tm-418", "tm-583", "tm-40058", "tm-3631", "tm-18544"]));
  });

  it("fills each confederation's places down its ranking, no more than two clubs of a country but its champions and, as FIFA's host, a third MLS club", () => {
    const counts = count(clubIds.map((id) => field?.countries[id] ?? ""));
    expect([...counts].filter(([, n]) => n > 2)).toEqual([["br", 4], ["us", 3]]);
    expect(clubIds.filter((id) => field?.countries[id] === "br").toSorted()).toEqual(["bahia-ba", "botafogo-rj", "flamengo-rj", "fluminense-rj"]);
    expect(Object.fromEntries(count(clubIds.map((id) => confederationOf(field?.countries[id] ?? ""))))).toEqual({ uefa: 12, conmebol: 6, concacaf: 5, afc: 4, caf: 4, ofc: 1 });
  });

  it("gives FIFA's host place to an MLS club even when a Mexican club left out is stronger", () => {
    const strongMexico = world.map((country) =>
      country.structure.id === "mx" ? { ...country, levels: country.levels.map((level) => level.map((club) => ({ ...club, strengths: club.strengths.map((s) => s + 30) }))) } : country,
    );
    const mexicoFirst = loadNewGame(SEED, { coachClubId: null, world: strongMexico, guests, season: EDITION - 1 });
    const next = seasonEndField({ ...mexicoFirst, history: state.history, world: { ...mexicoFirst.world, ...filed("us", "tm-40058"), ...filed("mx", "tm-3631"), ...filed("sa", "tm-18544") } });
    const northAmerica = (next?.clubWorldCup ?? []).filter((id) => confederationOf(next?.countries[id] ?? "") === "concacaf");
    expect(Object.fromEntries(count(northAmerica.map((id) => next?.countries[id])))).toEqual({ us: 3, mx: 2 });
  });
});
