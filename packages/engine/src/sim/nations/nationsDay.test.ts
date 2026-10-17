import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { beforeAll, describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { isInjured } from "../players/isInjured.js";
import { CALL_UP_PLACES, CALL_UP_SIZE, OUTSIDER_MARK, nationalSide } from "./callUps.js";
import { firstRoundPairs, onDutyOn } from "./nationsDay.js";

const football = loadNationalFootball();
const start = loadNewGame(5, { coachClubId: "flamengo-rj", nationalFootball: football });

/** The game played day by day to the start of `date`, with every day's events. */
function playTo(state: GameState, date: string, events: DayEvent[] = []): GameState {
  let game = state;
  while (game.date < date) {
    const day = advanceDay(game, {});
    events.push(...day.events.map((e) => ({ ...e, on: game.date })));
    game = day.state;
  }
  return game;
}

describe("national football over 2026", () => {
  const events: (DayEvent & { on?: string })[] = [];
  let march: GameState;
  let afterMarch: GameState;
  let afterWorldCup: GameState;
  let september: GameState;
  beforeAll(() => {
    march = playTo(start, "2026-03-23", events);
    afterMarch = playTo(march, "2026-04-01", events);
    afterWorldCup = playTo(afterMarch, "2026-07-21", events);
    september = playTo(afterWorldCup, "2026-09-22", events);
  }, 180_000);

  it("gives a team a different friendly opponent on each day of a four-match window", () => {
    const friendlies = (september.nations?.matches ?? []).filter((m) => m.round === "friendly" && m.date >= "2026-09-21" && m.date <= "2026-10-06");
    expect(friendlies.length).toBeGreaterThan(20);
    const opponents = new Map<string, string[]>();
    for (const m of friendlies) {
      opponents.set(m.homeId, [...(opponents.get(m.homeId) ?? []), m.awayId]);
      opponents.set(m.awayId, [...(opponents.get(m.awayId) ?? []), m.homeId]);
    }
    const rematches = [...opponents].filter(([, met]) => new Set(met).size < met.length).map(([team]) => team);
    expect(rematches).toEqual([]);
  });

  it("opens the 2026 World Cup with its real twelve groups and the Nations League's League A", () => {
    const worldCup = start.nations?.competitions["world-cup-2026"];
    expect(Object.keys(worldCup?.groups ?? {})).toHaveLength(12);
    expect(worldCup?.groups.C).toEqual(expect.arrayContaining(["brazil", "morocco", "haiti", "scotland"]));
    expect(Object.keys(start.nations?.competitions["nations-league-2026"]?.groups ?? {})).toHaveLength(4);
    expect(start.nations?.teams.brazil?.points).toBe(1807);
  });

  it("calls up at most 26 players a team on the eve of the March window, three goalkeepers among them", () => {
    const brazil = march.nations?.callUps.brazil;
    expect(brazil?.from).toBe("2026-03-23");
    expect(brazil?.until).toBe("2026-03-31");
    const size = (brazil?.playerIds.length ?? 0) + (brazil?.outsiders.length ?? 0);
    expect(size).toBeLessThanOrEqual(CALL_UP_SIZE);
    const keepers = (brazil?.playerIds ?? []).filter((id) => march.players[id]?.group === "GK").length + (brazil?.outsiders ?? []).filter((row) => march.nations?.outsiders.brazil?.roles[row] === "g").length;
    expect(keepers).toBe(CALL_UP_PLACES.goleiro);
    expect(brazil?.outsiders.length).toBeGreaterThan(0);
    expect(brazil?.playerIds.length).toBeGreaterThan(0);
  });

  it("keeps a called-up player out of his club's matches in the window and gives him back the day after it", () => {
    const away = onDutyOn(march, "2026-03-25");
    const playedIn = (game: GameState, fixtureId: string) => {
      const sheet = startMatchDay(game, {}).rest.sheets[fixtureId];
      return [...(sheet?.home ?? []), ...(sheet?.away ?? [])].map((p) => p.id);
    };
    let game = march;
    let missed = 0;
    while (game.date <= "2026-03-31") {
      for (const fixture of game.fixtures.filter((f) => f.date === game.date)) {
        const free = { ...game, nations: game.nations && { ...game.nations, duty: {} } };
        const wouldPlay = playedIn(free, fixture.id).filter((id) => away.has(id));
        if (!wouldPlay.length) continue;
        expect(playedIn(game, fixture.id).filter((id) => away.has(id))).toEqual([]);
        missed += wouldPlay.length;
      }
      game = advanceDay(game, {}).state;
    }
    expect(missed).toBeGreaterThan(0);
    expect(onDutyOn(afterMarch, "2026-04-01").size).toBe(0);
    expect(events.filter((e) => e.type === "backFromDuty" && e.on === "2026-03-31").length).toBeGreaterThan(0);
  });

  it("refuses a coach's eleven with a player away with his national team", () => {
    const away = onDutyOn(march, march.date);
    const fixture = march.fixtures.find((f) => f.date >= march.date && f.date <= "2026-03-31" && [...away].some((id) => [f.homeId, f.awayId].includes(march.players[id]?.clubId ?? "")));
    expect(fixture).toBeDefined();
    let game = march;
    while (fixture && game.date < fixture.date) game = advanceDay(game, {}).state;
    const calledUp = [...away].find((id) => [fixture?.homeId, fixture?.awayId].includes(game.players[id]?.clubId)) ?? "";
    const clubId = game.players[calledUp]?.clubId ?? "";
    const fit = Object.values(game.players).filter((p) => p.clubId === clubId && !away.has(p.id) && !isInjured(p, game.date));
    const keeper = fit.find((p) => p.group === "GK")?.id ?? "";
    const others = fit.filter((p) => p.group !== "GK").slice(0, 9).map((p) => p.id);
    expect(() => advanceDay({ ...game, coachClubId: clubId }, { lineup: [keeper, ...others, calledUp] })).toThrow(/national team/);
  });

  it("plays the window's matches result-only and moves the FIFA points", () => {
    const played = afterMarch.nations?.matches.filter((m) => m.date >= "2026-03-23" && m.date <= "2026-03-31") ?? [];
    expect(played.length).toBeGreaterThan(40);
    expect(played.every((m) => m.result)).toBe(true);
    const moved = Object.values(afterMarch.nations?.teams ?? {}).filter((t) => t.points !== start.nations?.teams[t.id]?.points);
    expect(moved.length).toBeGreaterThan(40);
  });

  it("gives the game's players on national duty the club injury model's injuries", () => {
    const clubPlays = (clubId: string, date: string) => afterWorldCup.fixtures.some((f) => f.date === date && (f.homeId === clubId || f.awayId === clubId));
    const onDutyInjuries = events.filter((e) => e.type === "playerInjured" && e.on !== undefined && (afterWorldCup.nations?.matches.some((m) => m.date === e.on) ?? false) && !clubPlays(e.clubId, e.on));
    expect(onDutyInjuries.length).toBeGreaterThan(0);
  });

  it("leaves a hurt player out of his national team's eleven", () => {
    const brazil = march.nations?.callUps.brazil;
    const fielded = march.nations ? nationalSide(march.nations, "brazil", march.players, "2026-03-27").fielded : [];
    const star = fielded[0];
    expect(star).toBeDefined();
    if (!star || !march.nations || !brazil) return;
    const hurt = { ...march.players, [star.id]: { ...star, condition: { ...star.condition, injuredUntil: "2026-08-30" } } };
    const side = nationalSide(march.nations, "brazil", hurt, "2026-03-27");
    expect(side.fielded.map((p) => p.id)).not.toContain(star.id);
    expect(side.team.players).toHaveLength(11);
  });

  it("plays the World Cup on its real days to a champion on 19 July and sends the knocked-out home before it", () => {
    const worldCup = afterWorldCup.nations?.competitions["world-cup-2026"];
    expect(worldCup?.winnerId).toBeTruthy();
    expect(afterWorldCup.nations?.matches.find((m) => m.competitionId === "world-cup-2026" && m.round === "final")?.date).toBe("2026-07-19");
    expect(events.some((e) => e.type === "nationalTitle" && e.on === "2026-07-19")).toBe(true);
    const backEarly = events.filter((e) => e.type === "backFromDuty" && (e.on ?? "") > "2026-06-11" && (e.on ?? "") < "2026-07-19");
    expect(backEarly.length).toBeGreaterThan(0);
    expect(afterWorldCup.nations?.titles.map((t) => t.competitionId)).toContain("world-cup-2026");
  });

  it("names a pool player the game keeps no squad place for by his row among the team's outsiders", () => {
    expect(OUTSIDER_MARK).toBe("~");
    const brazil = start.nations?.outsiders.brazil;
    expect(brazil?.names.length).toBe(brazil?.strengths.length);
    expect(brazil?.roles.length).toBe(brazil?.names.length);
  });
});

describe("national football and the rest of the game", () => {
  it("leaves the clubs' matches and the main random stream as they were until the first window", () => {
    const without = loadNewGame(5, { coachClubId: "flamengo-rj" });
    const before = playTo(without, "2026-03-20");
    const withNations = playTo(start, "2026-03-20");
    expect(withNations.rngState).toBe(before.rngState);
    expect(withNations.fixtures.filter((f) => f.result).map((f) => f.result)).toEqual(before.fixtures.filter((f) => f.result).map((f) => f.result));
  }, 60_000);
});

describe("a knockout's first round", () => {
  const groupOf = (id: string) => id.charAt(0);

  it("meets the best seeds against the worst and keeps two teams of the same group apart", () => {
    const winners = ["A1", "B1", "C1", "D1"];
    const pairs = firstRoundPairs([...winners, "B2", "C2", "D2", "A2"], groupOf);
    expect(pairs).toHaveLength(4);
    expect(pairs.filter(([home, away]) => groupOf(home) === groupOf(away))).toEqual([]);
    expect(pairs.map(([home]) => home)).toEqual(expect.arrayContaining(winners));
    expect(pairs.flat().sort()).toEqual(["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"]);
  });

  it("leaves a draw with no clash as the seeding gives it", () => {
    expect(firstRoundPairs(["A1", "B1", "C1", "D1", "B2", "A2", "D2", "C2"], groupOf)).toEqual([["A1", "C2"], ["D1", "B2"], ["B1", "D2"], ["C1", "A2"]]);
  });
});
