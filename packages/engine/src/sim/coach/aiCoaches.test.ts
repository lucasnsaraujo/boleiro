import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import type { World } from "../world/world.js";
import { coachesByClub, countriesCoaching, fullTierClubs, withCoachWorld, type AiCoach, type CoachWorld } from "./aiCoaches.js";

/** The world without its countries' coaches. */
const stripCoaching = (world: World): World =>
  Object.fromEntries(
    Object.entries(world).map(([id, country]) => {
      const stripped = { ...country };
      delete stripped.coaching;
      return [id, stripped];
    }),
  );

const coachesOf = (state: GameState): CoachWorld => {
  if (!state.coaches) throw new Error("the game has no AI coaches");
  return state.coaches;
};

/** Each club's AI coach, in the full tier and in every result-only country. */
const coachesOfGame = (state: GameState): Map<string, AiCoach> =>
  new Map([...coachesByClub(coachesOf(state)), ...countriesCoaching(state).flatMap(([, country]) => [...coachesByClub(country.coaching)])]);

describe("the AI coaches on day one", () => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj", world: loadSouthAmerica(2026) });
  const byClub = coachesOfGame(game);

  it("gives every club of the game a named coach but the player's", () => {
    const clubs = [...fullTierClubs(game).keys(), ...Object.values(game.world ?? {}).flatMap((country) => Object.keys(country.clubs))];
    const unnamed = clubs.filter((id) => id !== "flamengo-rj" && !byClub.get(id)?.name);
    expect(clubs.length).toBeGreaterThan(400);
    expect(unnamed).toEqual([]);
    expect(byClub.has("flamengo-rj")).toBe(false);
  });

  it("keeps a result-only country's coaches and pool in the country", () => {
    const argentina = game.world?.ar?.coaching;
    expect(Object.values(argentina?.coaches ?? {}).some((coach) => coach.clubId === "tm-209")).toBe(true);
    expect(Object.values(coachesOf(game).coaches).some((coach) => coach.clubId === "tm-209")).toBe(false);
    expect(Object.values(argentina?.coaches ?? {}).filter((coach) => coach.clubId === null).length).toBeGreaterThan(1);
  });

  it("puts each club's real coach from Transfermarkt in charge, in Brazil and in the result-only world", () => {
    expect(byClub.get("palmeiras-sp")).toMatchObject({ name: "Abel Ferreira", nationality: "Portugal", born: 1979, isReal: true });
    expect(byClub.get("palmeiras-sp")?.stints).toEqual([{ clubId: "palmeiras-sp", from: "2020-11-04", until: null, left: null }]);
    expect(byClub.get("tm-209")).toMatchObject({ name: "Leonardo Ponzio", nationality: "Argentina", isReal: true });
  });

  it("sends the real coach of the player's club to the free pool", () => {
    const jardim = Object.values(coachesOf(game).coaches).find((coach) => coach.name === "Leonardo Jardim");
    expect(jardim?.clubId).toBeNull();
    expect(jardim?.stints.at(-1)).toMatchObject({ clubId: "flamengo-rj", until: game.date, left: "replaced" });
  });

  it("invents a local coach where Transfermarkt lists none, and keeps some out of work", () => {
    const stateOnly = Object.values(game.clubs).find((club) => club.division === null && !byClub.get(club.id)?.isReal);
    const coach = stateOnly && byClub.get(stateOnly.id);
    expect(coach?.nationality).toBe("Brazil");
    expect(coach?.isReal).toBeUndefined();
    const pool = Object.values(coachesOf(game).coaches).filter((c) => c.clubId === null);
    expect(pool.length).toBeGreaterThan(10);
  });

  it("gives a save from before AI coaches the same coaches from its seed whenever it loads", () => {
    const old = loadGame(saveGame(game));
    delete old.coaches;
    for (const country of Object.values(old.world ?? {})) delete country.coaching;
    const first = withCoachWorld(loadGame(saveGame(old)));
    const again = withCoachWorld(loadGame(saveGame(old)));
    expect(first).toEqual(game);
    expect(again).toEqual(first);
  });
});

describe("the AI coaches and the rest of the game", () => {
  it("leave the matches, the money and the main random stream exactly as they were", () => {
    const withCoaches = loadNewGame(11, { coachClubId: "bahia-ba" });
    const without: GameState = { ...withCoaches };
    delete without.coaches;
    let a = withCoaches;
    let b = without;
    while (a.date < "2026-05-01") {
      a = advanceDay(a, {}).state;
      b = advanceDay(b, {}).state;
    }
    expect(a.fixtures).toEqual(b.fixtures);
    expect(a.finances).toEqual(b.finances);
    expect(a.rngState).toBe(b.rngState);
    expect(Object.values(a.coaches?.coaches ?? {}).some((coach) => coach.stints.some((stint) => stint.left === "fired"))).toBe(true);
  });

  it("leave the result-only world's matches as they were too", () => {
    const withCoaches = loadNewGame(11, { coachClubId: "bahia-ba", world: loadSouthAmerica(2026) });
    const without: GameState = { ...withCoaches, world: stripCoaching(withCoaches.world ?? {}) };
    delete without.coaches;
    let a = withCoaches;
    let b = without;
    while (a.date < "2026-05-01") {
      a = advanceDay(a, {}).state;
      b = advanceDay(b, {}).state;
    }
    expect(stripCoaching(a.world ?? {})).toEqual(b.world);
    expect(a.fixtures).toEqual(b.fixtures);
    expect(a.finances).toEqual(b.finances);
    expect(a.rngState).toBe(b.rngState);
    const fired = countriesCoaching(a).flatMap(([, country]) => Object.values(country.coaching.coaches)).filter((coach) => coach.stints.some((stint) => stint.left === "fired"));
    expect(fired.length).toBeGreaterThan(0);
  });
});
