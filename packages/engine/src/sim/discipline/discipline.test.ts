import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { Competition, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { realCardsPerGame } from "./cardRates.js";
import { cardsPerGame } from "./cardsPerGame.js";
import type { PlayerDiscipline } from "./discipline.js";
import { openDisciplineDay } from "./recordCards.js";
import { yellowPhase } from "./yellowPhase.js";

const start = loadNewGame(5, { coachClubId: "flamengo-rj" });
const firstDate = start.calendar.leagueDates.A[0] ?? "";

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const matchDay = advanceTo(start, firstDate);
const serieA = Object.values(matchDay.competitions).find((c) => c.kind === "league" && c.division === "A");
if (!serieA) throw new Error("no Série A");
const flamengoGame = matchDay.fixtures.find((f) => f.date === firstDate && f.competitionId === serieA.id && [f.homeId, f.awayId].includes("flamengo-rj"));
if (!flamengoGame) throw new Error("Flamengo does not play Série A on the first league date");
const stateChampionship = Object.values(matchDay.competitions).find((c) => c.kind === "state" && c.clubIds.includes("flamengo-rj"));
if (!stateChampionship) throw new Error("no Carioca");

type Of<T extends DayEvent["type"]> = Extract<DayEvent, { type: T }>;
const eventsOf = <T extends DayEvent["type"]>(events: DayEvent[], type: T): Of<T>[] =>
  events.filter((e): e is Of<T> => e.type === type);

const withRecords = (state: GameState, competitionId: string, records: Record<string, PlayerDiscipline>): GameState => ({
  ...state,
  discipline: { ...state.discipline, [competitionId]: { ...state.discipline[competitionId], ...records } },
});

const runs = Array.from({ length: 30 }, (_, seed) => advanceDay({ ...matchDay, rngState: seed }, {}));
const flamengoStarters = (state: GameState) =>
  Object.values(state.players).filter((p) => p.clubId === "flamengo-rj" && p.condition.seasonMinutes > (matchDay.players[p.id]?.condition.seasonMinutes ?? 0));

describe("cards", () => {
  it("come at the real Série A rate of yellows and reds per game", () => {
    const fixtures = runs.flatMap(({ state }) => state.fixtures.filter((f) => f.date === firstDate));
    const simulated = cardsPerGame(fixtures, matchDay.competitions).A;
    const real = realCardsPerGame("A");
    if (!simulated) throw new Error("no Série A games");
    expect(simulated.games).toBeGreaterThan(200);
    expect(Math.abs(simulated.yellows - real.yellows)).toBeLessThan(0.35);
    expect(Math.abs(simulated.reds - real.reds)).toBeLessThan(0.1);
  });

  it("match the booking and sending-off events", () => {
    const { state, events } = runs[0] ?? advanceDay(matchDay, {});
    const today = state.fixtures.filter((f) => f.date === firstDate);
    const yellows = today.reduce((sum, f) => sum + (f.result?.cards?.home.yellows ?? 0) + (f.result?.cards?.away.yellows ?? 0), 0);
    const reds = today.reduce((sum, f) => sum + (f.result?.cards?.home.reds ?? 0) + (f.result?.cards?.away.reds ?? 0), 0);
    expect(eventsOf(events, "playerBooked")).toHaveLength(yellows);
    expect(eventsOf(events, "playerSentOff")).toHaveLength(reds);
  });

  it("go about twice as often to aggressive players", () => {
    const aggressive = (p: SimPlayer) => Number(p.id.slice(1)) % 2 === 0;
    const mixed: GameState = {
      ...matchDay,
      players: Object.fromEntries(Object.entries(matchDay.players).map(([id, p]) => [id, { ...p, trait: aggressive(p) ? "aggressive" : null }])),
    };
    let rough = 0;
    let calm = 0;
    for (let seed = 0; seed < 30; seed++) {
      for (const booked of eventsOf(advanceDay({ ...mixed, rngState: seed }, {}).events, "playerBooked")) {
        const player = mixed.players[booked.playerId];
        if (player && aggressive(player)) rough++;
        else calm++;
      }
    }
    expect(rough / calm).toBeGreaterThan(1.6);
    expect(rough / calm).toBeLessThan(2.5);
  });
});

describe("suspensions", () => {
  it("follow a third yellow in the same competition, and the count starts again", () => {
    const onTwo = Object.fromEntries(Object.keys(matchDay.players).map((id) => [id, { yellows: 2, phase: 0, bans: 0 }]));
    const { state, events } = advanceDay(withRecords(matchDay, serieA.id, onTwo), {});
    const sentOff = new Set(eventsOf(events, "playerSentOff").map((e) => e.playerId));
    const booked = eventsOf(events, "playerBooked").filter((e) => e.competitionId === serieA.id && !sentOff.has(e.playerId));
    expect(booked.length).toBeGreaterThan(0);
    for (const { playerId } of booked) {
      expect(events).toContainEqual(expect.objectContaining({ type: "playerSuspended", playerId, competitionId: serieA.id, matches: 1 }));
      expect(state.discipline[serieA.id]?.[playerId]).toMatchObject({ yellows: 0, bans: 1 });
    }
  });

  it("follow a red card for at least one match", () => {
    const sentOff = runs.flatMap(({ events }) => eventsOf(events, "playerSentOff").map((e) => ({ e, events })));
    expect(sentOff.length).toBeGreaterThan(20);
    for (const { e, events } of sentOff) {
      const suspended = eventsOf(events, "playerSuspended").find((s) => s.playerId === e.playerId);
      expect(suspended?.competitionId).toBe(e.competitionId);
      expect(suspended?.matches).toBeGreaterThanOrEqual(1);
    }
  });

  const [starter] = flamengoStarters(runs[0]?.state ?? matchDay);
  if (!starter) throw new Error("no Flamengo starter");

  it("keep the player out of his club's next match in that competition only", () => {
    const banned = withRecords(matchDay, serieA.id, { [starter.id]: { yellows: 0, phase: 0, bans: 1 } });
    const after = advanceDay({ ...banned, rngState: 0 }, {}).state;
    expect(flamengoStarters(after).map((p) => p.id)).not.toContain(starter.id);
    expect(after.discipline[serieA.id]?.[starter.id]?.bans).toBe(0);

    const bannedElsewhere = withRecords(matchDay, stateChampionship.id, { [starter.id]: { yellows: 0, phase: 0, bans: 1 } });
    const played = advanceDay({ ...bannedElsewhere, rngState: 0 }, {}).state;
    expect(flamengoStarters(played).map((p) => p.id)).toContain(starter.id);
    expect(played.discipline[stateChampionship.id]?.[starter.id]?.bans).toBe(1);
  });

  it("stop the coach from fielding a suspended player", () => {
    const lineup = flamengoStarters(runs[0]?.state ?? matchDay).map((p) => p.id);
    const banned = withRecords(matchDay, serieA.id, { [starter.id]: { yellows: 0, phase: 0, bans: 1 } });
    expect(() => advanceDay(banned, { lineup })).toThrow(/suspended/);
    expect(() => advanceDay(matchDay, { lineup })).not.toThrow();
  });
});

describe("yellow cards", () => {
  const cup = Object.values(matchDay.competitions).find((c): c is Extract<Competition, { kind: "cup" }> => c.kind === "cup");
  if (!cup) throw new Error("no Copa do Brasil");

  it("carry through a whole league", () => {
    expect(yellowPhase(serieA, 0)).toBe(yellowPhase(serieA, 5));
  });

  it("start again when the Série A clubs join the Copa do Brasil", () => {
    const serieAJoins = cup.entries.findLastIndex((entries) => entries.length > 0);
    expect(yellowPhase(cup, serieAJoins - 1)).toBeLessThan(yellowPhase(cup, serieAJoins));
    expect(yellowPhase(cup, serieAJoins)).toBe(yellowPhase(cup, serieAJoins + 2));
  });

  it("start again at an estadual's knockout stage", () => {
    const [groups] = stateChampionship.stages;
    if (groups?.kind !== "groups") throw new Error("the estadual does not open with groups");
    const withKnockout = { ...stateChampionship, stages: [groups, { kind: "knockout" as const, ties: [], dates: [] }] };
    expect(yellowPhase(withKnockout, 0)).toBeLessThan(yellowPhase(withKnockout, 1));
  });
});

describe("a day of card records", () => {
  const [playerId] = Object.values(matchDay.players).filter((p) => p.clubId === flamengoGame.homeId || p.clubId === flamengoGame.awayId).map((p) => p.id);
  if (!playerId) throw new Error("nobody plays the Flamengo game");
  const clubOf = (id: string) => matchDay.players[id]?.clubId;
  const sendOff = (day: ReturnType<typeof openDisciplineDay>) =>
    day.record(serieA, flamengoGame, [{ playerId, clubId: clubOf(playerId) ?? "", card: "secondYellow", minute: 80 }], clubOf, () => 0);

  it("bans a player sent off from the next day on and leaves the day before as it was", () => {
    const today = openDisciplineDay(matchDay.discipline);
    expect(today.suspended(serieA.id).has(playerId)).toBe(false);
    sendOff(today);
    expect(openDisciplineDay(today.discipline()).suspended(serieA.id).has(playerId)).toBe(true);
    expect(openDisciplineDay(matchDay.discipline).suspended(serieA.id).has(playerId)).toBe(false);
  });

  it("ends a ban once its match is served", () => {
    const banned = openDisciplineDay(matchDay.discipline);
    sendOff(banned);
    const serving = openDisciplineDay(banned.discipline());
    expect(serving.suspended(serieA.id).has(playerId)).toBe(true);
    serving.record(serieA, flamengoGame, [], clubOf, () => 0);
    expect(openDisciplineDay(serving.discipline()).suspended(serieA.id).has(playerId)).toBe(false);
  });
});
