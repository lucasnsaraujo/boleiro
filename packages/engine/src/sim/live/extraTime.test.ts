import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { Competition, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { drawInjury } from "../players/matchInjuryChance.js";
import { injuryStreamOf } from "../players/recordMatchLoad.js";
import { loadGame, saveGame } from "../saveGame.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { finishMatchDay } from "./finishMatchDay.js";
import type { LiveMatch } from "./liveDay.js";
import { playerStatsAt } from "./matchPlay.js";
import { EXTRA_HALF_TIME, EXTRA_TIME_END, FULL_TIME, type MatchEvent } from "./matchTimeline.js";
import { startMatchDay } from "./startMatchDay.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(2, { coachClubId: COACH_CLUB });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const matchDay = advanceTo(start, start.fixtures.find((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB)?.date ?? "");

/**
 * Today's matches made one-leg knockout ties of a Sul-Americana stage: its final, which plays extra
 * time, or (`isFinal` false) its first stage, which goes straight to penalties.
 */
function asKnockoutDay(state: GameState, isFinal: boolean): GameState {
  const today = state.fixtures.filter((f) => f.date === state.date);
  const ties = today.map((f): [string, string] => [f.homeId, f.awayId]);
  const competition: Competition = {
    id: "ko",
    kind: "continental",
    cup: "sul-americana",
    season: state.season,
    clubIds: ties.flat(),
    entries: [],
    countries: {},
    drawOrder: ties.flat(),
    stages: [{ kind: "knockout", ties, dates: [state.date] }],
    stageDates: isFinal ? [[state.date]] : [[state.date], ["2099-01-01"]],
  };
  const asTie = new Map(today.map((f, tie): [string, Fixture] => [f.id, { ...f, competitionId: "ko", stage: 0, tie }]));
  return { ...state, competitions: { ...state.competitions, ko: competition }, fixtures: state.fixtures.map((f) => asTie.get(f.id) ?? f) };
}

const goalsBy = (match: LiveMatch, minute: number) => {
  const goals = (clubId: string) => match.events.filter((e) => e.type === "goal" && e.clubId === clubId && e.minute <= minute).length;
  return { home: goals(match.homeId), away: goals(match.awayId) };
};
const isLevelAt = (match: LiveMatch, minute: number) => {
  const { home, away } = goalsBy(match, minute);
  return home === away;
};
const isShootout = (e: MatchEvent) => e.type === "shootoutKick" || e.type === "orderOverruled";
const untilFullTime = (events: readonly MatchEvent[]) => events.slice(0, events.findIndex((e) => e.type === "fullTime") + 1);

const extraTimeDay = asKnockoutDay(matchDay, true);
// Enough saves' seeds for a straight red card in extra time to turn up.
const SEEDS = 40;
const penaltiesDay = asKnockoutDay(matchDay, false);
const withExtraTime = startMatchDay(extraTimeDay, {});
const straightToPenalties = startMatchDay(penaltiesDay, {});

describe("extra time", () => {
  it("is played in a knockout match level after ninety minutes: two halves of fifteen, then penalties only if still level", () => {
    const level = withExtraTime.matches.filter((m) => isLevelAt(m, FULL_TIME));
    expect(level.length).toBeGreaterThan(0);
    for (const match of level) {
      expect(match.events).toContainEqual({ type: "extraHalfTime", minute: EXTRA_HALF_TIME });
      expect(match.events).toContainEqual({ type: "extraTimeEnd", minute: EXTRA_TIME_END });
      const kicks = match.events.filter((e) => e.type === "shootoutKick");
      expect(kicks.length > 0).toBe(isLevelAt(match, EXTRA_TIME_END));
      for (const kick of kicks) expect(kick.minute).toBe(EXTRA_TIME_END);
    }
    for (const match of withExtraTime.matches.filter((m) => !isLevelAt(m, FULL_TIME))) {
      expect(match.events.some((e) => e.minute > FULL_TIME)).toBe(false);
    }
  });

  it("puts extra time's goals on the result and says it went to extra time", () => {
    const { events } = finishMatchDay(withExtraTime);
    const played = new Map(events.flatMap((e) => (e.type === "matchPlayed" ? [[e.fixture.id, e.fixture] as const] : [])));
    for (const match of withExtraTime.matches) {
      const result = played.get(match.fixtureId)?.result;
      const final = goalsBy(match, EXTRA_TIME_END);
      expect(result).toMatchObject({ homeGoals: final.home, awayGoals: final.away });
      expect(result?.isAfterExtraTime ?? false).toBe(isLevelAt(match, FULL_TIME));
      expect(result?.penaltyWinnerId !== undefined).toBe(isLevelAt(match, EXTRA_TIME_END));
    }
  });

  it("leaves the ninety minutes of every match, every other result and the day's draws as straight-to-penalties plays them", () => {
    expect(withExtraTime.rest.rngState).toBe(straightToPenalties.rest.rngState);
    withExtraTime.matches.forEach((match, i) => {
      const other = straightToPenalties.matches[i];
      if (!other) throw new Error("both days play the same matches");
      expect(untilFullTime(match.events)).toEqual(untilFullTime(other.events.filter((e) => !isShootout(e))));
      if (!isLevelAt(match, FULL_TIME)) expect(match.events).toEqual(other.events);
    });
  });

  it("leaves the day's stream as it was when a straight red card in extra time adds to a ban", () => {
    let straightReds = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const salted = (state: GameState) => ({ ...state, seed });
      const extra = startMatchDay(salted(extraTimeDay), {});
      straightReds += extra.matches.flatMap((m) => m.events).filter((e) => e.type === "card" && e.card === "red" && e.minute > FULL_TIME).length;
      expect(extra.rest.rngState).toBe(startMatchDay(salted(penaltiesDay), {}).rest.rngState);
    }
    expect(straightReds).toBeGreaterThan(0);
  });

  it("draws an injury in extra time from the player's own injury stream, and keeps him out with its kind", () => {
    let injuries = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const day = { ...extraTimeDay, seed };
      const live = startMatchDay(day, {});
      const after = finishMatchDay(live).state;
      for (const match of live.matches) {
        for (const e of match.events) {
          if (e.type !== "injury" || e.minute <= FULL_TIME) continue;
          const player = day.players[e.playerId];
          if (!player) throw new Error("an injured player is in the game");
          const { kind, days } = drawInjury(player, day.date, injuryStreamOf(seed, match.fixtureId)(e.playerId));
          expect(e).toMatchObject({ kind, days });
          expect(after.players[e.playerId]?.condition.injury).toBe(kind);
          injuries++;
        }
      }
    }
    expect(injuries).toBeGreaterThan(0);
  });

  it("counts extra time's minutes in what the players did and in their season's minutes", () => {
    const match = withExtraTime.matches.find((m) => isLevelAt(m, FULL_TIME) && m.fixtureId !== withExtraTime.coachMatch?.fixtureId);
    if (!match?.play) throw new Error("a match goes to extra time");
    const stats = playerStatsAt(match.play, match.events, EXTRA_TIME_END);
    const keeperId = match.play.starters.find((id) => stats[id]?.group === "GK" && stats[id]?.clubId === match.homeId) ?? "";
    expect(stats[keeperId]?.minutes).toBe(EXTRA_TIME_END);
    const next = finishMatchDay(withExtraTime).state;
    expect(next.players[keeperId]?.condition.seasonMinutes).toBe((extraTimeDay.players[keeperId]?.condition.seasonMinutes ?? 0) + EXTRA_TIME_END);
  });
});

