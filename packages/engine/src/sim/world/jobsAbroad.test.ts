import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { REALISTA } from "../formats.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { leagueMatches } from "./resultOnlyLeague.js";
import { loadEurope } from "./loadEurope.js";
import { loadSouthAmerica } from "./loadSouthAmerica.js";
import type { WorldClub } from "./world.js";

const FLAMENGO = "flamengo-rj";
const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
const start = loadNewGame(5, { coachClubId: FLAMENGO, world, formats: REALISTA });
const seasonsBehind = [2024, 2025].map((season) => ({ season, clubId: FLAMENGO, position: 1, targetPosition: 4 }));

/** The game with the coach's name and the seasons he has behind him set. */
const coachWith = (state: GameState, reputation: number, seasons = seasonsBehind): GameState => ({
  ...state,
  coach: { ...state.coach, reputation },
  history: { ...state.history, coach: { ...state.history.coach, seasons } },
});

const isAbroad = (state: GameState, clubId: string) => !(clubId in state.clubs) && Object.values(state.world ?? {}).some((country) => clubId in country.clubs);

/** Plays up to `days` days, the coach's name held where it was set, until a club abroad offers him its job. */
function untilOfferAbroad(state: GameState, days: number): { state: GameState; clubId: string | null } {
  let current = state;
  const reputation = state.coach.reputation;
  for (let day = 0; day < days; day++) {
    current = advanceDay(current, {}).state;
    current = { ...current, coach: { ...current.coach, reputation } };
    const offer = current.coach.offers.find((o) => isAbroad(current, o.clubId));
    if (offer) return { state: current, clubId: offer.clubId };
  }
  return { state: current, clubId: null };
}

describe("job offers from clubs abroad", () => {
  const veteran = untilOfferAbroad(coachWith(start, 100), 240);

  it("come to a coach with a big name and two seasons behind him, when a job abroad opens", () => {
    expect(veteran.clubId).not.toBeNull();
    const offer = veteran.state.coach.offers.find((o) => o.clubId === veteran.clubId);
    expect(offer?.salary).toBeGreaterThan(10_000);
  });

  it("never come to a coach without the name", () => {
    expect(untilOfferAbroad(coachWith(start, 70), 240).clubId).toBeNull();
  });

  it("never come early in a career, however big the name", () => {
    expect(untilOfferAbroad(coachWith(start, 100, []), 240).clubId).toBeNull();
  });

  describe("accepted", () => {
    const clubId = veteran.clubId ?? "";
    const country = Object.entries(veteran.state.world ?? {}).find(([, c]) => clubId in c.clubs)?.[0] ?? "";
    const leaguesBefore = veteran.state.world?.[country]?.leagues ?? [];
    const playedBefore = leaguesBefore.flatMap(leagueMatches).filter((m) => m.result).length;
    const hired = advanceDay(veteran.state, { acceptOffer: clubId }).state;

    it("moves the coach to the club, its country into the full tier", () => {
      expect(hired.coachClubId).toBe(clubId);
      expect(hired.clubs[clubId]?.abroad?.country).toBe(country);
      expect(hired.world?.[country]?.isFullTier).toBe(true);
      expect(hired.world?.[country]?.leagues).toEqual([]);
      expect(hired.boards[clubId]).toBeDefined();
      expect(hired.finances[clubId]?.cash).toBeGreaterThan(0);
    });

    it("keeps the league's season so far: its table's games, played and to play", () => {
      const ids = new Set(leaguesBefore.map((league) => league.id));
      const fixtures = hired.fixtures.filter((f) => ids.has(f.competitionId));
      expect(fixtures).toHaveLength(leaguesBefore.flatMap(leagueMatches).length);
      expect(fixtures.filter((f) => f.result).length).toBeGreaterThanOrEqual(playedBefore);
    });

    it("gives the squad wages and its players' real ages", () => {
      const squad = Object.values(hired.players).filter((p) => p.clubId === clubId);
      expect(squad.length).toBeGreaterThanOrEqual(18);
      for (const player of squad) expect(player.wage).toBeGreaterThan(0);
      expect(new Set(squad.map((p) => p.age)).size).toBeGreaterThan(3);
    });

    it("plays the club's league games in the full tier from then on, and saves", () => {
      let state = hired;
      for (let day = 0; day < 40; day++) state = advanceDay(state, {}).state;
      const own = state.fixtures.filter((f) => (f.homeId === clubId || f.awayId === clubId) && f.result && f.date >= hired.date);
      expect(own.length).toBeGreaterThan(0);
      expect(loadGame(saveGame(state))).toEqual(state);
    });
  });

  it("gives the players of a world saved before ages the usual 26", () => {
    const clubId = veteran.clubId ?? "";
    const country = Object.entries(veteran.state.world ?? {}).find(([, c]) => clubId in c.clubs)?.[0] ?? "";
    const found = veteran.state.world?.[country];
    if (!found) throw new Error("no country");
    const ageless = Object.fromEntries(Object.entries(found.clubs).map(([id, club]): [string, WorldClub] => [id, { ...club, born: undefined }]));
    const old = { ...veteran.state, world: { ...veteran.state.world, [country]: { ...found, clubs: ageless } } };
    const hired = advanceDay(old, { acceptOffer: clubId }).state;
    const ages = new Set(Object.values(hired.players).filter((p) => p.clubId === clubId && !p.name.startsWith("Academy")).map((p) => p.age));
    expect([...ages]).toContain(26);
  });
});
