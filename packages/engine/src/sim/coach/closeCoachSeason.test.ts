import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import type { SeasonRecord } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { coachesByClub, type AiCoach, type Coaching, type CoachWorld } from "./aiCoaches.js";
import { closeCoachSeason, humanKey, retiredPlayers } from "./closeCoachSeason.js";
import { fullTierPoints, nationalPoints, seasonRuns, type CupRun, type SeasonRuns } from "./rankingPoints.js";
import { coachRanking, nationalRanking, worldRanking } from "./rankings.js";

const coachesOf = (state: GameState): CoachWorld => {
  if (!state.coaches) throw new Error("the game has no AI coaches");
  return state.coaches;
};

const NO_RUNS: SeasonRuns = { cups: {}, leaguesAbroad: [], finals: {} };

/** The coaching with the coach of `clubId` fired on `firedOn` and a pool coach in charge from `hiredOn`; both coaches. */
function changeCoach(coaching: Coaching, clubId: string, firedOn: string, hiredOn: string): { coaches: Coaching["coaches"]; fired: AiCoach; hired: AiCoach } {
  const fired = coachesByClub(coaching).get(clubId);
  const pooled = Object.values(coaching.coaches).find((coach) => coach.clubId === null && !coach.stints.length);
  if (!fired || !pooled) throw new Error(`no coach to swap at ${clubId}`);
  const out: AiCoach = { ...fired, clubId: null, stints: fired.stints.map((stint) => ({ ...stint, until: firedOn, left: "fired" })) };
  const hired: AiCoach = { ...pooled, clubId, stints: [{ clubId, from: hiredOn, until: null, left: null }] };
  return { coaches: { ...coaching.coaches, [out.id]: out, [hired.id]: hired }, fired: out, hired };
}

const record = (tables: Partial<SeasonRecord["tables"]>): SeasonRecord => ({
  season: 2026,
  champions: {},
  topScorers: {},
  promoted: { A: [], B: [], C: [], D: [] },
  relegated: { A: [], B: [], C: [], D: [] },
  tables: { A: [], B: [], C: [], D: [], ...tables },
});

describe("the national ranking, the CBF's way", () => {
  const history = loadNewGame(3, { coachClubId: null }).history;

  it("gives a league's champion its division's points, 80% to the runner-up, 75%, 70%, then a point less a place", () => {
    const filed = { ...history, seasons: [record({ A: ["a1", "a2", "a3", "a4", "a5", "a6"], D: ["d1"] })] };
    expect(nationalPoints(filed, 2026, {})).toEqual({ a1: 800, a2: 640, a3: 600, a4: 560, a5: 552, a6: 544, d1: 100 });
  });

  it("pays every league place from the 23rd down a flat 51% of the champion's points", () => {
    const serieD = Array.from({ length: 30 }, (_, i) => `d${i + 1}`);
    const points = nationalPoints({ ...history, seasons: [record({ A: serieD.map((id) => `a-${id}`), D: serieD })] }, 2026, {});
    expect([points.d22, points.d23, points.d24, points.d30]).toEqual([52, 51, 51, 51]);
    expect([points["a-d23"], points["a-d30"]]).toEqual([408, 408]);
  });

  it("adds the Copa do Brasil: 600 to its champion, 480 to the runner-up, 450, 400, 200, 100, 50 and 25 down the rounds", () => {
    const copa: CupRun = { championId: "c0", fromFinal: { c0: 0, c1: 0, c2: 1, c3: 2, c4: 3, c5: 4, c6: 5, c7: 6, c8: 8 } };
    expect(nationalPoints({ ...history, seasons: [] }, 2026, { "copa-do-brasil": copa })).toEqual({ c0: 600, c1: 480, c2: 450, c3: 400, c4: 200, c5: 100, c6: 50, c7: 25, c8: 25 });
  });
});

describe("the world ranking's points", () => {
  const history = loadNewGame(3, { coachClubId: null }).history;

  it("score a top league's first ten places, the second level's champion, the national cup's final and the continental winners", () => {
    const serieA = Array.from({ length: 12 }, (_, i) => `a${i + 1}`);
    const filed = { ...history, seasons: [record({ A: serieA, B: ["b1", "b2"] })] };
    const runs: SeasonRuns = {
      cups: {
        "copa-do-brasil": { championId: "c0", fromFinal: { c0: 0, c1: 0, c2: 1 } },
        libertadores: { championId: "a5", fromFinal: { a5: 0, x: 0, y: 1 } },
      },
      leaguesAbroad: [],
      finals: {},
    };
    const { domestic, continental } = fullTierPoints(filed, 2026, runs, [], () => true);
    expect(Object.keys(domestic).filter((id) => id.startsWith("a")).sort()).toEqual(serieA.slice(0, 10).sort());
    expect(domestic).toMatchObject({ a1: 800, a2: 640, a10: 512, b1: 400, c0: 600, c1: 480 });
    expect(domestic.b2).toBeUndefined();
    expect(domestic.c2).toBeUndefined();
    expect(continental).toEqual({ a5: 1000 });
  });
});