// The day's stream salted so the coach's match ends level after ninety minutes (searched once).
const LEVEL_COACH_MATCH_SALT = 12;
const levelDay = startMatchDay({ ...extraTimeDay, rngState: (extraTimeDay.rngState ^ LEVEL_COACH_MATCH_SALT) >>> 0 }, {});
const coachMatchOf = (live: typeof levelDay) => {
  const match = live.matches.find((m) => m.fixtureId === live.coachMatch?.fixtureId);
  if (!match) throw new Error("the coach has a match");
  return match;
};
const isReplayed = (e: MatchEvent) => e.type === "goal" || e.type === "card" || e.type === "injury" || e.type === "substitution" || e.type === "penaltyMiss";

/** Today's matches made second legs of Recopa ties whose first legs the visitors won 1–0 at home. */
function asSecondLegDay(state: GameState): GameState {
  const today = state.fixtures.filter((f) => f.date === state.date);
  const ties = today.map((f): [string, string] => [f.homeId, f.awayId]);
  const firstLeg = "2026-01-02";
  const competition: Competition = {
    id: "recopa-ko",
    kind: "continental",
    cup: "recopa",
    season: state.season,
    clubIds: ties.flat(),
    entries: [],
    countries: {},
    drawOrder: ties.flat(),
    stages: [{ kind: "knockout", ties, dates: [firstLeg, state.date] }],
    stageDates: [[firstLeg, state.date]],
  };
  const firstLegs = today.map((f, tie): Fixture => ({ id: `${f.id}-ida`, competitionId: "recopa-ko", stage: 0, date: firstLeg, homeId: f.awayId, awayId: f.homeId, tie, result: { homeGoals: 1, awayGoals: 0 } }));
  const asTie = new Map(today.map((f, tie): [string, Fixture] => [f.id, { ...f, competitionId: "recopa-ko", stage: 0, tie }]));
  return { ...state, competitions: { ...state.competitions, "recopa-ko": competition }, fixtures: [...firstLegs, ...state.fixtures.map((f) => asTie.get(f.id) ?? f)] };
}

