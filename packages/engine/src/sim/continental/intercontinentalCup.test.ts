import { describe, expect, it } from "vitest";
import type { ContinentalCompetition, Fixture, GameState } from "../gameState.js";
import { RAPIDO, REALISTA } from "../formats.js";
import { loadNewGame } from "../loadNewGame.js";
import { isNextStageReady, openNextStage } from "../openNextStage.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadGuests } from "../world/loadGuests.js";
import { loadMarketLeagues } from "../world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { confederationOf } from "./clubWorldCup.js";
import type { SeasonSoFar } from "./conmebolCups.js";
import { seasonEndField } from "./continentalField.js";
import { continentalPrizesEarned, payContinentalPrizes } from "./payContinentalPrizes.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);
const SEED = 7;

function intercontinentalCupOf(state: GameState): ContinentalCompetition | undefined {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === "intercontinental-cup" && c.season === state.season);
  return found?.kind === "continental" ? found : undefined;
}

describe("the Intercontinental Cup of a game of the whole world", () => {
  const start = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests });
  const cup = intercontinentalCupOf(start);

  it("is played every season, Club World Cup editions too, and not in a game without the Club World Cup's guests", () => {
    const playedIn = (season: number) => intercontinentalCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, season })) !== undefined;
    expect(cup).toBeDefined();
    expect([2027, 2028, 2029].filter(playedIn)).toEqual([2027, 2028, 2029]);
    expect(intercontinentalCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world }))).toBeUndefined();
  });

  it("is not played in a game whose world lacks Europe's clubs, as the Champions League's winner plays its final", () => {
    const withoutEurope = [...loadSouthAmerica(2026), ...loadMarketLeagues(2026)];
    expect(intercontinentalCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world: withoutEurope, guests }))).toBeUndefined();
  });

  it("plays one match a round: the play-off and the African–Asian–Pacific Cup on September and October Tuesdays, the Derby of the Americas, the Challenger Cup and the final in mid-December", () => {
    expect(cup?.stageDates).toEqual([["2026-09-15"], ["2026-10-13"], ["2026-12-09"], ["2026-12-12"], ["2026-12-16"]]);
    const rapido = intercontinentalCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, formats: RAPIDO }));
    expect(rapido?.stageDates).toEqual(cup?.stageDates);
  });

  it("falls on no day next to a Série A or B round or the unified calendar's, every format keeping it clear without a league moving for it", () => {
    const leagueDaysNextToIt = (game: GameState) => {
      const days = intercontinentalCupOf(game)?.stageDates.flat() ?? [];
      const leagueDays = [...Object.values(game.competitions).flatMap((c) => (c.kind === "league" && (c.division === "A" || c.division === "B") ? c.stageDates.flat() : [])), ...(game.calendar.leagueGrid ?? [])];
      return leagueDays.filter((date) => days.some((day) => Math.abs(Date.parse(day) - Date.parse(date)) <= 86_400_000));
    };
    const rapido = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, formats: RAPIDO });
    expect(leagueDaysNextToIt(start)).toEqual([]);
    expect(leagueDaysNextToIt(rapido)).toEqual([]);
    expect(rapido.calendar).toEqual(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, formats: RAPIDO }).calendar);
    expect(start.calendar).toEqual(loadNewGame(SEED, { coachClubId: "flamengo-rj", world }).calendar);
  });

  it("falls on no day next to a Copa do Brasil round or a coached MLS, Liga MX or Saudi league's, in Realista and Rápido, a club abroad's on the unified calendar", () => {
    const cupDaysNextToIt = (game: GameState) => {
      const days = intercontinentalCupOf(game)?.stageDates.flat() ?? [];
      const clashes = Object.values(game.competitions).flatMap((c) => (c.kind === "cup" || (c.kind === "league" && c.abroad) ? c.stageDates.flat() : []));
      return clashes.filter((date) => days.some((day) => Math.abs(Date.parse(day) - Date.parse(date)) <= 86_400_000));
    };
    for (const formats of [REALISTA, RAPIDO]) {
      expect(cupDaysNextToIt(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, formats }))).toEqual([]);
      for (const coachClubId of ["tm-51828", "tm-3631", "tm-1114"]) {
        const game = loadNewGame(SEED, { coachClubId, world, guests, formats: { ...formats, calendar: "unified" } });
        expect(Object.values(game.competitions).some((c) => c.kind === "league" && c.abroad && c.clubIds.includes(coachClubId))).toBe(true);
        expect(cupDaysNextToIt(game)).toEqual([]);
      }
    }
  });

  it("opens on the play-off, the AFC's club at home to the OFC's in an even year, CAF's waiting in the next round and CONCACAF's in the Derby", () => {
    const confederations = cup?.entries.map((ids) => ids.map((id) => confederationOf(cup.countries[id] ?? "")));
    expect(confederations).toEqual([["afc", "ofc"], ["caf"], ["concacaf"], [], []]);
    const playOff = start.fixtures.filter((f) => f.competitionId === cup?.id);
    expect(playOff.map((f) => [f.date, f.homeId, f.awayId])).toEqual([["2026-09-15", ...(cup?.entries[0] ?? [])]]);
    const odd = intercontinentalCupOf(loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests, season: 2027 }));
    expect(odd?.entries.map((ids) => ids.map((id) => confederationOf(odd.countries[id] ?? "")))).toEqual([["caf", "ofc"], ["afc"], ["concacaf"], [], []]);
  });
});

