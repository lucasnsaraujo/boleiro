import { describe, expect, test } from "vitest";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { marketClubs, marketLeagues, marketNationalities, NO_FILTERS, searchMarket, strengthBounds, windowStatus, type MarketFilters } from "./marketSearch.js";

const COACH = "sport-pe";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const ALL = Number.MAX_SAFE_INTEGER;
const search = (filters: Partial<MarketFilters>, state: GameState = game) => searchMarket(state, { ...NO_FILTERS, ...filters }, ALL).rows;

function anyPlayerOf(clubId: string): SimPlayer {
  const found = Object.values(game.players).find((p) => p.clubId === clubId);
  if (!found) throw new Error(`no player at ${clubId}`);
  return found;
}

describe("searching the market", () => {
  test("lists other clubs' players, strongest first, never the coach's own", () => {
    const rows = search({});
    expect(rows.some((r) => game.players[r.id]?.clubId === COACH)).toBe(false);
    expect(rows.length).toBe(Object.values(game.players).filter((p) => p.clubId !== COACH).length);
    expect(rows.map((r) => r.strength)).toEqual(rows.map((r) => r.strength).toSorted((a, b) => b - a));
  });

  test("finds a name without minding accents or case", () => {
    const target = anyPlayerOf("palmeiras-sp");
    const typed = target.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
    expect(search({ name: typed }).map((r) => r.id)).toContain(target.id);
  });

  test("filters by position, strength range, club and division", () => {
    expect(search({ group: "GK" }).every((r) => r.group === "GK")).toBe(true);
    const ranged = search({ minStrength: 70, maxStrength: 72 });
    expect(ranged.length).toBeGreaterThan(0);
    expect(ranged.every((r) => r.strength >= 69.5 && r.strength < 72.5)).toBe(true);
    expect(search({ clubId: "palmeiras-sp" }).every((r) => r.clubId === "palmeiras-sp")).toBe(true);
    const serieC = search({ division: "C" });
    expect(serieC.length).toBeGreaterThan(0);
    expect(serieC.every((r) => r.clubId !== null && game.clubs[r.clubId]?.division === "C")).toBe(true);
  });

  test("the strength range spans the weakest to the strongest player the coach could look for, free agents included", () => {
    const rows = search({});
    const strengths = rows.map((r) => Math.round(r.strength));
    expect(strengthBounds(game)).toEqual({ min: Math.min(...strengths), max: Math.max(...strengths) });
    const free = { ...anyPlayerOf("vitoria-ba"), id: "free-1", strength: 99.4 };
    expect(strengthBounds({ ...game, market: { ...game.market, freeAgents: { [free.id]: free } } }).max).toBe(99);
  });

  test("filters free agents, contracts in their last six months and bigger clubs' reserves who can be borrowed", () => {
    const free = { ...anyPlayerOf("vitoria-ba"), id: "free-1" };
    const ending = { ...anyPlayerOf("ceara-ce"), contractUntil: "2026-05-31" };
    const state = { ...game, players: { ...game.players, [ending.id]: ending }, market: { ...game.market, freeAgents: { [free.id]: free } } };

    const freeAgents = search({ status: "freeAgent" }, state);
    expect(freeAgents.map((r) => r.id)).toEqual([free.id]);
    expect(freeAgents[0]).toMatchObject({ clubId: null, price: 0 });

    const ending6 = search({ status: "contractEnding" }, state);
    expect(ending6.map((r) => r.id)).toContain(ending.id);
    expect(ending6.every((r) => r.price === 0)).toBe(true);

    const lendable = search({ status: "lendable" }, state);
    expect(lendable.length).toBeGreaterThan(0);
    expect(lendable.every((r) => r.clubId !== null && game.clubs[r.clubId]?.division === "A")).toBe(true);
  });

  test("a player bought from his club costs a fee; one on loan cannot be bought", () => {
    const target = { ...anyPlayerOf("palmeiras-sp"), contractUntil: "2029-12-31" };
    const loans = { [target.id]: { fromClubId: "flamengo-rj", until: "2026-06-30", lenderWageShare: 0.5, buyOption: null } };
    const bought = search({ name: target.name }, { ...game, players: { ...game.players, [target.id]: target } }).find((r) => r.id === target.id);
    expect(bought?.price).toBeGreaterThan(0);
    const lent = search({ name: target.name }, { ...game, players: { ...game.players, [target.id]: target }, market: { ...game.market, loans } }).find((r) => r.id === target.id);
    expect(lent).toMatchObject({ price: null, status: "onLoan" });
  });

  test("says whether the player wants to come: a jobless player says yes more often than a Série A starter", () => {
    const share = (rows: ReturnType<typeof search>) => rows.filter((r) => r.willing === "yes").length / rows.length;
    const free = Object.fromEntries(Object.values(game.players).filter((p) => p.clubId === "palmeiras-sp").map((p) => [`free-${p.id}`, { ...p, id: `free-${p.id}` }]));
    const freeRows = search({ status: "freeAgent" }, { ...game, market: { ...game.market, freeAgents: free } });
    const palmeiras = search({ clubId: "palmeiras-sp" });
    expect(share(freeRows)).toBeGreaterThan(share(palmeiras));
  });

  test("can keep only players who would say yes or maybe", () => {
    const serieD = newGameFromFiles(5, { coachClubId: "joinville-sc" }, bundledGameFiles);
    const willing = search({ isWillingOnly: true }, serieD);
    expect(willing.length).toBeGreaterThan(0);
    expect(willing.length).toBeLessThan(search({}, serieD).length);
    expect(willing.every((r) => r.willing !== "no")).toBe(true);
  });

  test("prices a club's starter above one of its reserves of the same value", () => {
    const rows = search({ clubId: "palmeiras-sp" }).filter((r) => r.status === null && r.price);
    expect(rows.some((r) => (r.price ?? 0) > r.value * 1.2)).toBe(true);
    expect(rows.every((r) => (r.price ?? 0) >= r.value * 0.99)).toBe(true);
  });

  test("filters by nationality, a player with two counting for either", () => {
    const base = anyPlayerOf("santos-sp");
    const dual = { ...base, nationalities: ["Brazil", "Italy"] };
    const state = { ...game, players: { ...game.players, [dual.id]: dual } };
    const italians = search({ nationality: "Italy" }, state);
    expect(italians.map((r) => r.id)).toContain(dual.id);
    expect(italians.every((r) => state.players[r.id]?.nationalities.includes("Italy"))).toBe(true);
    const argentines = search({ nationality: "Argentina" });
    expect(argentines.length).toBeGreaterThan(0);
    expect(argentines.every((r) => game.players[r.id]?.nationalities.includes("Argentina"))).toBe(true);
  });

  test("filters by this season's goals in every competition and minutes played", () => {
    const [scorer, starter] = Object.values(game.players).filter((p) => p.clubId === "gremio-rs");
    if (!scorer || !starter) throw new Error("Grêmio needs players");
    const history = { ...game.history, current: { ...game.history.current, goals: { "serie-a": { [scorer.id]: 4 }, "state-rs": { [scorer.id]: 3 } } } };
    const played = { ...starter, condition: { ...starter.condition, seasonMinutes: 900 } };
    const state = { ...game, history, players: { ...game.players, [played.id]: played } };
    expect(search({ minGoals: 7 }, state).map((r) => r.id)).toEqual([scorer.id]);
    expect(search({ minGoals: 8 }, state)).toEqual([]);
    expect(search({ minMinutes: 900 }, state).map((r) => r.id)).toEqual([played.id]);
    expect(search({ minGoals: 1, minMinutes: 1 }, state)).toEqual([]);
  });

  test("a free agent's minutes are from before he was released, maybe seasons ago, so the minutes filter counts none for him", () => {
    const released = { ...anyPlayerOf("vitoria-ba"), id: "free-1" };
    const free = { ...released, condition: { ...released.condition, seasonMinutes: 2000 } };
    const state = { ...game, market: { ...game.market, freeAgents: { [free.id]: free } } };
    expect(search({ minMinutes: 90 }, state)).toEqual([]);
    expect(search({ status: "freeAgent" }, state).map((r) => r.id)).toEqual([free.id]);
  });

  test("filters combine: a league, a nationality and a position together", () => {
    const rows = search({ division: "A", nationality: "Argentina", group: "MID" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.group === "MID" && r.clubId !== null && game.clubs[r.clubId]?.division === "A" && game.players[r.id]?.nationalities.includes("Argentina"))).toBe(true);
    expect(rows.length).toBeLessThan(search({ division: "A", group: "MID" }).length);
  });

  test("offers the leagues by country, the clubs of the league chosen and the nationalities on the market in Portuguese", () => {
    expect(marketLeagues(game)).toEqual([
      { value: "A", label: "Série A", group: "Brasil" },
      { value: "B", label: "Série B", group: "Brasil" },
      { value: "C", label: "Série C", group: "Brasil" },
      { value: "D", label: "Série D", group: "Brasil" },
    ]);
    const serieB = marketClubs(game, "B");
    expect(serieB.length).toBe(Object.values(game.clubs).filter((c) => c.division === "B" && c.id !== COACH).length);
    expect(serieB.every((option) => game.clubs[option.value]?.division === "B")).toBe(true);
    expect(marketClubs(game, null).map((option) => option.value)).not.toContain(COACH);
    expect(new Set(marketClubs(game, null).map((option) => option.group))).toEqual(new Set(["Série A", "Série B", "Série C", "Série D"]));

    const nationalities = marketNationalities(game);
    expect(nationalities).toContainEqual({ value: "Brazil", label: "Brasil" });
    expect(nationalities).toContainEqual({ value: "Uruguay", label: "Uruguai" });
    const odd = Object.values(game.players).slice(0, 6);
    const named = (nationalities: string[]) => odd.map((p, i): [string, SimPlayer] => [p.id, { ...p, nationalities: [nationalities[i] ?? "Brazil"] }]);
    const withOdd = { ...game, players: { ...game.players, ...Object.fromEntries(named(["England", "Korea, South", "Cote d'Ivoire", "DR Congo", "N", "A"])) } };
    const odds = marketNationalities(withOdd);
    expect(odds).toContainEqual({ value: "England", label: "Inglaterra" });
    expect(odds).toContainEqual({ value: "Korea, South", label: "Coreia do Sul" });
    expect(odds).toContainEqual({ value: "Cote d'Ivoire", label: "Costa do Marfim" });
    expect(odds).toContainEqual({ value: "DR Congo", label: "RD Congo" });
    expect(odds.some((option) => option.value.length < 2)).toBe(false);
    const labels = nationalities.map((option) => option.label);
    expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b, "pt-BR")));
  });

  test("returns the first rows and how many matched", () => {
    const { total, rows } = searchMarket(game, NO_FILTERS, 12);
    expect(rows).toHaveLength(12);
    expect(total).toBe(search({}).length);
  });
});

describe("the transfer window", () => {
  test("open: until when; closed: when it opens next, into the next year after September", () => {
    expect(windowStatus("2026-01-01")).toEqual({ isOpen: false, date: "2026-01-05" });
    expect(windowStatus("2026-02-10")).toEqual({ isOpen: true, date: "2026-03-03" });
    expect(windowStatus("2026-05-01")).toEqual({ isOpen: false, date: "2026-07-20" });
    expect(windowStatus("2026-10-01")).toEqual({ isOpen: false, date: "2027-01-05" });
  });
});
