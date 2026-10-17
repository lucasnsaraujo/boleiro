import { describe, expect, it } from "vitest";
import { advanceDay } from "@boleiro/engine/sim/advanceDay";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { awardsBook } from "./awardsBook.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: CLUB });
let midSeason: GameState = start;
while (midSeason.date < "2026-08-01") midSeason = advanceDay(midSeason, {}).state;

describe("the awards book", () => {
  it("shows the season under way as provisional, after the rounds played", () => {
    const book = awardsBook(midSeason);
    expect(book.seasons).toEqual([]);
    expect(book.provisional?.season).toBe(2026);
    expect(book.provisional?.roundsPlayed).toBeGreaterThan(10);
    expect(book.provisional?.awards.bolaDePrata).toHaveLength(11);
  });

  it("files a finished season's awards, newest first, with its champion", () => {
    const awards = awardsBook(midSeason).provisional?.awards;
    if (!awards) throw new Error("no provisional awards");
    const season = { season: 2025, champions: { "serie-a": "palmeiras-sp" }, topScorers: {}, promoted: { A: [], B: [], C: [], D: [] }, relegated: { A: [], B: [], C: [], D: [] }, tables: { A: [], B: [], C: [], D: [] } };
    const state = { ...midSeason, history: { ...midSeason.history, seasons: [{ ...season, awards }, { ...season, season: 2024 }] } };
    const book = awardsBook(state);
    expect(book.seasons.map((s) => [s.season, s.championId])).toEqual([[2025, "palmeiras-sp"]]);
  });

  it("keeps the Brasileirão's records and the coach's club's, with its most capped players and top scorers", () => {
    const book = awardsBook(midSeason);
    expect(book.league?.biggestWin).not.toBeNull();
    expect(book.club?.clubId).toBe(CLUB);
    expect(book.club?.records.longestUnbeaten?.games).toBeGreaterThan(0);
    const [mostApps] = book.club?.mostApps ?? [];
    const apps = Object.values(midSeason.history.players[CLUB] ?? {}).map((p) => p.apps);
    expect(mostApps?.apps).toBe(Math.max(...apps));
    const goals = Object.values(midSeason.history.players[CLUB] ?? {}).map((p) => p.goals);
    expect(book.club?.topScorers[0]?.goals).toBe(Math.max(...goals));
  });
});
