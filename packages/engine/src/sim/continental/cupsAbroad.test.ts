import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { RAPIDO, REALISTA } from "../formats.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { cupMatches } from "../world/resultOnlyCup.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { knockoutTie, leaguePhaseMatches, playEuropeDay } from "./uefaCups.js";
import { playedKey } from "./cupsAbroad.js";
import { playWorldDay } from "../world/resultOnlyWorld.js";

const ARSENAL = "tm-11";
const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];

const ownFixtures = (state: GameState, competitionId: string) => state.fixtures.filter((f) => f.competitionId === competitionId && (f.homeId === ARSENAL || f.awayId === ARSENAL));

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

/** Every score the result-only cups keep for Arsenal's matches, by `home|away|date`. */
function resultOnlyScores(state: GameState): Map<string, string> {
  const scores = new Map<string, string>();
  const put = (homeId: string, awayId: string, date: string, result: { homeGoals: number; awayGoals: number } | null) => {
    if (result && (homeId === ARSENAL || awayId === ARSENAL)) scores.set(`${homeId}|${awayId}|${date}`, `${result.homeGoals}-${result.awayGoals}`);
  };
  for (const cup of state.europe?.cups ?? []) {
    for (const m of leaguePhaseMatches(cup)) put(m.homeId, m.awayId, m.date, m.result);
    for (const round of cup.knockout) round.ties.forEach((_, i) => knockoutTie(round, i).legs.forEach((leg) => put(leg.homeId, leg.awayId, leg.date, leg.result)));
  }
  const cup = state.world?.["gb-eng"]?.cup;
  for (const m of cup ? cupMatches(cup) : []) put(m.homeId, m.awayId, cup?.dates[m.round] ?? "", m.result);
  return scores;
}

describe("a human club abroad in UEFA's and its country's cups", () => {
  // The season needs the board to keep Arsenal's coach past December.
  const start = loadNewGame(1, { coachClubId: ARSENAL, world, formats: RAPIDO });
  const championsLeague = start.competitions["champions-league-2026"];

  it("plays its Champions League first phase in the full tier, its matches fixtures from the start", () => {
    expect(championsLeague?.kind).toBe("cupAbroad");
    const cup = start.europe?.cups.find((c) => c.cup === "champions-league");
    const phase = cup ? leaguePhaseMatches(cup).filter((m) => m.homeId === ARSENAL || m.awayId === ARSENAL) : [];
    expect(phase).toHaveLength(3);
    const fixtures = ownFixtures(start, "champions-league-2026");
    expect(fixtures.map((f) => `${f.homeId}|${f.awayId}|${f.date}`).sort()).toEqual(phase.map((m) => `${m.homeId}|${m.awayId}|${m.date}`).sort());
  });

  describe("over the season", () => {
    const later = playUntil(start, "2026-12-01");
    const own = [...ownFixtures(later, "champions-league-2026"), ...ownFixtures(later, "gb-eng-cup-2026")].filter((f) => f.result);
    const scores = resultOnlyScores(later);

    it("plays the club's cup matches live, their scores the result-only cups keep", () => {
      expect(own.length).toBeGreaterThanOrEqual(4);
      expect(own).toHaveLength(scores.size);
      for (const f of own) expect(scores.get(`${f.homeId}|${f.awayId}|${f.date}`)).toBe(`${f.result?.homeGoals}-${f.result?.awayGoals}`);
    });

    it("gives its FA Cup ties to the full tier once both clubs are known", () => {
      const cup = later.world?.["gb-eng"]?.cup;
      const arsenalTies = (cup ? cupMatches(cup) : []).filter((m) => m.homeId && m.awayId && (m.homeId === ARSENAL || m.awayId === ARSENAL));
      expect(ownFixtures(later, "gb-eng-cup-2026")).toHaveLength(arsenalTies.length);
    });

    it("keeps each knockout tie's winner as the full tier decided it", () => {
      const cup = later.europe?.cups.find((c) => c.cup === "champions-league");
      for (const round of cup?.knockout ?? []) {
        round.ties.forEach((tie, i) => {
          if (!tie.includes(ARSENAL)) return;
          const decided = knockoutTie(round, i);
          const legs = ownFixtures(later, "champions-league-2026").filter((f) => round.dates.includes(f.date));
          const goals = (id: string) => legs.reduce((sum, f) => sum + (f.homeId === id ? (f.result?.homeGoals ?? 0) : (f.result?.awayGoals ?? 0)), 0);
          const [a, b] = tie;
          const shootout = legs.find((f) => f.result?.penaltyWinnerId)?.result?.penaltyWinnerId;
          if (decided.winnerId) expect(decided.winnerId).toBe(goals(a) > goals(b) ? a : goals(b) > goals(a) ? b : shootout);
        });
      }
    });

    it("saves and loads with its cups abroad", () => {
      expect(loadGame(saveGame(later))).toEqual(later);
    });
  });

  it("brings the cups of a game saved before cups abroad into the full tier on its next day", () => {
    const isAbroad = (id: string) => start.competitions[id]?.kind === "cupAbroad";
    const competitions = Object.fromEntries(Object.entries(start.competitions).filter(([id]) => !isAbroad(id)));
    const old = { ...start, competitions, fixtures: start.fixtures.filter((f) => !isAbroad(f.competitionId)) };
    const next = advanceDay(loadGame(saveGame(old)), {}).state;
    expect(next.competitions["champions-league-2026"]?.kind).toBe("cupAbroad");
    expect(ownFixtures(next, "champions-league-2026")).toEqual(ownFixtures(start, "champions-league-2026"));
  });

  it("leaves a game without a human club abroad as it was", () => {
    const flamengo = loadNewGame(5, { coachClubId: "flamengo-rj", world, formats: REALISTA });
    expect(Object.values(flamengo.competitions).some((c) => c.kind === "cupAbroad")).toBe(false);
  });
});

