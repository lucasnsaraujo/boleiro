import { describe, expect, test } from "vitest";
import type { Competition, ContinentalCompetition, CupCompetition, Fixture, GameState, LeagueCompetition, MatchResult } from "@boleiro/engine/sim/gameState";
import { RAPIDO } from "@boleiro/engine/sim/formats";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import {
  coachCompetitions,
  competitionStages,
  defaultStage,
  groupTables,
  knockoutBracket,
  knockoutTies,
  lastPlayedLeg,
  openingCompetitionId,
  playedRounds,
  tableTabs,
  topScorers,
  worldLeagueTables,
  type TableRow,
} from "./competitionTables.js";

// A game of Brazil alone, for the national competitions; South America's game is below.
const game = newGameFromFiles(7, { coachClubId: "bahia-ba" }, { ...bundledGameFiles, world: [] });

function competition(id: string): Competition {
  const found = game.competitions[id];
  if (!found) throw new Error(`no competition ${id}`);
  return found;
}

const zonesByPosition = (rows: readonly TableRow[]) => rows.map((row) => row.zone);
const repeat = <T>(value: T, times: number): T[] => Array.from({ length: times }, () => value);

describe("coachCompetitions", () => {
  test("are the state championship, the league and the cup the coach's club plays this season", () => {
    expect(coachCompetitions(game).map((c) => c.id)).toEqual(["state-ba-2026", "serie-a-2026", "copa-do-brasil-2026"]);
  });

  test("a coach without a club sees the Série A and the Copa do Brasil", () => {
    expect(coachCompetitions({ ...game, coachClubId: null }).map((c) => c.id)).toEqual(["serie-a-2026", "copa-do-brasil-2026"]);
  });
});

describe("tableTabs", () => {
  test("are every national competition, then the coach's state championship, with the other states apart", () => {
    const { tabs, otherStates } = tableTabs(game);
    expect(tabs.map((c) => c.id)).toEqual(["serie-a-2026", "serie-b-2026", "serie-c-2026", "serie-d-2026", "copa-do-brasil-2026", "state-ba-2026"]);
    expect(otherStates.map((c) => c.id)).not.toContain("state-ba-2026");
    expect(otherStates.length).toBeGreaterThan(0);
    expect(otherStates.every((c) => c.kind === "state" && c.season === 2026)).toBe(true);
  });

  test("a coach without a club finds every state championship among the others", () => {
    const { tabs, otherStates } = tableTabs({ ...game, coachClubId: null });
    const states = Object.values(game.competitions).filter((c) => c.kind === "state");
    expect(tabs.map((c) => c.id)).toEqual(["serie-a-2026", "serie-b-2026", "serie-c-2026", "serie-d-2026", "copa-do-brasil-2026"]);
    expect(otherStates).toHaveLength(states.length);
  });
});

