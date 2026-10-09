import { describe, expect, it } from "vitest";
import { STATES } from "../../data/clubs.js";
import type { Division } from "../../data/players.js";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { clubHistory } from "./clubHistory.js";
import { competitionKey } from "./history.js";

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const SEASONS = 3;

type Run = { states: GameState[]; lastDays: GameState[]; events: DayEvent[]; final: GameState };

/** A career-mode game whose coach takes the first offer whenever he is out of work. */
function playSeasons(seed: number, seasons: number): Run {
  let state = loadNewGame(seed, { coachClubId: null, careerMode: true });
  const run: Run = { states: [], lastDays: [], events: [], final: state };
  const last = state.season + seasons;
  while (state.season < last) {
    const acceptOffer = state.coachClubId ? undefined : state.coach.offers[0]?.clubId;
    const day = advanceDay(state, { acceptOffer });
    run.events.push(...day.events);
    if (day.state.season !== state.season) {
      run.lastDays.push(state);
      run.states.push(day.state);
    }
    state = day.state;
  }
  run.final = state;
  return run;
}

const goalsIn = (state: GameState, competitionId: string) =>
  state.fixtures.filter((f) => f.competitionId === competitionId).reduce((sum, f) => sum + (f.result?.homeGoals ?? 0) + (f.result?.awayGoals ?? 0), 0);