describe("a ranking over the seasons", () => {
  const game = loadNewGame(3, { coachClubId: null });
  const withNational = (national: CoachWorld["national"]): GameState => ({ ...game, coaches: { ...coachesOf(game), national } });

  it("weighs the latest season 5 times, the one before 4, down to 1, and drops the sixth", () => {
    const seasons = [2021, 2022, 2023, 2024, 2025, 2026].map((season) => ({ season, clubs: { x: 1 } }));
    expect(nationalRanking(withNational(seasons))).toEqual([["x", 15]]);
    expect(nationalRanking(withNational([{ season: 2025, clubs: { x: 1 } }, { season: 2026, clubs: { y: 10 } }]))).toEqual([["y", 50], ["x", 4]]);
  });

  it("can be read as it stood at the end of an earlier season", () => {
    const seasons: CoachWorld["national"] = [{ season: 2025, clubs: { x: 1 } }, { season: 2026, clubs: { y: 10 } }];
    expect(nationalRanking(withNational(seasons), 2025)).toEqual([["x", 5]]);
  });
});

describe("the coaches' turn of the season", () => {
  const game = loadNewGame(3, { coachClubId: "bahia-ba" });

  it("queues a retired star to start coaching two to four seasons on, and leaves the others retired", () => {
    const star = { name: "Craque Antigo", nationality: "Uruguay", clubId: "palmeiras-sp", peak: 82, age: 37 };
    const regular = { name: "Zagueiro Comum", nationality: "Brazil", clubId: "palmeiras-sp", peak: 70, age: 36 };
    const closed = closeCoachSeason(game, 2026, NO_RUNS, [star, regular]);
    const [queued, ...others] = coachesOf(closed).rookies;
    expect(others).toEqual([]);
    expect(queued?.name).toBe("Craque Antigo");
    expect(queued?.season).toBeGreaterThanOrEqual(2028);
    expect(queued?.season).toBeLessThanOrEqual(2030);
    const due = closeCoachSeason({ ...closed, season: queued?.season ?? 0 }, (queued?.season ?? 0) - 1, NO_RUNS, []);
    const coach = Object.values(coachesOf(due).coaches).find((c) => c.name === "Craque Antigo");
    expect(coach).toMatchObject({ clubId: null, born: 1989, nationality: "Uruguay", formerPlayer: { clubId: "palmeiras-sp", strength: 82 } });
    expect(coach?.reputation).toBeGreaterThan(Object.values(coachesOf(game).coaches).filter((c) => c.clubId === null).reduce((low, c) => Math.min(low, c.reputation), 100));
    expect(coachesOf(due).rookies).toEqual([]);
  });

  it("reads a retired player's first nationality", () => {
    const player = Object.values(game.players).find((p) => p.nationalities[0] && p.nationalities[0] !== "Brazil");
    if (!player) throw new Error("the game has no foreign player");
    const [retired] = retiredPlayers(game, [{ type: "playerRetired", playerId: player.id, clubId: player.clubId, name: player.name, age: 37 }]);
    expect(retired?.nationality).toBe(player.nationalities[0]);
  });

  it("credits each title to the AI coach in charge on the day of its final", () => {
    const { coaches, fired, hired } = changeCoach(coachesOf(game), "palmeiras-sp", "2026-07-10", "2026-07-24");
    const filed = { ...record({}), champions: { "state-sp": "palmeiras-sp", "serie-a": "palmeiras-sp" } };
    const state = { ...game, season: 2027, history: { ...game.history, seasons: [filed] }, coaches: { ...coachesOf(game), coaches } };
    const closed = coachesOf(closeCoachSeason(state, 2026, { ...NO_RUNS, finals: { "state-sp": "2026-03-08", "serie-a": "2026-12-02" } }, []));
    expect(closed.coaches[fired.id]?.titles).toEqual([{ season: 2026, competition: "state-sp", clubId: "palmeiras-sp" }]);
    expect(closed.coaches[hired.id]?.titles).toEqual([{ season: 2026, competition: "serie-a", clubId: "palmeiras-sp" }]);
  });

  it("credits a result-only country's cup to the coach who won its final, months before the season was filed", () => {
    const southAmerica = loadNewGame(3, { coachClubId: "bahia-ba", world: loadSouthAmerica(2026) });
    const argentina = southAmerica.world?.ar;
    if (!argentina?.coaching) throw new Error("Argentina has no coaches");
    const { coaches, fired, hired } = changeCoach(argentina.coaching, "tm-209", "2026-07-01", "2026-07-15");
    const filed = { season: 2026, champions: ["tm-209"], promoted: [], relegated: [], continental: {}, cup: { championId: "tm-209", runnerUpId: "tm-1234" }, finals: { league: "2026-12-14", cup: "2026-05-20" } };
    const world = { ...southAmerica.world, ar: { ...argentina, seasons: [...argentina.seasons, filed], coaching: { ...argentina.coaching, coaches } } };
    const closed = closeCoachSeason({ ...southAmerica, season: 2027, world }, 2026, NO_RUNS, []).world?.ar?.coaching;
    expect(closed?.coaches[fired.id]?.titles).toEqual([{ season: 2026, competition: "ar-cup", clubId: "tm-209" }]);
    expect(closed?.coaches[hired.id]?.titles).toEqual([{ season: 2026, competition: "ar-1", clubId: "tm-209" }]);
  });

  it("retires a coach of 72 and opens his club's job", () => {
    const abel = coachesByClub(coachesOf(game)).get("palmeiras-sp");
    if (!abel) throw new Error("Palmeiras has no coach");
    const old = { ...game, season: 2027, coaches: { ...coachesOf(game), coaches: { ...coachesOf(game).coaches, [abel.id]: { ...abel, born: 1955 } } } };
    const closed = closeCoachSeason(old, 2026, NO_RUNS, []);
    expect(coachesOf(closed).coaches[abel.id]).toMatchObject({ clubId: null, retiredIn: 2027 });
    expect(coachesOf(closed).coaches[abel.id]?.stints.at(-1)).toMatchObject({ clubId: "palmeiras-sp", until: old.date, left: "retired" });
    expect(coachesOf(closed).openJobs["palmeiras-sp"]).toBe(old.date);
  });
});