describe("groupTables zones", () => {
  test("Série A: four to the Libertadores, one to its preliminary phase, six to the Sul-Americana, four relegated", () => {
    const { groups, zones } = groupTables(competition("serie-a-2026"), 0, game.fixtures);
    expect(groups).toHaveLength(1);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([
      ...repeat("libertadores", 4),
      "preLibertadores",
      ...repeat("sulAmericana", 6),
      ...repeat(null, 5),
      ...repeat("relegation", 4),
    ]);
    expect(zones.map((z) => z.label)).toEqual(["Libertadores", "Pré-Libertadores", "Sul-Americana", "Rebaixamento"]);
  });

  test("Série A: once the Copa do Brasil final is played, its champion and runner-up take the first places", () => {
    const league = competition("serie-a-2026");
    const order = groupTables(league, 0, game.fixtures).groups[0]?.rows.map((row) => row.clubId) ?? [];
    const [champion, runnerUp] = [order[6] ?? "", order[7] ?? ""];
    const rows = groupTables(league, 0, game.fixtures, { championId: champion, runnerUpId: runnerUp }).groups[0]?.rows ?? [];
    const zoneOf = (clubId: string) => rows.find((row) => row.clubId === clubId)?.zone;
    expect(zoneOf(champion)).toBe("libertadores");
    expect(zoneOf(runnerUp)).toBe("preLibertadores");
    expect(zoneOf(order[3] ?? "")).toBe("libertadores");
    expect(zoneOf(order[4] ?? "")).toBe("preLibertadores");
    expect(zoneOf(order[5] ?? "")).toBe("sulAmericana");
    expect(rows.filter((row) => row.zone === "sulAmericana")).toHaveLength(6);
  });

  test("Série B: four promoted and four relegated", () => {
    const { groups } = groupTables(competition("serie-b-2026"), 0, game.fixtures);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([...repeat("promotion", 4), ...repeat(null, 12), ...repeat("relegation", 4)]);
  });

  test("Série C first phase: eight to the quadrangulars, two relegated in 2026", () => {
    const { groups } = groupTables(competition("serie-c-2026"), 0, game.fixtures);
    const rows = groups[0]?.rows ?? [];
    expect(zonesByPosition(rows)).toEqual([...repeat("advance", 8), ...repeat(null, rows.length - 10), ...repeat("relegation", 2)]);
  });

  test("Série D groups: the top four of each group of six go through, the last two drop out", () => {
    const { groups } = groupTables(competition("serie-d-2026"), 0, game.fixtures);
    expect(groups).toHaveLength(16);
    expect(groups[0]?.label).toBe("Grupo A");
    for (const group of groups) expect(zonesByPosition(group.rows)).toEqual([...repeat("advance", 4), ...repeat("relegation", 2)]);
  });

  test("a state championship marks the clubs that would reach the knockout, ranked across the groups", () => {
    const { groups, zones } = groupTables(competition("state-ba-2026"), 0, game.fixtures);
    expect(groups.map((g) => g.label)).toEqual(["Grupo A", "Grupo B"]);
    // Ten clubs send four to the knockout: with two groups, the top two of each.
    for (const group of groups) expect(zonesByPosition(group.rows)).toEqual(["advance", "advance", null, null, null]);
    expect(zones.map((z) => z.label)).toEqual(["Mata-mata"]);
  });

  test("rows follow the standings once games are played", () => {
    const league = competition("serie-a-2026");
    const [first] = game.fixtures.filter((f) => f.competitionId === league.id);
    if (!first) throw new Error("no Série A fixture");
    const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === first.id ? { ...f, result: { homeGoals: 3, awayGoals: 0 } } : f));
    const rows = groupTables(league, 0, fixtures).groups[0]?.rows ?? [];
    expect(rows[0]).toMatchObject({ clubId: first.homeId, position: 1, points: 3, goalDifference: 3, played: 1 });
    expect(rows.at(-1)).toMatchObject({ clubId: first.awayId, position: 20, zone: "relegation" });
  });
});