/** The cup's current stage played, its first club winning, and the stages after it drawn as the day's end would draw them. */
function playStage(competition: ContinentalCompetition, fixtures: readonly Fixture[], season: Omit<SeasonSoFar, "fixtures">): { competition: ContinentalCompetition; fixtures: Fixture[] } {
  const stage = competition.stages.length - 1;
  const played = fixtures.map((f) => (f.competitionId === competition.id && f.stage === stage && !f.result ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f));
  const own = played.filter((f) => f.competitionId === competition.id);
  if (competition.stages.length >= competition.stageDates.length || !isNextStageReady(competition, { ...season, fixtures: played })) return { competition, fixtures: played };
  const opened = openNextStage(competition, own, {}, { ...season, fixtures: played });
  return { competition: opened.competition, fixtures: [...played, ...opened.fixtures] };
}

describe("the Intercontinental Cup's later rounds", () => {
  const start = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests });
  const opening = intercontinentalCupOf(start);
  if (!opening) throw new Error("no Intercontinental Cup");
  const libertadores = Object.values(start.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores");
  if (libertadores?.kind !== "continental") throw new Error("no Libertadores");
  // The Libertadores reduced to its final, Bahia beating Boca Juniors.
  const final: ContinentalCompetition = { ...libertadores, stages: [{ kind: "knockout", ties: [["bahia-ba", "tm-189"]], dates: ["2026-11-24"] }], stageDates: [["2026-11-24"]] };
  const finalFixture: Fixture = { id: "final", competitionId: final.id, stage: 0, tie: 0, date: "2026-11-24", homeId: "bahia-ba", awayId: "tm-189", result: null };
  const before = { competitions: { [final.id]: final }, championsLeague: "tm-27" };
  let cup = playStage(opening, start.fixtures.filter((f) => f.competitionId !== libertadores.id), before);
  cup = playStage(cup.competition, cup.fixtures, before);
  const waiting = playStage(cup.competition, [...cup.fixtures, finalFixture], before);

  it("draws its African–Asian–Pacific Cup between the club with the bye, at home, and the play-off's winner", () => {
    expect(waiting.competition.stages[1]).toMatchObject({ kind: "knockout", ties: [[opening.entries[1]?.[0], opening.entries[0]?.[0]]] });
  });

  it("waits for the Libertadores final to draw the Derby of the Americas, then sets its winner, at home in an even year, against CONCACAF's club", () => {
    expect(waiting.competition.stages).toHaveLength(2);
    const decided = waiting.fixtures.map((f) => (f.id === "final" ? { ...f, result: { homeGoals: 2, awayGoals: 1 } } : f));
    expect(isNextStageReady(waiting.competition, { ...before, fixtures: decided })).toBe(true);
    const derby = openNextStage(waiting.competition, decided.filter((f) => f.competitionId === opening.id), {}, { ...before, fixtures: decided });
    expect(derby.competition.stages[2]).toMatchObject({ ties: [["bahia-ba", opening.entries[2]?.[0]]] });
    expect(derby.fixtures.map((f) => [f.date, f.homeId])).toEqual([["2026-12-09", "bahia-ba"]]);
  });

  it("plays the Challenger Cup between the Derby's winner, at home, and the African–Asian–Pacific Cup's, and the final against the latest Champions League winner, at home", () => {
    const decided = waiting.fixtures.map((f) => (f.id === "final" ? { ...f, result: { homeGoals: 2, awayGoals: 1 } } : f));
    let next = playStage(waiting.competition, decided, before);
    next = playStage(next.competition, next.fixtures, before);
    next = playStage(next.competition, next.fixtures, before);
    expect(next.competition.stages.map((stage) => (stage.kind === "knockout" ? stage.ties[0] : null))).toEqual([
      opening.entries[0],
      [opening.entries[1]?.[0], opening.entries[0]?.[0]],
      ["bahia-ba", opening.entries[2]?.[0]],
      ["bahia-ba", opening.entries[1]?.[0]],
      ["tm-27", "bahia-ba"],
    ]);
  });
});

