import { describe, expect, it } from "vitest";
import type { Fixture } from "@boleiro/engine/sim/gameState";
import { newHistory } from "@boleiro/engine/sim/history/history";
import { curiositiesOf, type CuriosityMatch } from "./curiositiesOf.js";

const day = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;
const game = (n: number, homeId: string, awayId: string, homeGoals: number, awayGoals: number): Fixture => ({
  id: `g${n}`,
  competitionId: "serie-a-2026",
  stage: 0,
  date: day(n),
  homeId,
  awayId,
  result: { homeGoals, awayGoals },
});
const names: Record<string, string> = { fla: "Flamengo", pal: "Palmeiras", x: "Bahia", y: "Vasco" };

/** Palmeiras unbeaten in its seven games before the 20th, against Bahia and Vasco by turns. */
const unbeaten = Array.from({ length: 7 }, (_, i) => game(i + 1, "pal", i % 2 ? "x" : "y", 1 + (i % 2), 1));
const match = game(20, "fla", "pal", 2, 1);

function matchOf(change: Partial<CuriosityMatch> = {}): CuriosityMatch {
  return {
    state: { fixtures: [...unbeaten, match], history: newHistory(2026, "2026-01-01", "fla"), season: 2026 },
    fixture: match,
    score: { home: 2, away: 1 },
    scorers: null,
    crowd: null,
    competitionName: "Série A",
    clubName: (id) => names[id] ?? id,
    playerName: (id) => id,
    ...change,
  };
}

describe("a match's curiosities", () => {
  it("tells that a side's unbeaten run ended, counting its real games before the match", () => {
    expect(curiositiesOf(matchOf())).toContain("Palmeiras não perdia havia 7 jogos. A série acabou aqui.");
  });

  it("tells a run that goes on while the match is under way, not one it ended", () => {
    const live = curiositiesOf(matchOf({ score: null }));
    expect(live).toContain("Palmeiras chega invicto há 7 jogos.");
    expect(live.join(" ")).not.toContain("acabou");
  });

  it("names a scorer's tally only from a real timeline, adding his goals today to the season's", () => {
    const history = newHistory(2026, "2026-01-01", "fla");
    history.current.goals["serie-a"] = { pedro: 7 };
    const scorers = [
      { playerId: "pedro", clubId: "fla" },
      { playerId: "pedro", clubId: "fla" },
    ];
    const state = { fixtures: [...unbeaten, match], history, season: 2026 };
    expect(curiositiesOf(matchOf({ state, scorers, playerName: () => "Pedro" }))).toContain("Pedro fez 2 gols e chega a 9 na Série A 2026.");
    expect(curiositiesOf(matchOf({ state, scorers: null })).join(" ")).not.toContain("Pedro");
  });

  it("tells the last meeting of the two sides this season, as it ended", () => {
    const earlier = game(10, "pal", "fla", 3, 0);
    const state = { fixtures: [earlier, match], history: newHistory(2026, "2026-01-01", "fla"), season: 2026 };
    expect(curiositiesOf(matchOf({ state }))).toContain("Na última vez, em 10 mai, deu Palmeiras 3 × 0 Flamengo.");
  });

  it("keeps to three facts at most and makes none up for a match with no story", () => {
    const quiet = game(20, "x", "y", 0, 0);
    const state = { fixtures: [quiet], history: newHistory(2026, "2026-01-01", "fla"), season: 2026 };
    expect(curiositiesOf(matchOf({ state, fixture: quiet, score: { home: 0, away: 0 } }))).toEqual([]);
    expect(curiositiesOf(matchOf()).length).toBeLessThanOrEqual(3);
  });
});

describe("a national match's curiosities", () => {
  it("tell no scorer's tally, which the history keeps only for clubs", () => {
    const national = { ...match, id: "national:world-cup-2026-C-1-brazil", competitionId: "national:world-cup-2026" };
    const told = curiositiesOf(matchOf({ fixture: national, scorers: [{ playerId: "p1", clubId: "fla" }, { playerId: "p1", clubId: "fla" }], competitionName: "Copa do Mundo 2026", playerName: () => "Vinicius Junior" }));
    expect(told.join(" ")).not.toContain("Vinicius Junior fez");
  });
});