describe("rounds of a group stage", () => {
  const league = competition("serie-a-2026");
  const roundDates = league.stages[0]?.kind === "groups" ? league.stages[0].dates : [];
  const roundOf = (f: Fixture) => roundDates.indexOf(f.date) + 1;
  /** Série A with its first `rounds` rounds played, every game won by `score(fixture)`. */
  const playedThrough = (rounds: number, score: (f: Fixture) => MatchResult = () => ({ homeGoals: 1, awayGoals: 0 })): Fixture[] =>
    game.fixtures.map((f) => (f.competitionId === league.id && roundOf(f) <= rounds ? { ...f, result: score(f) } : f));

  test("counts the rounds played so far", () => {
    expect(playedRounds(league, 0, game.fixtures)).toBe(0);
    expect(playedRounds(league, 0, playedThrough(3))).toBe(3);
  });

  test("a table through an earlier round leaves the later games out", () => {
    const rows = groupTables(league, 0, playedThrough(3), null, 2).groups[0]?.rows ?? [];
    expect(rows.map((row) => row.played)).toEqual(repeat(2, 20));
  });

  test("each row carries the club's last five results, oldest first", () => {
    const clubId = "bahia-ba";
    // Bahia's goals minus the opponent's in rounds 1 to 6: win, draw, win, loss, loss, loss.
    const margins = [2, 0, 1, -1, -3, -1];
    const fixtures = playedThrough(6, (f) => {
      const margin = margins[roundOf(f) - 1] ?? 0;
      if (f.homeId === clubId) return { homeGoals: Math.max(0, margin), awayGoals: Math.max(0, -margin) };
      if (f.awayId === clubId) return { homeGoals: Math.max(0, -margin), awayGoals: Math.max(0, margin) };
      return { homeGoals: 0, awayGoals: 0 };
    });
    const bahia = groupTables(league, 0, fixtures).groups[0]?.rows.find((row) => row.clubId === clubId);
    expect(bahia?.form).toEqual(["draw", "win", "loss", "loss", "loss"]);
    const throughTwo = groupTables(league, 0, fixtures, null, 2).groups[0]?.rows.find((row) => row.clubId === clubId);
    expect(throughTwo?.form).toEqual(["win", "draw"]);
  });

  test("each form mark links the match it stands for, so the table opens its ficha", () => {
    const clubId = "bahia-ba";
    const fixtures = playedThrough(6);
    const bahia = groupTables(league, 0, fixtures).groups[0]?.rows.find((row) => row.clubId === clubId);
    const games = fixtures.filter((f) => f.result && (f.homeId === clubId || f.awayId === clubId)).toSorted((a, b) => a.date.localeCompare(b.date));
    expect(bahia?.formRefs).toEqual(games.slice(-5).map((f) => f.id));
  });

  test("each row tells the places gained or lost in the last round played", () => {
    // Round 1 won by the home sides, round 2 by the away sides: the table turns over.
    const fixtures = playedThrough(2, (f) => (roundOf(f) === 1 ? { homeGoals: 1, awayGoals: 0 } : { homeGoals: 0, awayGoals: 3 }));
    const before = groupTables(league, 0, fixtures, null, 1).groups[0]?.rows ?? [];
    const after = groupTables(league, 0, fixtures).groups[0]?.rows ?? [];
    expect(before.map((row) => row.movement)).toEqual(repeat(0, 20));
    const placeBefore = new Map(before.map((row) => [row.clubId, row.position]));
    expect(after.map((row) => row.movement)).toEqual(after.map((row) => (placeBefore.get(row.clubId) ?? 0) - row.position));
    expect(after.some((row) => row.movement > 0) && after.some((row) => row.movement < 0)).toBe(true);
  });
});

