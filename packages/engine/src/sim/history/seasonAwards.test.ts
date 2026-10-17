import { describe, expect, it } from "vitest";
import { GROUP_OF_ROLE, type Role } from "@boleiro/data/players";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { typicalRating } from "../live/matchRatings.js";
import type { World } from "../world/world.js";
import type { SeasonMark } from "./history.js";
import { roleOf, seasonAwards } from "./seasonAwards.js";

const start = loadNewGame(8, { coachClubId: null });
const serieA = new Set(Object.values(start.clubs).filter((c) => c.division === "A").map((c) => c.id));
const players = Object.values(start.players).filter((p) => serieA.has(p.clubId)).sort((a, b) => a.id.localeCompare(b.id));
// Every Série A player plays 30 of the 38 rounds, rated 6.0 to 7.9 by his place in the id order.
const averageOf = (p: SimPlayer) => 6 + (players.indexOf(p) % 20) / 10;
const marks: Record<string, SeasonMark> = Object.fromEntries(players.map((p) => [p.id, [30, Math.round(averageOf(p) * 10) * 30, 1]]));

function withSeason(ratings: Record<string, SeasonMark>, goals: Record<string, number> = {}, change: Partial<GameState> = {}): GameState {
  return { ...start, ...change, history: { ...start.history, current: { ...start.history.current, ratings: { "serie-a": ratings }, goals: { "serie-a": goals } } } };
}

const best = (role: Role, among = players) =>
  among.filter((p) => roleOf(p) === role).sort((a, b) => averageOf(b) - averageOf(a) || a.id.localeCompare(b.id));

describe("the Brasileirão's awards", () => {
  const awards = seasonAwards(withSeason(marks), {});
  const team = awards.bolaDePrata;
  const count = (role: Role) => team.filter((p) => p.role === role).length;

  it("pick a Bola de Prata team of a goalkeeper, two centre-backs, two full-backs and six midfielders and forwards", () => {
    expect(team).toHaveLength(11);
    expect([count("goleiro"), count("zagueiro"), count("lateral")]).toEqual([1, 2, 2]);
    expect(count("meia")).toBeGreaterThanOrEqual(2);
    expect(count("atacante")).toBeGreaterThanOrEqual(1);
    expect(count("atacante")).toBeLessThanOrEqual(3);
    expect(team.map((p) => p.role)).toEqual([...team.map((p) => p.role)].sort((a, b) => ["goleiro", "lateral", "zagueiro", "meia", "atacante"].indexOf(a) - ["goleiro", "lateral", "zagueiro", "meia", "atacante"].indexOf(b)));
  });

  it("put the best average at each position in the team", () => {
    expect(team.find((p) => p.role === "goleiro")?.playerId).toBe(best("goleiro")[0]?.id);
    expect(team.filter((p) => p.role === "zagueiro").map((p) => p.playerId).sort()).toEqual(best("zagueiro").slice(0, 2).map((p) => p.id).sort());
    const flexible = team.filter((p) => p.role === "meia" || p.role === "atacante");
    const above = (average: number, role: Role) => average - typicalRating(GROUP_OF_ROLE[role]);
    const cut = Math.min(...flexible.map((p) => above(p.average, p.role)));
    const better = players.filter((p) => (roleOf(p) === "meia" || roleOf(p) === "atacante") && above(averageOf(p), roleOf(p)) > cut + 0.001);
    expect(better.every((p) => flexible.some((f) => f.playerId === p.id) || (roleOf(p) === "atacante" && count("atacante") === 3))).toBe(true);
  });

  it("leave out players who played fewer than half the rounds", () => {
    const [keeper] = best("goleiro");
    const [rival] = best("goleiro").slice(-1);
    if (!keeper || !rival) throw new Error("no keepers");
    const awarded = seasonAwards(withSeason({ ...marks, [rival.id]: [18, 18 * 95, 0] }), {});
    expect(awarded.bolaDePrata.find((p) => p.role === "goleiro")?.playerId).toBe(keeper.id);
    const enough = seasonAwards(withSeason({ ...marks, [rival.id]: [19, 19 * 95, 0] }), {});
    expect(enough.bolaDePrata.find((p) => p.role === "goleiro")).toMatchObject({ playerId: rival.id, apps: 19, average: 9.5 });
  });

  it("give the Bola de Ouro to the best average, a tie to the one with more games, with the next two after him", () => {
    const [a, b] = players;
    if (!a || !b) throw new Error("no players");
    const tied = seasonAwards(withSeason({ ...marks, [a.id]: [25, 25 * 92, 3], [b.id]: [31, 31 * 92, 0] }), {});
    expect(tied.bolaDeOuro?.playerId).toBe(b.id);
    expect(tied.runnersUp.map((p) => p.playerId)[0]).toBe(a.id);
    expect(tied.runnersUp).toHaveLength(2);
    expect(tied.bolaDeOuro).toMatchObject({ name: b.name, clubId: b.clubId, age: b.age, apps: 31, average: 9.2 });
  });

  it("weigh each average against his position's, so a keeper's high marks don't win the Bola de Ouro by themselves", () => {
    const [keeper] = best("goleiro");
    const [forward] = best("atacante");
    if (!keeper || !forward) throw new Error("no players");
    const awarded = seasonAwards(withSeason({ ...marks, [keeper.id]: [30, 30 * 86, 0], [forward.id]: [30, 30 * 85, 6] }), {});
    expect(awarded.bolaDeOuro?.playerId).toBe(forward.id);
  });

  it("name the league's top scorer and its best player aged 21 or younger", () => {
    const [scorer] = players;
    const young = players.filter((p) => p.age <= 21);
    const [kid] = young;
    if (!scorer || !kid) throw new Error("no players");
    const awarded = seasonAwards(withSeason({ ...marks, [kid.id]: [20, 20 * 88, 4] }, { [scorer.id]: 23, [kid.id]: 4 }), {});
    expect(awarded.topScorer).toMatchObject({ playerId: scorer.id, goals: 23 });
    expect(awarded.bestYoung).toMatchObject({ playerId: kid.id, goals: 4, assists: 4, average: 8.8 });
  });

  it("are empty in a season nobody played enough", () => {
    const awarded = seasonAwards(withSeason({}), {});
    expect(awarded).toMatchObject({ bolaDeOuro: null, runnersUp: [], bolaDePrata: [], topScorer: null, bestYoung: null });
  });
});