describe("the Intercontinental Cup's prizes", () => {
  const start = loadNewGame(SEED, { coachClubId: "flamengo-rj", world, guests });
  const opening = intercontinentalCupOf(start);
  if (!opening) throw new Error("no Intercontinental Cup");
  const brl = (usd: number) => Math.round(usd * start.economy.continental.usdBrl * (start.market.eurBrl / OPENING_EUR_BRL));
  // Bahia, the Libertadores' winner, at home in the Derby of the Americas and away in the final.
  const atStage = (stage: number, ties: [string, string][]): GameState => {
    const competition: ContinentalCompetition = {
      ...opening,
      stages: [...opening.stages, ...ties.map((tie, i) => ({ kind: "knockout" as const, ties: [tie], dates: opening.stageDates[i + 1] ?? [] }))].slice(0, stage + 1),
    };
    return { ...start, competitions: { ...start.competitions, [opening.id]: competition } };
  };
  const play = (state: GameState, stage: number, homeGoals: number, awayGoals: number) => {
    const competition = state.competitions[opening.id];
    const tie = competition?.stages[stage]?.kind === "knockout" ? competition.stages[stage].ties[0] : undefined;
    if (!tie) throw new Error(`no tie at stage ${stage}`);
    const fixture: Fixture = { id: `ic:${stage}`, competitionId: opening.id, stage, tie: 0, date: opening.stageDates[stage]?.[0] ?? "", homeId: tie[0], awayId: tie[1], result: { homeGoals, awayGoals } };
    const played = { ...state, fixtures: [...state.fixtures, fixture] };
    return { paid: payContinentalPrizes(played, [fixture]).events.filter((e) => e.clubId === "bahia-ba").map((e) => e.amount), earned: continentalPrizesEarned(played, "bahia-ba") };
  };
  const ladder: [string, string][] = [[opening.entries[1]?.[0] ?? "", opening.entries[0]?.[0] ?? ""], ["bahia-ba", opening.entries[2]?.[0] ?? ""], ["bahia-ba", opening.entries[1]?.[0] ?? ""], ["tm-27", "bahia-ba"]];

  it("pays a club by how far it went, once it is out: 2 million dollars for the Derby of the Americas' loser and nothing for its winner yet", () => {
    expect(play(atStage(2, ladder), 2, 0, 1)).toEqual({ paid: [brl(2_000_000)], earned: brl(2_000_000) });
    expect(play(atStage(2, ladder), 2, 1, 0)).toEqual({ paid: [], earned: 0 });
  });

  it("pays 2.5 million for the Challenger Cup's loser, 4 million for the runner-up and 5 million for the champion, as FIFA's 2024 edition", () => {
    expect(play(atStage(3, ladder), 3, 0, 1).paid).toEqual([brl(2_500_000)]);
    expect(play(atStage(4, ladder), 4, 1, 0).paid).toEqual([brl(4_000_000)]);
    expect(play(atStage(4, ladder), 4, 0, 1).paid).toEqual([brl(5_000_000)]);
  });
});

describe("the next Intercontinental Cup's clubs", () => {
  const start = loadNewGame(SEED, { coachClubId: null, world, guests });
  const filed = (country: string, championId: string): GameState["world"] => {
    const found = start.world?.[country];
    if (!found) throw new Error(`no ${country}`);
    return { [country]: { ...found, seasons: [{ season: 2026, champions: [championId], promoted: [[]], relegated: [[]], continental: {} }] } };
  };
  const strengthOf = (id: string) => [...(start.world?.us?.clubs[id] ?? start.world?.mx?.clubs[id])?.strengths ?? []].sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0);
  // Inter Miami and Monterrey as MLS's and Liga MX's champions, Al-Nassr as Saudi Arabia's.
  const [stronger, weaker] = ["tm-69261", "tm-2407"].sort((a, b) => strengthOf(b) - strengthOf(a));
  const state: GameState = { ...start, world: { ...start.world, ...filed("us", "tm-69261"), ...filed("mx", "tm-2407"), ...filed("sa", "tm-18544") } };
  const entries = seasonEndField(state)?.intercontinentalCup ?? [];

  it("takes the AFC's place from the Saudi league's champion, in the next round in an odd year, and CONCACAF's from the stronger of MLS's and Liga MX's", () => {
    expect(entries[1]).toEqual(["tm-18544"]);
    expect(entries[2]).toEqual([stronger]);
    expect(entries.flat()).not.toContain(weaker);
  });
});

