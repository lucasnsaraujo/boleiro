import { expect, test } from "vitest";
import type { Fixture } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { syncNationalFixtures } from "@boleiro/engine/sim/nations/nationalFixtures";
import { calendarMonths, calendarPage, matchAbsences, pageFor, pageStartOf, turnPage, upcomingMatches, type CalendarEntry } from "./calendarMonths.js";

const game = newGameFromFiles(5, { coachClubId: "bahia-ba" }, bundledGameFiles);
const own = game.fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").toSorted((a, b) => a.date.localeCompare(b.date));

const matches = (entries: readonly CalendarEntry[]) => entries.flatMap((e) => (e.kind === "match" ? [e] : []));

test("the season has twelve months and every coach fixture sits in its own month", () => {
  const months = calendarMonths(game);
  expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(months.flatMap((m) => matches(m.entries)).length).toBe(own.length);
  for (const { month, entries } of months) {
    for (const entry of entries) expect(Number(entry.date.slice(5, 7))).toBe(month);
  }
});

test("entries run in date order", () => {
  for (const { entries } of calendarMonths(game)) {
    const dates = entries.map((e) => e.date);
    expect(dates).toEqual(dates.toSorted());
  }
});

test("a fixture shows the competition, the side and the opponent", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const entry = matches(calendarMonths(game).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  const isHome = fixture.homeId === "bahia-ba";
  expect(entry).toMatchObject({ competition: "Baiano", isHome, opponentId: isHome ? fixture.awayId : fixture.homeId, result: null });
});

test("a postponed game shows on its new day with the day it was postponed from, and its round", () => {
  const fixture = own.find((f) => f.competitionId === "serie-a-2026");
  if (!fixture) throw new Error("no Série A game");
  const postponed = { ...game, fixtures: game.fixtures.map((f) => (f.id === fixture.id ? { ...f, date: "2026-08-19", postponedFrom: f.date } : f)) };
  const entry = matches(calendarMonths(postponed).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  expect(entry).toMatchObject({ date: "2026-08-19", postponedFrom: fixture.date });
  const coming = upcomingMatches({ ...postponed, date: "2026-08-18" }, 1)[0];
  expect(coming?.label).toMatch(/^Série A · \d+ª rodada · adiado$/);
});

test("a played fixture gets its score and whether the coach's club won", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const ownGoals = { homeGoals: 3, awayGoals: 0 };
  const result = fixture.homeId === "bahia-ba" ? ownGoals : { homeGoals: 0, awayGoals: 3 };
  const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === fixture.id ? { ...f, result } : f));
  const entry = matches(calendarMonths({ ...game, fixtures }).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  expect(entry?.result).toEqual({ homeGoals: result.homeGoals, awayGoals: result.awayGoals, outcome: "win", onPenalties: false });
});

test("a draw settled on penalties counts for the side that went through", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === fixture.id ? { ...f, result: { homeGoals: 1, awayGoals: 1, penaltyWinnerId: "bahia-ba" } } : f));
  const entry = matches(calendarMonths({ ...game, fixtures }).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  expect(entry?.result).toMatchObject({ outcome: "win", onPenalties: true });
});

test("the transfer windows open and close on their dates, and their months are marked", () => {
  const months = calendarMonths(game);
  const windows = months.flatMap((m) => m.entries.flatMap((e) => (e.kind === "window" ? [[e.date, e.opens]] : [])));
  expect(windows).toEqual([
    ["2026-01-05", true],
    ["2026-03-03", false],
    ["2026-07-20", true],
    ["2026-09-11", false],
  ]);
  expect(months.filter((m) => m.hasWindow).map((m) => m.month)).toEqual([1, 2, 3, 7, 8, 9]);
});

test("a game without the mid-season window shows only the window between seasons", () => {
  const withoutMidSeason = { ...game, hasMidSeasonWindow: false as const };
  const months = calendarMonths(withoutMidSeason);
  expect(months.flatMap((m) => m.entries.flatMap((e) => (e.kind === "window" ? [e.date] : [])))).toEqual(["2026-01-05", "2026-03-03"]);
  expect(months.filter((m) => m.hasWindow).map((m) => m.month)).toEqual([1, 2, 3]);
  expect(calendarPage(withoutMidSeason, "2026-07-20").months.flatMap((m) => m.windows)).toEqual([]);
});

test("a coach without a club still sees the windows, with no games", () => {
  const months = calendarMonths({ ...game, coachClubId: null });
  expect(months.flatMap((m) => matches(m.entries))).toEqual([]);
  expect(months.flatMap((m) => m.entries)).toHaveLength(4);
});