describe("a human club abroad's cup matches, knockouts included, while its coach runs it", () => {
  type CupMatch = { key: string; isLive: boolean; isScoreKept: boolean; isKnockout: boolean; legs: number; isAfterExtraTime: boolean; isShootout: boolean };
  /**
   * A Rápido season of Arsenal's from `seed`, while a human coach runs it: each of its matches the result-only cups
   * recorded, and whether the full tier played it live that day, with the stage it was in.
   */
  function cupRun(seed: number): CupMatch[] {
    let state = loadNewGame(seed, { coachClubId: ARSENAL, world, formats: RAPIDO });
    const matches: CupMatch[] = [];
    while (state.date < "2027-01-01" && state.coachClubId === ARSENAL) {
      const today = state.date;
      const recorded = new Set(resultOnlyScores(state).keys());
      state = advanceDay(state, {}).state;
      for (const [key, score] of resultOnlyScores(state)) {
        if (recorded.has(key)) continue;
        const fixture = state.fixtures.find((f) => f.result && f.date === today && `${f.homeId}|${f.awayId}|${f.date}` === key);
        const stage = fixture && state.competitions[fixture.competitionId]?.stages[fixture.stage];
        const isKnockout = stage?.kind === "knockout";
        const result = fixture?.result;
        const isScoreKept = result ? score === `${result.homeGoals}-${result.awayGoals}` : false;
        matches.push({ key, isLive: fixture !== undefined, isScoreKept, isKnockout, legs: stage?.dates.length ?? 0, isAfterExtraTime: fixture?.result?.isAfterExtraTime === true, isShootout: fixture?.result?.penaltyWinnerId !== undefined });
      }
    }
    return matches;
  }
  // Seeds whose coach lasts into the Champions League knockouts; on the base realism r2 measured, he was sacked in
  // April with these seeds, so the club's later ties were rightly result-only.
  const runs = [1, 2, 7].map((seed) => ({ seed, run: (() => { let run: CupMatch[] | undefined; return () => (run ??= cupRun(seed)); })() }));

  for (const { seed, run } of runs) {
    it(`plays every one of them live with the full tier's score, the league phase and each knockout leg (seed ${seed})`, () => {
      expect(run().filter((m) => !m.isLive).map((m) => m.key)).toEqual([]);
      expect(run().filter((m) => !m.isScoreKept).map((m) => m.key)).toEqual([]);
      expect(run().some((m) => m.isKnockout)).toBe(true);
    }, 120_000);
  }

  it("among those seeds, plays two-legged ties and settles level ones by extra time and penalties live", () => {
    const knockouts = runs.flatMap(({ run }) => run()).filter((m) => m.isKnockout);
    expect(knockouts.some((m) => m.legs === 2)).toBe(true);
    expect(knockouts.some((m) => m.isAfterExtraTime)).toBe(true);
    expect(knockouts.some((m) => m.isShootout)).toBe(true);
  }, 360_000);
});

