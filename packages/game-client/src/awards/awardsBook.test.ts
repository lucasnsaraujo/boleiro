import { describe, expect, it } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";
import { awardsBook } from "./awardsBook.js";

const CLUB = "flamengo-rj";
const session = createEngineSession(bundledGameFiles);
session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
const { date } = session.read(["date"]);
session.apply({ type: "advance", days: Array.from({ length: Math.round((Date.parse("2026-08-01") - Date.parse(date)) / 86_400_000) }, () => ({})) });
const midSeason = session.read(["history", "players", "competitions", "fixtures", "season", "coachClubId", "clubs", "world", "europe"]);

describe("the awards book", () => {
  it("shows the season under way as provisional, after the rounds played", () => {
    const book = session.awards();
    expect(book.seasons).toEqual([]);
    expect(book.provisional?.season).toBe(2026);
    expect(book.provisional?.roundsPlayed).toBeGreaterThan(10);
    expect(book.provisional?.awards.bolaDePrata).toHaveLength(11);
  });

  it("files a finished season's awards, newest first, with its champion", () => {
    const awards = session.awards().provisional?.awards;
    if (!awards) throw new Error("no provisional awards");
    const empty = { A: [], B: [], C: [], D: [] };
    const season = { season: 2025, champions: { "serie-a": "palmeiras-sp" }, topScorers: {}, promoted: empty, relegated: empty, tables: empty };
    const state = { ...midSeason, history: { ...midSeason.history, seasons: [{ ...season, awards }, { ...season, season: 2024 }] } };
    expect(awardsBook(state).seasons.map((s) => [s.season, s.championId])).toEqual([[2025, "palmeiras-sp"]]);
  });

  it("keeps the Brasileirão's records and the coach's club's, with its most capped players and top scorers", () => {
    const book = session.awards();
    expect(book.league?.biggestWin).not.toBeNull();
    expect(book.club?.clubId).toBe(CLUB);
    expect(book.club?.records.longestUnbeaten?.games).toBeGreaterThan(0);
    const tallies = Object.values(midSeason.history.players[CLUB] ?? {});
    expect(book.club?.mostApps[0]?.apps).toBe(Math.max(...tallies.map((p) => p.apps)));
    expect(book.club?.topScorers[0]?.goals).toBe(Math.max(...tallies.map((p) => p.goals)));
  });
});