test("a page is five Monday-first weeks from the week holding the day, with today and the days before it marked", () => {
  const start = pageStartOf("2026-10-18");
  expect(start).toBe("2026-10-12");
  expect(pageStartOf("2026-10-12")).toBe("2026-10-12");
  const { days } = calendarPage({ ...game, date: "2026-10-18" }, start);
  expect(days).toHaveLength(35);
  expect(days[0]).toMatchObject({ date: "2026-10-12", day: 12, row: 1, column: 1, isPast: true, isToday: false });
  expect(days[6]).toMatchObject({ date: "2026-10-18", row: 1, column: 7, isPast: false, isToday: true });
  expect(days[34]).toMatchObject({ date: "2026-11-15", row: 5, column: 7, isPast: false });
  expect(days.filter((d) => d.isPast)).toHaveLength(6);
});

test("a page is titled after the season's months on it, and days of another season sit outside it", () => {
  expect(calendarPage(game, "2026-10-12").title).toBe("Outubro e novembro");
  const first = calendarPage(game, pageStartOf(`${game.season}-01-01`));
  expect(first.title).toBe("Janeiro e fevereiro");
  expect(first.days.filter((d) => !d.isInSeason).map((d) => d.date)).toEqual(["2025-12-29", "2025-12-30", "2025-12-31"]);
  expect(calendarPage(game, "2026-12-07").title).toBe("Dezembro");
});

test("a page lists the coach's games by month, each on its day's square", () => {
  const start = pageStartOf("2026-08-03");
  const page = calendarPage(game, start);
  const end = page.days.at(-1)?.date ?? "";
  expect(page.months.map((m) => m.month)).toEqual([8, 9]);
  const shown = page.months.flatMap((m) => m.matches);
  expect(shown.map((m) => m.fixtureId)).toEqual(own.filter((f) => f.date >= start && f.date <= end).map((f) => f.id));
  expect(shown.length).toBeGreaterThan(0);
  for (const { month, matches: games } of page.months) {
    for (const match of games) {
      expect(Number(match.date.slice(5, 7))).toBe(month);
      expect(page.days.find((d) => d.date === match.date)).toMatchObject({ row: match.row, column: match.column });
    }
  }
});

test("a page with the transfer window marks the week it opens or closes, or says it stays open", () => {
  const windowsOn = (start: string) => calendarPage(game, start).months.flatMap(({ month, windows }) => windows.map((w) => ({ month, ...w })));
  const firstWindow = { opensOn: "2026-01-05", closesOn: "2026-03-03" };
  expect(windowsOn("2025-12-29")).toEqual([{ month: 1, status: "opens", date: "2026-01-05", row: 2, ...firstWindow }]);
  expect(windowsOn("2026-01-12")).toEqual([{ month: 2, status: "open", date: "2026-02-15", row: 5, ...firstWindow }]);
  expect(windowsOn("2026-02-02")).toEqual([{ month: 3, status: "closes", date: "2026-03-03", row: 5, ...firstWindow }]);
  expect(windowsOn("2026-06-01")).toEqual([]);
  expect(windowsOn("2026-07-20")).toMatchObject([{ month: 7, status: "opens", row: 1, opensOn: "2026-07-20", closesOn: "2026-09-11" }]);
});

test("the coming games are the coach's unplayed ones from today on, in date order, with their round", () => {
  const [first, second, third] = own;
  if (!first || !second || !third) throw new Error("no fixtures");
  const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === first.id ? { ...f, result: { homeGoals: 2, awayGoals: 1 } } : f));
  const coming = upcomingMatches({ ...game, date: first.date, fixtures }, 2);
  expect(coming.map((m) => m.fixtureId)).toEqual([second.id, third.id]);
  expect(coming[0]).toMatchObject({ competitionId: second.competitionId, result: null });
  expect(coming[0]?.label).toMatch(/^Baiano · \dª rodada$/);
  expect(upcomingMatches({ ...game, coachClubId: null }, 3)).toEqual([]);
});

test("a game misses the coach's players injured past its day and those banned in its competition", () => {
  const [match] = upcomingMatches(game, 1);
  if (!match) throw new Error("no fixture");
  const [hurt, healed, banned, bannedElsewhere] = Object.values(game.players).filter((p) => p.clubId === "bahia-ba");
  const outsider = Object.values(game.players).find((p) => p.clubId !== "bahia-ba");
  if (!hurt || !healed || !banned || !bannedElsewhere || !outsider) throw new Error("no players");
  const injured = (until: string) => ({ ...hurt.condition, injuredUntil: until });
  const players = {
    ...game.players,
    [hurt.id]: { ...hurt, condition: injured("2026-12-01") },
    [healed.id]: { ...healed, condition: injured(match.date) },
    [outsider.id]: { ...outsider, condition: injured("2026-12-01") },
  };
  const record = { yellows: 0, phase: 0, bans: 1 };
  const discipline = { [match.competitionId]: { [banned.id]: record }, elsewhere: { [bannedElsewhere.id]: record } };
  expect(matchAbsences({ ...game, players, discipline }, match)).toEqual([
    { name: hurt.name, reason: "injured" },
    { name: banned.name, reason: "suspended" },
  ]);
});