describe("a cup abroad decided in a country of the full tier", () => {
  const start = loadNewGame(5, { coachClubId: ARSENAL, world, formats: RAPIDO });
  /** The day the FA Cup's final was played, and the game after it. */
  function finalDay(): { state: GameState; winnerId: string } {
    let state = start;
    for (let day = 0; day < 365; day++) {
      state = advanceDay(state, {}).state;
      const cup = state.world?.["gb-eng"]?.cup;
      const winnerId = cup ? cupMatches(cup).at(-1)?.winnerId : null;
      if (winnerId) return { state, winnerId };
    }
    throw new Error("no FA Cup final in the season");
  }

  it("files its champion as a cup at home does, and the trophy when it is the coach's club", () => {
    const { state, winnerId } = finalDay();
    expect(state.history.current.champions["gb-eng-cup"]).toBe(winnerId);
    expect(state.history.coach.trophies.some((t) => t.competition === "gb-eng-cup")).toBe(winnerId === ARSENAL);
  });
});

describe("a human club's knockout match written back to its result-only cup", () => {
  const start = loadNewGame(5, { coachClubId: ARSENAL, world, formats: RAPIDO });
  /** The game on the first day a Champions League knockout round and an FA Cup round with two known clubs are both still to play. */
  function onDay(isDue: (state: GameState) => boolean): GameState {
    let state = start;
    for (let day = 0; day < 365 && !isDue(state); day++) state = advanceDay(state, {}).state;
    return state;
  }

  it("takes a UEFA tie's score, extra time and shootout winner from the full tier", () => {
    const state = onDay((s) => {
      const round = s.europe?.cups.find((cup) => cup.cup === "champions-league")?.knockout[0];
      return round !== undefined && round.dates.length === 1 && round.dates[0] === s.date;
    });
    const round = state.europe?.cups.find((cup) => cup.cup === "champions-league")?.knockout[0];
    if (!round || !state.europe || !state.world) throw new Error("no knockout round on its day");
    const [first, second] = [knockoutTie(round, 0).legs[0], knockoutTie(round, 1).legs[0]];
    if (!first || !second) throw new Error("no legs");
    const played = new Map([
      [playedKey(first.homeId, first.awayId, state.date), { homeGoals: 1, awayGoals: 1, isAfterExtraTime: true as const, penaltyWinnerId: first.awayId }],
      [playedKey(second.homeId, second.awayId, state.date), { homeGoals: 2, awayGoals: 1, isAfterExtraTime: true as const }],
    ]);
    const europe = playEuropeDay(state.europe, state.world, state.date, RAPIDO, played);
    const after = europe.cups.find((cup) => cup.cup === "champions-league")?.knockout[0];
    if (!after) throw new Error("the round is gone");
    expect(knockoutTie(after, 0)).toMatchObject({ winnerId: first.awayId, onPenalties: true, isAfterExtraTime: true });
    expect(knockoutTie(after, 0).legs[0]?.result).toEqual({ homeGoals: 1, awayGoals: 1 });
    expect(knockoutTie(after, 1)).toMatchObject({ winnerId: second.homeId, onPenalties: false, isAfterExtraTime: true });
  });

  it("takes a national cup match's score, extra time and shootout winner from the full tier", () => {
    const today = (s: GameState) => {
      const cup = s.world?.["gb-eng"]?.cup;
      const round = cup?.dates.indexOf(s.date) ?? -1;
      return cup && round >= 0 ? cupMatches(cup).filter((m) => m.round === round && m.homeId && m.awayId && !m.result) : [];
    };
    const state = onDay((s) => today(s).length >= 2);
    const [first, second] = today(state);
    if (!first || !second || !state.world) throw new Error("no cup round on its day");
    const played = new Map([
      [playedKey(first.homeId, first.awayId, state.date), { homeGoals: 1, awayGoals: 1, isAfterExtraTime: true as const, penaltyWinnerId: first.awayId }],
      [playedKey(second.homeId, second.awayId, state.date), { homeGoals: 3, awayGoals: 2, isAfterExtraTime: true as const }],
    ]);
    const cup = playWorldDay(state.world, state.date, played)["gb-eng"]?.cup;
    const matches = cup ? cupMatches(cup) : [];
    const find = (homeId: string) => matches.find((m) => m.homeId === homeId && m.round === first.round);
    expect(find(first.homeId)).toMatchObject({ winnerId: first.awayId, result: { homeGoals: 1, awayGoals: 1, isAfterExtraTime: true } });
    expect(find(second.homeId)).toMatchObject({ winnerId: second.homeId, result: { homeGoals: 3, awayGoals: 2, isAfterExtraTime: true } });
  });
});