describe("a season played", () => {
  // The player runs a Série D club, so Série A's champion always has an AI coach.
  let state = loadNewGame(3, { coachClubId: "csa-al" });
  while (state.date < "2026-12-31") state = advanceDay(state, {}).state;
  const lastDay = seasonRuns(state);
  state = advanceDay(state, {}).state;

  it("knows each competition's final day as the season ends, from the real calendar", () => {
    expect(lastDay.finals["copa-do-brasil"]).toBe("2026-12-06");
    expect(lastDay.finals["serie-a"]).toBe("2026-12-02");
    expect(lastDay.finals["state-sp"] ?? "").toMatch(/^2026-0[23]-/);
  });
  const world = coachesOf(state);
  const filed = state.history.seasons.at(-1);
  const champion = filed?.tables.A[0] ?? "";

  it("files the season's national points and ranks Brazil's clubs by them", () => {
    expect(world.national.map((ranked) => ranked.season)).toEqual([2026]);
    expect(world.national[0]?.clubs[champion]).toBeGreaterThanOrEqual(800);
    const [leader] = nationalRanking(state);
    expect(leader?.[1]).toBe(Math.max(...Object.values(world.national[0]?.clubs ?? {})) * 5);
    expect(worldRanking(state).slice(0, 3).map(([clubId]) => clubId)).toContain(champion);
  });

  it("opens the jobs of the clubs that change coach before the new season, about 30% of them", () => {
    const open = Object.keys(world.openJobs).filter((id) => id in state.boards);
    const boards = Object.keys(state.boards).length;
    expect(open.length).toBeGreaterThan(0.2 * boards);
    expect(open.length).toBeLessThan(0.4 * boards);
    expect(open.filter((id) => coachesByClub(world).has(id))).toEqual([]);
  });

  it("credits the Série A title to the AI coach in charge on the day of its final and ranks the coaches, the player among them", () => {
    const finalDay = lastDay.finals["serie-a"] ?? "";
    const coach = Object.values(world.coaches).find((c) => c.stints.some((stint) => stint.clubId === champion && stint.from <= finalDay && (stint.until === null || stint.until >= finalDay)));
    if (!coach) throw new Error(`no AI coach ran ${champion} on ${finalDay}`);
    expect(coach.titles).toContainEqual({ season: 2026, competition: "serie-a", clubId: champion });
    const ranking = coachRanking(state);
    expect(ranking.length).toBeGreaterThan(100);
    expect(ranking.some(([key]) => key === humanKey(undefined))).toBe(true);
    expect(ranking.findIndex(([key]) => key === coach.id)).toBeLessThan(20);
  });
});