test("pages turn five weeks at a time and stop at the season's first and last weeks", () => {
  const first = pageFor(2026, "2026-01-01");
  expect(first).toBe("2025-12-29");
  expect(calendarPage(game, first)).toMatchObject({ hasPrevious: false, hasNext: true });
  expect(turnPage(2026, first, -1)).toBe(first);
  expect(turnPage(2026, "2026-06-01", 1)).toBe("2026-07-06");
  expect(turnPage(2026, "2026-06-01", -1)).toBe("2026-04-27");
  expect(calendarPage(game, "2026-06-01")).toMatchObject({ hasPrevious: true, hasNext: true });
  const last = pageFor(2026, "2026-12-31");
  expect(calendarPage(game, last).days.at(-1)?.date).toBe("2027-01-03");
  expect(calendarPage(game, last)).toMatchObject({ hasPrevious: true, hasNext: false });
  expect(turnPage(2026, "2026-11-02", 1)).toBe(last);
});

test("a game of another year, a league abroad's crossing the new year, stays out of this year's months", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const nextYear: Fixture = { ...fixture, id: "next-year", date: `${game.season + 1}-01-20` };
  const lastYear: Fixture = { ...fixture, id: "last-year", date: `${game.season - 1}-12-20` };
  const months = calendarMonths({ ...game, fixtures: [...game.fixtures, nextYear, lastYear] });
  const ids = months.flatMap((m) => matches(m.entries)).map((e) => e.fixtureId);
  expect(ids).not.toContain("next-year");
  expect(ids).not.toContain("last-year");
  expect(ids).toHaveLength(own.length);
});

test("a national coach's calendar has his national team's games beside his club's, as their own side", () => {
  const nations = game.nations;
  if (!nations) throw new Error("the game has no national football");
  const coaching = syncNationalFixtures({ ...game, nations: { ...nations, job: { teamId: "brazil", since: game.date } } });
  const national = matches(calendarMonths(coaching).flatMap((m) => m.entries)).filter((m) => m.competition === "Copa do Mundo 2026");
  expect(national.map((m) => `${m.date} ${m.isHome ? "casa" : "fora"} ${m.opponentId}`)).toEqual(["2026-06-13 casa morocco", "2026-06-20 casa haiti", "2026-06-24 fora scotland"]);
  const brazilOnly = { ...coaching, coachClubId: null, date: "2026-06-01" };
  expect(upcomingMatches(brazilOnly, 1)[0]).toMatchObject({ opponentId: "morocco", label: "Copa do Mundo 2026 · Grupo C" });
});

test("a national team's game misses none of the coach's club players", () => {
  const nations = game.nations;
  const hurt = Object.values(game.players).find((p) => p.clubId === "bahia-ba");
  if (!nations || !hurt) throw new Error("the game has no national football or no Bahia player");
  const players = { ...game.players, [hurt.id]: { ...hurt, condition: { ...hurt.condition, injuredUntil: "2026-12-01" } } };
  const coaching = syncNationalFixtures({ ...game, players, nations: { ...nations, job: { teamId: "brazil", since: game.date } } });
  expect(matchAbsences(coaching, { date: "2026-06-13", competitionId: "national:world-cup-2026" })).toEqual([]);
  expect(matchAbsences(coaching, { date: "2026-06-13", competitionId: "serie-a-2026" }).map((a) => a.name)).toContain(hurt.name);
});

test("a national team's game names the coach's side in it and its neutral ground, and shares its day's square with his club's", () => {
  const nations = game.nations;
  if (!nations) throw new Error("the game has no national football");
  const coaching = syncNationalFixtures({ ...game, nations: { ...nations, job: { teamId: "brazil", since: game.date } } });
  const worldCup = matches(calendarMonths(coaching).flatMap((m) => m.entries)).filter((m) => m.competition === "Copa do Mundo 2026");
  expect(worldCup.map((m) => [m.sideId, m.isNeutral])).toEqual([["brazil", true], ["brazil", true], ["brazil", true]]);
  expect(matches(calendarMonths(coaching).flatMap((m) => m.entries)).find((m) => m.competition !== "Copa do Mundo 2026")).toMatchObject({ sideId: "bahia-ba", isNeutral: false });
  // Série A rests through the World Cup, so the shared square is a coach's in a series below it, which play on.
  const clash = game.fixtures.find((f) => f.competitionId.startsWith("serie-") && worldCup.some((m) => m.date === f.date));
  if (!clash) throw new Error("a club plays on a day Brazil does");
  const below = newGameFromFiles(5, { coachClubId: clash.homeId }, bundledGameFiles);
  const belowNations = below.nations;
  if (!belowNations) throw new Error("the game has no national football");
  const both = syncNationalFixtures({ ...below, nations: { ...belowNations, job: { teamId: "brazil", since: below.date } } });
  const page = calendarPage({ ...both, date: clash.date }, pageFor(both.season, clash.date));
  expect(page.months.flatMap((m) => m.matches).filter((m) => m.date === clash.date).map((m) => m.stack).sort()).toEqual([0, 1]);
});
