import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import { loadEurope } from "../world/loadEurope.js";
import { leagueTable } from "../world/resultOnlyLeague.js";
import { endWorldSeason, playWorldDay, startCountry } from "../world/resultOnlyWorld.js";
import type { World } from "../world/world.js";
import { cupChampion, knockoutTie, leaguePhaseMatches, leaguePhaseTable, openingEuropeanCups, playEuropeDay, superCupWinner, type EuropeanCups } from "./uefaCups.js";

function startEurope(): World {
  return Object.fromEntries(loadEurope(2026).map(({ structure, levels }, i) => [structure.id, startCountry(structure, levels, 2026, 100 + i)]));
}

/** The world and UEFA's cups day by day, the cups after the countries as the game plays them. */
function play(world: World, europe: EuropeanCups, from: string, to: string, onDay?: (date: string, world: World, europe: EuropeanCups) => void) {
  let current = { world, europe };
  for (let date = from; date < to; date = addDays(date, 1)) {
    const played = playWorldDay(current.world, date);
    const playedWorld = date.endsWith("-12-31") ? endWorldSeason(played, Number(date.slice(0, 4)) + 1) : played;
    current = { world: playedWorld, europe: playEuropeDay(current.europe, playedWorld, date) };
    onDay?.(date, current.world, current.europe);
  }
  return current;
}

describe("a season of UEFA's cups", () => {
  const world = startEurope();
  const opening = openingEuropeanCups(world, 7, 2026);
  if (!opening) throw new Error("no European cups");
  let lastDay: { world: World; europe: EuropeanCups } | null = null;
  const end = play(world, opening, "2026-01-01", "2027-09-01", (date, w, e) => {
    if (date === "2027-06-30") lastDay = { world: w, europe: e };
  });
  const finished = lastDay ?? end;
  const [championsLeague, europaLeague] = finished.europe.cups;

  it("opens 2026/27 on the real league phases and the real Super Cup", () => {
    expect(opening.cups.map((cup) => cup.clubIds.length)).toEqual([36, 36]);
    expect(opening.cups[0]?.clubIds).toContain("tm-418");
    expect(opening.superCup?.clubIds).toEqual(["tm-583", "tm-405"]);
    expect(opening.superCup?.date).toBe("2026-08-12");
  });

  it("plays eight league-phase matches per club, then a play-off, round of 16, quarter-finals, semi-finals and a final", () => {
    for (const cup of [championsLeague, europaLeague]) {
      const matches = cup ? leaguePhaseMatches(cup) : [];
      expect(matches).toHaveLength(144);
      expect(matches.every((m) => m.result !== null)).toBe(true);
      expect(cup?.knockout.map((round) => [round.name, round.ties.length])).toEqual([
        ["playoffs", 8],
        ["round-of-16", 8],
        ["quarter-finals", 4],
        ["semi-finals", 2],
        ["final", 1],
      ]);
    }
  });

  it("sends the top eight to the round of 16 and places 9 to 24 to the play-offs", () => {
    const table = championsLeague ? leaguePhaseTable(championsLeague) : [];
    const [playoffs, roundOf16] = championsLeague?.knockout ?? [];
    expect(playoffs?.ties.flat().toSorted()).toEqual(table.slice(8, 24).toSorted());
    const playoffWinners = playoffs?.ties.map((_, i) => knockoutTie(playoffs, i).winnerId) ?? [];
    expect(roundOf16?.ties.flat().toSorted()).toEqual([...table.slice(0, 8), ...playoffWinners].toSorted());
  });

  it("plays extra time in a knockout tie level after the last leg's ninety minutes, and penalties only if still level", () => {
    const ties = [championsLeague, europaLeague].flatMap((cup) => cup?.knockout.flatMap((round) => round.ties.map((_, i) => knockoutTie(round, i))) ?? []);
    for (const tie of ties.filter((t) => t.onPenalties)) expect(tie.isAfterExtraTime).toBe(true);
    expect(ties.some((t) => t.isAfterExtraTime && !t.onPenalties)).toBe(true);
  });

  it("crowns a Champions League, a Europa League and a Super Cup winner", () => {
    expect(championsLeague && cupChampion(championsLeague)).toBeTruthy();
    expect(europaLeague && cupChampion(europaLeague)).toBeTruthy();
    expect(superCupWinner(finished.europe.superCup)).toMatch(/^tm-(583|405)$/);
  });

  it("files the champions on 1 July and opens 2027/28 on places from the countries' tables and cups", () => {
    const [winners] = end.europe.winners;
    expect(winners).toEqual({
      season: 2026,
      championsLeague: championsLeague && cupChampion(championsLeague),
      europaLeague: europaLeague && cupChampion(europaLeague),
      superCup: superCupWinner(finished.europe.superCup),
    });
    expect(end.europe.season).toBe(2027);
    const [nextChampionsLeague, nextEuropaLeague] = end.europe.cups;
    const premierLeague = finished.world["gb-eng"]?.leagues[0];
    const englandTop = premierLeague ? leagueTable(premierLeague).slice(0, 5) : [];
    expect(englandTop).toHaveLength(5);
    for (const id of englandTop) expect(nextChampionsLeague?.clubIds).toContain(id);
    const englishCup = end.world["gb-eng"]?.seasons.at(-1)?.cup?.championId ?? "";
    expect([...(nextChampionsLeague?.clubIds ?? []), ...(nextEuropaLeague?.clubIds ?? [])]).toContain(englishCup);
    expect(nextChampionsLeague?.clubIds).toHaveLength(36);
    expect(nextEuropaLeague?.clubIds).toHaveLength(36);
  });

  it("opens next season's Super Cup between the two champions and plays it in August", () => {
    expect(end.europe.superCup?.clubIds).toEqual([winnersOf(end.europe).championsLeague, winnersOf(end.europe).europaLeague]);
    expect(end.europe.superCup?.date.startsWith("2027-08")).toBe(true);
    expect(superCupWinner(end.europe.superCup)).not.toBeNull();
  });

  it("opens the next season on 1 July after one it could not field", () => {
    const empty: EuropeanCups = { season: 2026, cups: [], superCup: null, winners: [], rngState: 1 };
    const next = playEuropeDay(empty, end.world, "2027-07-01");
    expect(next.season).toBe(2027);
    expect(next.cups.map((cup) => cup.clubIds.length)).toEqual([36, 36]);
    expect(next.superCup).toBeNull();
    expect(next.winners).toEqual([]);
  });

  it("opens only on the 2026/27 season, whose field is the real one", () => {
    expect(openingEuropeanCups(world, 7, 2027)).toBeNull();
  });

  it("is left as it was on a day without a European match", () => {
    expect(playEuropeDay(opening, world, "2026-03-03")).toBe(opening);
  });
});

function winnersOf(europe: EuropeanCups) {
  const [winners] = europe.winners;
  if (!winners) throw new Error("no winners filed");
  return winners;
}
