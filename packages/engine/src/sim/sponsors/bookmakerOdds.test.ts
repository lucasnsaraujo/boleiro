import { describe, expect, it } from "vitest";
import { matchOdds } from "../../engine/match.js";
import { advanceDay } from "../advanceDay.js";
import { DEFAULT_TACTICS } from "../coach/tactics.js";
import type { GameState } from "../gameState.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { engineTeam } from "../players/matchSetup.js";
import { BOOKMAKER_MARGIN, bookmakerOdds } from "./bookmakerOdds.js";

describe("a betting sponsor's odds", () => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj" });
  const fixtures = game.fixtures.filter((f) => f.competitionId.includes("serie-a")).slice(0, 10);

  it("prices a match from the engine's chances with the bookmaker's margin on top", () => {
    for (const fixture of fixtures) {
      const odds = bookmakerOdds(game, fixture);
      const booked = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
      expect(booked).toBeGreaterThan(1 + BOOKMAKER_MARGIN - 0.01);
      expect(booked).toBeLessThan(1 + BOOKMAKER_MARGIN + 0.01);
    }
  });

  it("gives the stronger side the shorter price", () => {
    const flamengoHome = game.fixtures.find((f) => f.homeId === "flamengo-rj" && game.clubs[f.awayId]?.division === "A");
    if (!flamengoHome) throw new Error("Flamengo has no Série A home game");
    const odds = bookmakerOdds(game, flamengoHome);
    expect(odds.home).toBeLessThan(odds.away);
  });

  it("prices the coach's match from the very chances the engine draws it from on its day, shortened by the margin", () => {
    let state: GameState = loadNewGame(5, { coachClubId: "flamengo-rj" });
    const isFlamengos = (f: GameState["fixtures"][number]) => !f.result && (f.homeId === "flamengo-rj" || f.awayId === "flamengo-rj");
    // A few matches in, so the squad carries fatigue, morale and maybe a ban into it.
    for (let played = 0; played < 4; ) {
      if (state.fixtures.some((f) => isFlamengos(f) && f.date === state.date)) played++;
      state = advanceDay(state, {}).state;
    }
    while (!state.fixtures.some((f) => isFlamengos(f) && f.date === state.date)) state = advanceDay(state, {}).state;
    const fixture = state.fixtures.find((f) => isFlamengos(f) && f.date === state.date);
    const day = startMatchDay(state, {});
    const open = day.coachMatch;
    const match = day.matches.find((m) => m.fixtureId === fixture?.id);
    if (!fixture || !open || !match) throw new Error("Flamengo's match didn't open");
    const isHome = fixture.homeId === "flamengo-rj";
    const team = (side: "home" | "away") =>
      engineTeam(side, open.starters[side], (p) => open.strengths[p.id] ?? 0, (side === "home") === isHome ? open.tactics : { ...DEFAULT_TACTICS, formation: match.formations[side] });
    const chances = matchOdds(team("home"), team("away"), open.params);
    const price = (chance: number) => Math.max(1.01, Math.round(100 / (chance * (1 + BOOKMAKER_MARGIN))) / 100);
    expect(bookmakerOdds(state, fixture)).toEqual({ home: price(chances.home), draw: price(chances.draw), away: price(chances.away) });
  });
});