describe("knockout ties and the cup bracket", () => {
  const cup: CupCompetition = {
    id: "copa-do-brasil-2026",
    kind: "cup",
    season: 2026,
    clubIds: ["a", "b", "c", "d"],
    entries: [["a", "b", "c", "d"]],
    stages: [{ kind: "knockout", ties: [["a", "b"], ["c", "d"]], dates: ["2026-08-02", "2026-08-08"] }],
    stageDates: [["2026-08-02", "2026-08-08"], ["2026-12-06"]],
    drawOrder: ["a", "b", "c", "d"],
  };
  const leg = (id: string, tie: number, date: string, homeId: string, awayId: string, result: MatchResult | null): Fixture => ({
    id, competitionId: cup.id, stage: 0, tie, date, homeId, awayId, result,
  });
  const fixtures: Fixture[] = [
    leg("a1", 0, "2026-08-02", "b", "a", { homeGoals: 2, awayGoals: 1 }),
    leg("a2", 0, "2026-08-08", "a", "b", { homeGoals: 2, awayGoals: 0 }),
    leg("c1", 1, "2026-08-02", "d", "c", { homeGoals: 1, awayGoals: 0 }),
    leg("c2", 1, "2026-08-08", "c", "d", null),
  ];

  test("a two-legged tie adds both legs up and names the winner once it is over", () => {
    const [decided, open] = knockoutTies(cup, 0, fixtures);
    expect(decided).toMatchObject({ clubIds: ["a", "b"], aggregate: [3, 2], winnerId: "a", onPenalties: false });
    expect(decided?.legs.map((l) => [l.homeId, l.homeGoals, l.awayGoals, l.awayId])).toEqual([
      ["b", 2, 1, "a"],
      ["a", 2, 0, "b"],
    ]);
    expect(open).toMatchObject({ clubIds: ["c", "d"], aggregate: [0, 1], winnerId: null });
  });

  test("a tie's ficha opens on its return leg once played, on its first leg before that, and on none before a ball is kicked", () => {
    const [decided, open] = knockoutTies(cup, 0, fixtures);
    expect(decided && lastPlayedLeg(decided)?.fixtureId).toBe("a2");
    expect(open && lastPlayedLeg(open)?.fixtureId).toBe("c1");
    const [unplayed] = knockoutTies(cup, 0, fixtures.map((f) => ({ ...f, result: null })));
    expect(unplayed && lastPlayedLeg(unplayed)).toBeUndefined();
  });

  test("a level tie goes to the club that won the shootout", () => {
    const level = fixtures.map((f) => (f.id === "a2" ? { ...f, result: { homeGoals: 1, awayGoals: 0, penaltyWinnerId: "b" } } : f));
    expect(knockoutTies(cup, 0, level)[0]).toMatchObject({ aggregate: [2, 2], winnerId: "b", onPenalties: true });
  });

  test("a tie with no leg played has no aggregate", () => {
    expect(knockoutTies(cup, 0, fixtures.map((f) => ({ ...f, result: null })))[0]).toMatchObject({ aggregate: null, winnerId: null });
  });

  test("the Copa do Brasil bracket names all nine rounds and has ties only where drawn", () => {
    const copa = competition("copa-do-brasil-2026");
    const rounds = competitionStages(copa, game.calendar);
    expect(rounds.map((r) => r.name)).toEqual(["1ª fase", "2ª fase", "3ª fase", "4ª fase", "5ª fase", "Oitavas", "Quartas", "Semifinal", "Final"]);
    expect(rounds.map((r) => r.isDrawn)).toEqual([true, ...repeat(false, 8)]);
    expect(knockoutTies(copa, 0, game.fixtures)).toHaveLength(14);
    expect(knockoutTies(copa, 1, game.fixtures)).toEqual([]);
  });

  test("Série D's semi-final stage marks the quarter-final losers' ties as playoffs", () => {
    const league = competition("serie-d-2026");
    if (league.kind !== "league") throw new Error("Série D is a league");
    const knockout = (ties: [string, string][]) => ({ kind: "knockout" as const, ties, dates: [] });
    const stages = [...league.stages, ...Array.from({ length: 4 }, () => knockout([])), knockout([["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]])];
    expect(knockoutTies({ ...league, stages }, 5, []).map((t) => t.isPlayoff)).toEqual([false, false, true, true]);
    expect(knockoutTies(cup, 0, fixtures).map((t) => t.isPlayoff)).toEqual([false, false]);
  });

  test("a state championship names its knockout rounds by the clubs left", () => {
    expect(competitionStages(competition("state-ba-2026"), game.calendar).map((s) => s.name)).toEqual(["Grupos", "Semifinal", "Final"]);
  });
});

describe("defaultStage", () => {
  test("is the latest drawn stage the coach's club is in", () => {
    const league = competition("serie-a-2026");
    if (league.kind !== "league") throw new Error("Série A is a league");
    const withKnockout: LeagueCompetition = { ...league, stages: [...league.stages, { kind: "knockout", ties: [["x", "y"]], dates: [] }] };
    expect(defaultStage(withKnockout, "bahia-ba")).toBe(0);
    expect(defaultStage(withKnockout, "x")).toBe(1);
  });

  test("is the latest drawn stage when the club is out or has no club", () => {
    expect(defaultStage(competition("copa-do-brasil-2026"), null)).toBe(0);
  });
});

describe("topScorers", () => {
  test("lists the competition's scorers this season, most goals first, with their current club", () => {
    const [first, second] = Object.values(game.players);
    if (!first || !second) throw new Error("no players");
    const history: GameState["history"] = {
      ...game.history,
      current: { ...game.history.current, goals: { "serie-a": { [first.id]: 2, [second.id]: 5 }, "serie-b": { [first.id]: 9 } } },
    };
    expect(topScorers(competition("serie-a-2026"), { history, players: game.players }, 10)).toEqual([
      { playerId: second.id, name: second.name, clubId: second.clubId, goals: 5 },
      { playerId: first.id, name: first.name, clubId: first.clubId, goals: 2 },
    ]);
  });
});

describe("openingCompetitionId", () => {
  test("is the competition of the coach's next match", () => {
    expect(openingCompetitionId(game, "copa-do-brasil-2026")).toBe("copa-do-brasil-2026");
  });

  test("with no match ahead is the first competition the coach's club plays, not the first tab", () => {
    expect(tableTabs(game).tabs[0]?.id).toBe("serie-a-2026");
    expect(openingCompetitionId(game, undefined)).toBe("state-ba-2026");
  });
});

describe("CONMEBOL's cups and South America's leagues", () => {
  const flamengo = newGameFromFiles(7, { coachClubId: "flamengo-rj" }, bundledGameFiles);
  const libertadores = flamengo.competitions["libertadores-2026"];
  if (libertadores?.kind !== "continental") throw new Error("no Libertadores");

  test("the coach's club sees the cups it plays after Brazil's, the Libertadores, Sul-Americana and, in FIFA's 2029 edition year, Club World Cup tabs after the Copa do Brasil", () => {
    const edition = newGameFromFiles(7, { coachClubId: "flamengo-rj", season: 2029 }, bundledGameFiles);
    expect(coachCompetitions(edition).map((c) => c.id)).toEqual(["state-rj-2029", "serie-a-2029", "copa-do-brasil-2029", "libertadores-2029", "recopa-2029", "club-world-cup-2029"]);
    expect(tableTabs(edition).tabs.map((c) => c.id)).toEqual([
      "serie-a-2029",
      "serie-b-2029",
      "serie-c-2029",
      "serie-d-2029",
      "copa-do-brasil-2029",
      "libertadores-2029",
      "sul-americana-2029",
      "recopa-2029",
      "club-world-cup-2029",
      "state-rj-2029",
    ]);
    expect(tableTabs({ ...flamengo, coachClubId: "bahia-ba" }).tabs.map((c) => c.id)).not.toContain("recopa-2026");
  });

  test("the Libertadores names its stages the way Brazilian fans do", () => {
    expect(competitionStages(libertadores, flamengo.calendar).map((s) => s.name)).toEqual(["1ª fase", "2ª fase", "3ª fase", "Grupos", "Oitavas", "Quartas", "Semifinal", "Final"]);
  });

  test("a Libertadores group sends two to the round of 16 and its third to the Sul-Americana", () => {
    const group = ["flamengo-rj", "tm-209", "tm-189", "tm-1418"];
    const withGroups: ContinentalCompetition = { ...libertadores, stages: [...libertadores.stages, { kind: "groups", groups: [group], legs: 2, dates: ["2026-04-07"] }] };
    const { groups, zones } = groupTables(withGroups, withGroups.stages.length - 1, []);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual(["advance", "advance", "sulAmericana", null]);
    expect(zones.map((z) => z.label)).toEqual(["Sul-Americana", "Oitavas"]);
  });

  test("Argentina's leagues stand in their pack's clubs with CONMEBOL's places, relegation and promotion", () => {
    const [top, second] = worldLeagueTables(flamengo, "ar");
    expect(top?.label).toBe("Liga Profesional");
    expect(top?.rows).toHaveLength(30);
    expect(zonesByPosition(top?.rows ?? [])).toEqual([
      ...repeat("libertadores", 5),
      "preLibertadores",
      ...repeat("sulAmericana", 6),
      ...repeat(null, 16),
      ...repeat("relegation", 2),
    ]);
    expect(zonesByPosition(second?.rows ?? []).slice(0, 3)).toEqual(["promotion", "promotion", null]);
  });

  test("a guest's scorer counts in the cup's scorers under the name his club's pack gives him", () => {
    const history: GameState["history"] = {
      ...flamengo.history,
      players: { ...flamengo.history.players, "tm-209": { "tm-209#3": { name: "Franco Armani", apps: 1, goals: 2 } } },
      current: { ...flamengo.history.current, goals: { libertadores: { "tm-209#3": 2 } } },
    };
    expect(topScorers(libertadores, { history, players: flamengo.players }, 5)).toEqual([{ playerId: "tm-209#3", name: "Franco Armani", clubId: "tm-209", goals: 2 }]);
  });

  test("the Libertadores bracket runs from the round of 16 to the final, with empty places for the rounds not drawn yet", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => `c${i}`);
    const ties = Array.from({ length: 8 }, (_, i): [string, string] => [sixteen[2 * i] ?? "", sixteen[2 * i + 1] ?? ""]);
    const knockout = { kind: "knockout" as const, ties, dates: ["2026-08-11", "2026-08-18"] };
    const drawn: ContinentalCompetition = { ...libertadores, stages: [...libertadores.stages, knockout, knockout, { kind: "groups", groups: [], legs: 2, dates: [] }, knockout] };
    const bracket = knockoutBracket(drawn, []);
    expect(bracket.map((round) => [round.name, round.ties.length])).toEqual([["Oitavas", 8], ["Quartas", 4], ["Semifinal", 2], ["Final", 1]]);
    expect(bracket[0]?.ties[3]?.clubIds).toEqual(["c6", "c7"]);
    expect(bracket[1]?.ties.every((tie) => tie === null)).toBe(true);
    expect(knockoutBracket(libertadores, [])).toEqual([]);
  });
});

describe("MLS and Liga MX", () => {
  // A league abroad is played on the unified calendar.
  const leagueOf = (coachClubId: string, country: string): LeagueCompetition => {
    const game = newGameFromFiles(7, { coachClubId, formats: RAPIDO }, bundledGameFiles);
    const league = Object.values(game.competitions).find((c) => c.kind === "league" && c.abroad?.country === country && c.abroad.level === 0);
    if (league?.kind !== "league") throw new Error(`no ${country} league`);
    return league;
  };
  const calendar = newGameFromFiles(7, { coachClubId: "flamengo-rj" }, bundledGameFiles).calendar;

  test("MLS plays its regular season in its Eastern and Western Conferences, its top eight on to the play-offs and the MLS Cup", () => {
    const mls = leagueOf("tm-51828", "us");
    expect(competitionStages(mls, calendar).map((s) => s.name)).toEqual(["Temporada regular", "Quartas", "Semifinal", "Final de conferência", "MLS Cup"]);
    const { groups, zones } = groupTables(mls, 0, []);
    expect(groups.map((g) => g.label)).toEqual(["Conferência Leste", "Conferência Oeste"]);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([...Array<string>(8).fill("advance"), ...Array<null>(7).fill(null)]);
    expect(zones).toEqual([{ zone: "advance", label: "Playoffs" }]);
  });

  test("Liga MX plays a Clausura and an Apertura, each with its top eight on to the quarter-finals", () => {
    const ligaMx = leagueOf("tm-2407", "mx");
    expect(competitionStages(ligaMx, calendar).map((s) => s.name)).toEqual(["Clausura", "Quartas", "Semifinal", "Final", "Apertura", "Quartas", "Semifinal", "Final"]);
    const { groups, zones } = groupTables(ligaMx, 0, []);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([...Array<string>(8).fill("advance"), ...Array<null>(10).fill(null)]);
    expect(zones).toEqual([{ zone: "advance", label: "Quartas" }]);
  });
});
