import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { clubMood, type ClubMood } from "./clubMood.js";
import { moraleStrength } from "./moraleStrength.js";
import { reactToDay } from "./reactToDay.js";
import { reactToIdolSale } from "./reactToIdolSale.js";
import { rivalryOf } from "../rivalries/rivalryOf.js";
import { rivalsOf } from "./rivalsOf.js";

const start = loadNewGame(9, { coachClubId: null });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const leagueDay = advanceTo(start, start.calendar.leagueDates.A[2] ?? "");
const game = leagueDay.fixtures.find((f) => f.date === leagueDay.date && leagueDay.clubs[f.homeId]?.division === "A");
if (!game) throw new Error("no Série A game on the test day");
const host = game.homeId;
const visitor = game.awayId;

const withMood = (state: GameState, clubId: string, mood: Partial<ClubMood>): GameState => ({
  ...state,
  mood: { ...state.mood, [clubId]: { ...clubMood(state, clubId), ...mood } },
});
const withStrength = (state: GameState, clubId: string, strength: number): GameState => ({
  ...state,
  players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.clubId === clubId ? { ...p, strength } : p])),
});
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

describe("squad morale", () => {
  it("rises after a win and falls after a defeat", () => {
    const neutral = withMood(leagueDay, host, { squad: 50 });
    const won = advanceDay(withStrength(neutral, visitor, 1), {}).state;
    const lost = advanceDay(withStrength(neutral, host, 1), {}).state;
    expect(clubMood(won, host).squad).toBeGreaterThan(50);
    expect(clubMood(lost, host).squad).toBeLessThan(50);
  });

  it("falls more with each month of late wages", () => {
    const monthEnd = advanceTo(leagueDay, "2026-04-30");
    const broke = (months: number): GameState => {
      const finance = monthEnd.finances[host];
      if (!finance) throw new Error(`no finances for ${host}`);
      const finances = { ...monthEnd.finances, [host]: { ...finance, cash: -1e9, lateWageMonths: months } };
      return withMood({ ...monthEnd, finances }, host, { squad: 50 });
    };
    const closing = (state: GameState) => advanceTo(state, "2026-05-01");
    const once = clubMood(closing(broke(0)), host).squad;
    const thrice = clubMood(closing(broke(2)), host).squad;
    const paid = clubMood(closing(withMood(monthEnd, host, { squad: 50 })), host).squad;
    expect(once).toBeLessThan(paid);
    expect(thrice).toBeLessThan(once);
  });

  it("makes a happy side play a little better than an unhappy one", () => {
    const goalDifference = (squad: number) =>
      Array.from({ length: 60 }, (_, seed) => {
        const day = withMood({ ...leagueDay, rngState: seed }, host, { squad });
        const result = advanceDay(day, {}).state.fixtures.find((f) => f.id === game.id)?.result;
        return (result?.homeGoals ?? 0) - (result?.awayGoals ?? 0);
      }).reduce((sum, d) => sum + d, 0);
    expect(goalDifference(100)).toBeGreaterThan(goalDifference(0));
  });

  it("is worth at most a point or two of strength", () => {
    const player = squadOf(leagueDay, host)[0];
    if (!player) throw new Error("empty squad");
    const effect = (squad: number) => moraleStrength(player, squad, 0, leagueDay.date);
    expect(effect(50)).toBe(0);
    expect(effect(100)).toBeGreaterThan(0);
    expect(effect(100)).toBeLessThanOrEqual(2);
    expect(effect(0)).toBeGreaterThanOrEqual(-2);
  });

  it("is lower for a player left out most of the season and for a foreigner still adapting", () => {
    const player = squadOf(leagueDay, host)[0];
    if (!player) throw new Error("empty squad");
    const at = (condition: Partial<SimPlayer["condition"]>) =>
      moraleStrength({ ...player, condition: { ...player.condition, ...condition } }, 50, 2700, leagueDay.date);
    expect(at({ seasonMinutes: 2700 })).toBe(0);
    expect(at({ seasonMinutes: 180 })).toBeLessThan(0);
    expect(at({ seasonMinutes: 2700, arrivedOn: leagueDay.date })).toBeLessThan(0);
  });
});