describe("club history over several seasons", () => {
  const run = playSeasons(5, SEASONS);
  const { history } = run.final;

  it("keeps one record per finished season with every competition's champion", () => {
    expect(history.seasons.map((s) => s.season)).toEqual([2026, 2027, 2028]);
    for (const [i, season] of history.seasons.entries()) {
      const competitions = Object.values(run.lastDays[i]?.competitions ?? {});
      expect(Object.keys(season.champions).sort()).toEqual(competitions.map((c) => competitionKey(c.id)).sort());
      expect(season.champions["serie-a"]).toBe(season.tables.A[0]);
      expect(Object.keys(season.champions)).toContain("copa-do-brasil");
      expect(Object.keys(season.champions).filter((key) => key.startsWith("state-")).length).toBeGreaterThan(STATES.length / 2);
    }
  });

  it("records every club's final league position", () => {
    for (const [i, season] of history.seasons.entries()) {
      const before = run.lastDays[i];
      if (!before) throw new Error("missing season");
      for (const division of DIVISIONS) {
        const members = Object.values(before.clubs).filter((club) => club.division === division).map((club) => club.id);
        expect([...season.tables[division]].sort()).toEqual(members.sort());
      }
    }
  });

  it("records promotions and relegations that match next season's divisions", () => {
    for (const [i, season] of history.seasons.entries()) {
      const after = run.states[i];
      if (!after) throw new Error("missing season");
      expect(season.promoted.B).toHaveLength(4);
      for (const id of season.promoted.B) expect(after.clubs[id]?.division).toBe("A");
      for (const id of season.relegated.A) expect(after.clubs[id]?.division).toBe("B");
      expect(season.promoted.A).toEqual([]);
    }
  });

  it("gives every competition goal to a scorer and names a top scorer", () => {
    const before = run.lastDays[0];
    if (!before) throw new Error("missing season");
    const serieA = Object.values(before.competitions).find((c) => c.id === "serie-a-2026");
    if (!serieA) throw new Error("no Série A");
    const scored = Object.values(before.history.current.goals["serie-a"] ?? {}).reduce((sum, g) => sum + g, 0);
    expect(scored).toBe(goalsIn(before, serieA.id));
    const top = history.seasons[0]?.topScorers["serie-a"];
    expect(top?.goals).toBe(Math.max(...Object.values(before.history.current.goals["serie-a"] ?? {})));
    expect(top?.goals).toBeGreaterThan(10);
  });

  it("counts appearances and goals per club and names idols who accumulate them", () => {
    // Counted on the season's last day: the close forgets players who left with few games, as sales do.
    const apps = Object.values(run.lastDays[0]?.history.players["flamengo-rj"] ?? {}).reduce((sum, p) => sum + p.apps, 0);
    const games = (run.lastDays[0]?.fixtures ?? []).filter((f) => f.homeId === "flamengo-rj" || f.awayId === "flamengo-rj").length;
    expect(apps).toBe(11 * games);
    // Whether one club's regulars reach idol status in three seasons depends on who it sells, so
    // idols are counted over every Série A club.
    const serieA = Object.values(run.final.clubs).filter((club) => club.division === "A").map((club) => club.id);
    const idolsOf = (state: GameState) => serieA.flatMap((id) => clubHistory(state, id).idols);
    expect(idolsOf(run.final).length).toBeGreaterThan(idolsOf(run.states[0] ?? run.final).length);
    const veteran = idolsOf(run.final).sort((a, b) => b.apps - a.apps)[0];
    expect(veteran?.apps).toBeGreaterThan(100);
  });

  it("lists a club's titles and positions by season", () => {
    const champion = history.seasons[0]?.champions["serie-a"] ?? "";
    const club = clubHistory(run.final, champion);
    expect(club.titles).toContainEqual({ season: 2026, competition: "serie-a" });
    expect(club.positions[0]).toEqual({ season: 2026, division: "A", position: 1 });
    expect(club.positions).toHaveLength(SEASONS);
    expect(club.records.biggestWin?.goalsFor).toBeGreaterThan(club.records.biggestWin?.goalsAgainst ?? Infinity);
    expect(club.records.biggestCrowd?.crowd).toBeGreaterThan(0);
  });

  it("keeps each record only until it is beaten", () => {
    for (const [i, state] of run.states.entries()) {
      const later = run.states[i + 1];
      if (!later) continue;
      for (const [clubId, records] of Object.entries(state.history.clubs)) {
        const next = later.history.clubs[clubId];
        const margin = (m: { goalsFor: number; goalsAgainst: number } | null) => (m ? Math.abs(m.goalsFor - m.goalsAgainst) : 0);
        expect(margin(next?.biggestWin ?? null)).toBeGreaterThanOrEqual(margin(records.biggestWin));
        if (margin(next?.biggestWin ?? null) === margin(records.biggestWin)) expect(next?.biggestWin).toEqual(records.biggestWin);
        expect(next?.biggestCrowd?.crowd ?? 0).toBeGreaterThanOrEqual(records.biggestCrowd?.crowd ?? 0);
      }
    }
  });

  it("keeps each club's record sale and signing from forced sales and market transfers", () => {
    const sales = run.events.flatMap((e) =>
      e.type === "forcedSale"
        ? [e]
        : e.type === "playerMoved" && e.fee > 0 && e.fromClubId
          ? [{ clubId: e.fromClubId, buyerId: e.toClubId, playerId: e.playerId, fee: e.fee }]
          : [],
    );
    expect(sales.length).toBeGreaterThan(0);
    expect(run.events.some((e) => e.type === "playerMoved" && e.fee > 0)).toBe(true);
    for (const sale of sales) {
      expect(history.clubs[sale.clubId]?.recordSale?.fee).toBeGreaterThanOrEqual(sale.fee);
      if (sale.buyerId) expect(history.clubs[sale.buyerId]?.recordSigning?.fee).toBeGreaterThanOrEqual(sale.fee);
    }
    const biggest = sales.reduce((best, sale) => (sale.fee > best.fee ? sale : best));
    expect(history.clubs[biggest.clubId]?.recordSale).toMatchObject({ playerId: biggest.playerId, otherClubId: biggest.buyerId });
  });

  it("follows the coach's clubs, firings and trophies", () => {
    const hired = run.events.flatMap((e) => (e.type === "coachHired" ? [e.clubId] : []));
    const fired = run.events.flatMap((e) => (e.type === "coachFired" && e.isYou ? [e.clubId] : []));
    const { coach } = history;
    expect(coach.stints.map((s) => s.clubId)).toEqual(hired);
    expect(coach.firings.map((f) => f.clubId)).toEqual(fired);
    expect(coach.stints.filter((s) => s.left === "fired")).toHaveLength(fired.length);
    expect(coach.stints.slice(0, -1).every((s) => s.until !== null)).toBe(true);
    const reviews = run.events.flatMap((e) => (e.type === "coachSeasonReviewed" ? [e] : []));
    expect(coach.seasons.map((s) => s.season)).toEqual(reviews.map((r) => r.season));
    for (const review of reviews.filter((r) => r.won)) {
      expect(coach.trophies.some((t) => t.season === review.season && t.clubId === review.clubId)).toBe(true);
    }
    for (const trophy of coach.trophies) {
      expect(history.seasons.find((s) => s.season === trophy.season)?.champions[trophy.competition]).toBe(trophy.clubId);
    }
  });

  it("survives save and load", () => {
    expect(loadGame(saveGame(run.final))).toStrictEqual(run.final);
    const withoutHistory = Object.fromEntries(Object.entries(run.final).filter(([key]) => key !== "history"));
    expect(() => loadGame(JSON.stringify(withoutHistory))).toThrow();
  });
});
