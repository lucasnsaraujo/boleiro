import { describe, expect, it } from "vitest";
import { newHistory, type History, type SeasonRecord } from "@boleiro/engine/sim/history/history";
import { championRoll, clubPast, coachCareer, rollKeys, scorerRoll } from "./historySelectors.js";

const noMoves = { A: [], B: [], C: [], D: [] };
const season = (year: number, champions: Record<string, string>, serieA: string[], topScorers: SeasonRecord["topScorers"] = {}): SeasonRecord => ({
  season: year,
  champions,
  topScorers,
  promoted: noMoves,
  relegated: noMoves,
  tables: { A: serieA, B: [], C: [], D: [] },
});

const pedro = { playerId: "p1", name: "Pedro", clubId: "flamengo-rj", goals: 23 };

const history: History = {
  ...newHistory(2028, "2026-01-01", null),
  seasons: [
    season(2026, { "serie-a": "flamengo-rj", "copa-do-brasil": "bahia-ba", "state-ba": "bahia-ba", "state-sp": "palmeiras-sp" }, ["flamengo-rj", "palmeiras-sp", "a3", "a4", "bahia-ba"], { "serie-a": pedro }),
    season(2027, { "serie-a": "bahia-ba", "state-ba": "vitoria-ba" }, ["bahia-ba", "flamengo-rj"]),
  ],
  current: { season: 2028, champions: { "state-ba": "bahia-ba" }, goals: {} },
  players: { "bahia-ba": { p9: { name: "Everaldo", apps: 160, goals: 50 }, p10: { name: "Reserva", apps: 20, goals: 2 } } },
  coach: {
    stints: [
      { clubId: "vitoria-ba", from: "2026-01-01", until: "2026-06-10", left: "fired" },
      { clubId: "bahia-ba", from: "2026-06-12", until: null, left: null },
    ],
    trophies: [
      { season: 2026, competition: "copa-do-brasil", clubId: "bahia-ba" },
      { season: 2027, competition: "serie-a", clubId: "bahia-ba" },
    ],
    firings: [{ clubId: "vitoria-ba", date: "2026-06-10", position: 18, targetPosition: 10 }],
    seasons: [
      { season: 2026, clubId: "bahia-ba", position: 5, targetPosition: 6 },
      { season: 2027, clubId: "bahia-ba", position: 1, targetPosition: 6 },
    ],
  },
};

const keys = rollKeys({ "bahia-ba": { state: "BA" } }, "bahia-ba");

describe("the champions roll", () => {
  it("lists the national competitions and only the coach's own state championship", () => {
    expect(keys).toEqual(["serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil", "state-ba"]);
    expect(rollKeys({}, null)).not.toContainEqual(expect.stringMatching(/^state-/));
  });

  it("puts the season under way first, with only the titles decided so far", () => {
    const [current, ...filed] = championRoll(history, keys);
    expect(current).toEqual({ season: 2028, isCurrent: true, champions: [null, null, null, null, null, "bahia-ba"] });
    expect(filed.map((row) => row.season)).toEqual([2027, 2026]);
    expect(filed[1]?.champions).toEqual(["flamengo-rj", null, null, null, "bahia-ba", "bahia-ba"]);
  });

  it("leaves the season under way out until some title is decided", () => {
    const quiet = { ...history, current: { ...history.current, champions: {} } };
    expect(championRoll(quiet, keys)[0]?.season).toBe(2027);
  });

  it("gives each filed season its top scorers, newest first", () => {
    const rows = scorerRoll(history, keys);
    expect(rows.map((row) => row.season)).toEqual([2027, 2026]);
    expect(rows[1]?.scorers[0]).toEqual(pedro);
    expect(rows[0]?.scorers[0]).toBeNull();
  });
});

describe("a club's past", () => {
  const past = clubPast({ history }, "bahia-ba");

  it("groups its titles by competition, the biggest competition first", () => {
    expect(past.titles).toEqual([
      { key: "serie-a", seasons: [2027] },
      { key: "copa-do-brasil", seasons: [2026] },
      { key: "state-ba", seasons: [2026] },
    ]);
  });

  it("lists its league finishes newest first", () => {
    expect(past.finishes).toEqual([
      { season: 2027, division: "A", position: 1 },
      { season: 2026, division: "A", position: 5 },
    ]);
  });

  it("names only the players who became idols", () => {
    expect(past.idols.map((idol) => idol.name)).toEqual(["Everaldo"]);
  });
});

describe("the coach's career", () => {
  const stints = coachCareer(history.coach);

  it("lists his clubs newest first, each with its seasons and titles", () => {
    expect(stints.map((s) => s.clubId)).toEqual(["bahia-ba", "vitoria-ba"]);
    expect(stints[0]).toMatchObject({ until: null, left: null, seasons: 2, titles: ["serie-a", "copa-do-brasil"] });
  });

  it("keeps a title won at a club he left during that season under that club", () => {
    const moved = coachCareer({
      stints: [
        { clubId: "bahia-ba", from: "2026-01-01", until: "2026-07-10", left: "moved" },
        { clubId: "flamengo-rj", from: "2026-07-10", until: null, left: null },
      ],
      trophies: [{ season: 2026, competition: "state-ba", clubId: "bahia-ba" }],
      firings: [],
      seasons: [{ season: 2026, clubId: "flamengo-rj", position: 3, targetPosition: 1 }],
    });
    expect(moved.map((s) => [s.clubId, s.titles, s.seasons])).toEqual([
      ["flamengo-rj", [], 1],
      ["bahia-ba", ["state-ba"], 0],
    ]);
  });

  it("marks the club that fired him and where he left it", () => {
    expect(stints[1]).toMatchObject({ left: "fired", titles: [], seasons: 0, firedAt: { position: 18, targetPosition: 10 } });
  });
});