describe("fan mood", () => {
  it("drops further after losing a derby than after losing to anyone else", () => {
    const rivals = rivalsOf(leagueDay.clubs);
    expect([...(rivals.get("flamengo-rj") ?? [])]).toContain("vasco-rj");
    // Derbies are real pairs now, so the visitor is swapped for a real rival of a host, or for a club the
    // host has no derby with and the same fanbase; neither plays elsewhere that day.
    const today = leagueDay.fixtures.filter((f) => f.date === leagueDay.date);
    const busy = new Set(today.flatMap((f) => [f.homeId, f.awayId]));
    const derby = today
      .map((fixture) => ({ fixture, rival: [...(rivals.get(fixture.homeId) ?? [])].find((id) => !busy.has(id)) }))
      .find(({ fixture, rival }) => rival && leagueDay.clubs[fixture.homeId]?.division === "A");
    const rival = derby?.rival && leagueDay.clubs[derby.rival];
    if (!derby || !rival) throw new Error("no Série A host with a rival free that day");
    const home = derby.fixture.homeId;
    const stranger = Object.values(leagueDay.clubs).find((club) => !busy.has(club.id) && club.id !== home && !rivals.get(home)?.has(club.id));
    if (!stranger) throw new Error("no club free that day without a derby with the host");
    const asDerby = (isRival: boolean) => {
      const clubs = { ...leagueDay.clubs, [stranger.id]: { ...stranger, fanbase: rival.fanbase } };
      const fixtures = leagueDay.fixtures.map((f) => (f.id === derby.fixture.id ? { ...f, awayId: isRival ? rival.id : stranger.id } : f));
      return clubMood(advanceDay(withStrength({ ...leagueDay, clubs, fixtures }, home, 1), {}).state, home).fans;
    };
    expect(asDerby(true)).toBeLessThan(asDerby(false));
  });

  it("drops further after losing a bigger derby: Palmeiras' fans take the Derby Paulista harder than the Clássico da Saudade", () => {
    const lostAtHomeTo = (rival: string) => {
      const fixture = { id: "derby", competitionId: "x", stage: 0, date: leagueDay.date, homeId: "palmeiras-sp", awayId: rival, result: { homeGoals: 0, awayGoals: 1 } };
      return clubMood(reactToDay(leagueDay, [fixture], [], () => 0.99).state, "palmeiras-sp").fans;
    };
    expect(lostAtHomeTo("corinthians-sp")).toBeLessThan(lostAtHomeTo("santos-sp"));
  });

  describe("a rival's result elsewhere", () => {
    const stranger = Object.keys(leagueDay.clubs).find((id) => !rivalsOf(leagueDay.clubs).has(id));
    if (!stranger) throw new Error("no club without a derby");
    const lostElsewhere = (clubId: string) => ({ id: `${clubId}-elsewhere`, competitionId: "x", stage: 0, date: leagueDay.date, homeId: clubId, awayId: stranger, result: { homeGoals: 0, awayGoals: 1 } });
    const fansAfter = (clubId: string, losers: readonly string[]) => clubMood(reactToDay(withMood(leagueDay, clubId, { fans: 50 }), losers.map(lostElsewhere), [], () => 0.99).state, clubId).fans;

    it("lifts Flamengo's fans when Fluminense, Vasco and Botafogo all lose no more than Fluminense losing alone", () => {
      const alone = fansAfter("flamengo-rj", ["fluminense-rj"]);
      expect(alone).toBeGreaterThan(50);
      expect(fansAfter("flamengo-rj", ["fluminense-rj", "vasco-rj", "botafogo-rj"])).toBeCloseTo(alone, 6);
    });

    it("moves the fans less than their own team's win would", () => {
      const own = { id: "own", competitionId: "x", stage: 0, date: leagueDay.date, homeId: "flamengo-rj", awayId: stranger, result: { homeGoals: 1, awayGoals: 0 } };
      const won = clubMood(reactToDay(withMood(leagueDay, "flamengo-rj", { fans: 50 }), [own], [], () => 0.99).state, "flamengo-rj").fans;
      expect(fansAfter("flamengo-rj", ["fluminense-rj", "vasco-rj", "botafogo-rj"]) - 50).toBeLessThan((won - 50) / 4);
    });

    it("leaves the fans as they were when it is a small local derby's rival (intensity 1)", () => {
      expect(rivalryOf("bahia-ba", "galicia-ba")?.intensity).toBe(1);
      expect(fansAfter("bahia-ba", ["galicia-ba"])).toBe(50);
    });
  });

  it("sours at the monthly closing when tickets cost far more than the division's average", () => {
    const monthEnd = advanceTo(leagueDay, "2026-04-30");
    const priced = (factor: number): number => {
      const finance = monthEnd.finances[host];
      if (!finance) throw new Error(`no finances for ${host}`);
      const finances = { ...monthEnd.finances, [host]: { ...finance, ticketPrice: finance.ticketPrice * factor } };
      return clubMood(advanceTo(withMood({ ...monthEnd, finances }, host, { fans: 50 }), "2026-05-01"), host).fans;
    };
    expect(priced(3)).toBeLessThan(priced(1));
  });

  it("drops when the club sells its idol, much more than when it sells a reserve", () => {
    const squad = squadOf(leagueDay, host).sort((a, b) => b.strength - a.strength);
    const idol = squad[0];
    const reserve = squad.at(-1);
    if (!idol || !reserve) throw new Error("empty squad");
    const idolSold = clubMood(reactToIdolSale(leagueDay, idol.id), host).fans;
    const reserveSold = clubMood(reactToIdolSale(leagueDay, reserve.id), host).fans;
    expect(idolSold).toBeLessThan(reserveSold);
    expect(reserveSold).toBe(clubMood(leagueDay, host).fans);
  });
});