describe("a save with extra time in it", () => {
  it("loads a day that went to extra time exactly, and plays on from it as the original does", () => {
    const after = finishMatchDay(withExtraTime).state;
    expect(after.fixtures.some((f) => f.result?.isAfterExtraTime)).toBe(true);
    const loaded = loadGame(saveGame(after));
    expect(loaded).toStrictEqual(after);
    expect(advanceDay(loaded, {})).toEqual(advanceDay(after, {}));
  });
});

describe("extra time in a two-legged tie", () => {
  it("is played when the aggregate is level after the second leg's ninety minutes, whatever that leg's own score", () => {
    const live = startMatchDay(asSecondLegDay(matchDay), {});
    for (const match of live.matches) {
      const { home, away } = goalsBy(match, FULL_TIME);
      expect(match.events.some((e) => e.type === "extraTimeEnd")).toBe(home - away === 1);
      const after = goalsBy(match, EXTRA_TIME_END);
      expect(match.events.some((e) => e.type === "shootoutKick")).toBe(after.home - after.away === 1);
    }
    expect(live.matches.some((m) => goalsBy(m, FULL_TIME).home - goalsBy(m, FULL_TIME).away === 1)).toBe(true);
  });
});

describe("the coach's match in extra time", () => {
  it("goes to extra time after ninety level minutes, and the coach can change his side during it, keeping everything before", () => {
    const match = coachMatchOf(levelDay);
    expect(isLevelAt(match, FULL_TIME)).toBe(true);
    const changed = coachMatchOf(applyLiveChange(levelDay, 100, { posture: "attacking" }));
    expect(changed.events.filter((e) => e.minute <= 100 && isReplayed(e))).toEqual(match.events.filter((e) => e.minute <= 100 && isReplayed(e)));
    expect(changed.events).toContainEqual({ type: "extraTimeEnd", minute: EXTRA_TIME_END });
  });

  it("lets the coach make a sixth substitution in extra time, never before it", () => {
    const coachId = levelDay.state.coachClubId ?? "";
    const side = coachMatchOf(levelDay).homeId === coachId ? "home" : "away";
    const starters = levelDay.coachMatch?.starters[side].filter((p) => p.group !== "GK") ?? [];
    const bench = levelDay.coachMatch?.bench ?? [];
    const swap = (i: number) => ({ offId: starters[i]?.id ?? "", onId: bench[i]?.id ?? "" });
    expect(() => applyLiveChange(levelDay, 45, { substitutions: [0, 1, 2, 3, 4, 5].map(swap) })).toThrow();
    const five = applyLiveChange(levelDay, FULL_TIME, { substitutions: [0, 1, 2, 3, 4].map(swap) });
    const sixth = coachMatchOf(applyLiveChange(five, 95, { substitutions: [swap(5)] }));
    expect(sixth.events.filter((e) => e.type === "substitution" && e.clubId === coachId)).toHaveLength(6);
  });

  it("plays extra time after a change exactly when the match is level after ninety minutes", () => {
    for (const minute of [30, 60, 85]) {
      for (const posture of ["defensive", "attacking"] as const) {
        const match = coachMatchOf(applyLiveChange(levelDay, minute, { posture }));
        expect(match.events.some((e) => e.type === "extraTimeEnd")).toBe(isLevelAt(match, FULL_TIME));
        expect(match.events.some((e) => e.type === "shootoutKick")).toBe(isLevelAt(match, EXTRA_TIME_END));
      }
    }
  });

  it("records the redrawn extra time on the result", () => {
    const changed = applyLiveChange(levelDay, 100, { posture: "attacking" });
    const match = coachMatchOf(changed);
    const played = finishMatchDay(changed).events.find((e) => e.type === "matchPlayed" && e.fixture.id === match.fixtureId);
    const final = goalsBy(match, EXTRA_TIME_END);
    expect(played?.type === "matchPlayed" && played.fixture.result).toMatchObject({ homeGoals: final.home, awayGoals: final.away, isAfterExtraTime: true });
  });
});