describe("the Ballon d'Or", () => {
  const [star, twin] = players.filter((p) => p.strength >= 75);
  if (!star || !twin) throw new Error("no stars");
  const even = { ...start.players, [twin.id]: { ...twin, strength: star.strength } };

  it("goes to the season's titles when two players are as strong and played alike", () => {
    const ratings = { ...marks, [star.id]: [34, 34 * 75, 5] as SeasonMark, [twin.id]: [34, 34 * 75, 5] as SeasonMark };
    const votes = seasonAwards(withSeason(ratings, {}, { players: even }), { "serie-a": star.clubId, libertadores: star.clubId }).ballonDor;
    expect(votes).toHaveLength(3);
    const place = (id: string) => votes.findIndex((v) => v.playerId === id);
    expect(place(star.id)).toBeGreaterThanOrEqual(0);
    if (place(twin.id) >= 0) expect(place(star.id)).toBeLessThan(place(twin.id));
    expect(votes.find((v) => v.playerId === star.id)?.titles).toEqual(["serie-a", "libertadores"]);
    expect(votes.map((v) => v.score)).toEqual([...votes.map((v) => v.score)].sort((x, y) => y - x));
  });

  it("gives a result-only club's star the season the full tier's best players usually have", () => {
    const strongest = Math.max(...players.map((p) => p.strength));
    const flat: Record<string, SeasonMark> = Object.fromEntries(players.map((p) => [p.id, [30, 30 * 75, 3]]));
    const club = { id: "tm-star", name: "Estrela FC", positions: "A", strengths: [strongest + 2], names: ["Estrela"] };
    const world: World = { xx: { structure: { id: "xx", levels: [], window: ["08-01", "05-31"], continental: [] }, clubs: { [club.id]: club }, leagues: [], seasons: [], rngState: 1 } };
    const votes = seasonAwards(withSeason(flat, {}, { world }), {}).ballonDor;
    expect(votes[0]?.playerId).toBe("tm-star:0");
  });

  it("goes to the better season when two players are as strong and won nothing", () => {
    const ratings = { ...marks, [star.id]: [34, 34 * 82, 9] as SeasonMark, [twin.id]: [34, 34 * 68, 0] as SeasonMark };
    const votes = seasonAwards(withSeason(ratings, { [star.id]: 25 }, { players: even }), {}).ballonDor;
    const place = (id: string) => votes.findIndex((v) => v.playerId === id);
    expect(place(star.id)).toBeGreaterThanOrEqual(0);
    expect(votes.find((v) => v.playerId === star.id)).toMatchObject({ apps: 34, goals: 25, average: 8.2, clubName: start.clubs[star.clubId]?.shortName });
    if (place(twin.id) >= 0) expect(place(star.id)).toBeLessThan(place(twin.id));
  });
});
