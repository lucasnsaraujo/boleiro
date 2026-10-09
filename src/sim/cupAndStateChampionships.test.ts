import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "./advanceDay.js";
import { COPA_DO_BRASIL } from "./copaDoBrasil.js";
import { COPA_STATE_PLACES } from "./copaDoBrasilEntrants.js";
import type { Competition, CupCompetition, Fixture, GameState, StateCompetition } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { standings } from "./standings.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
import { aggregate, tieResults } from "./tieResults.js";

function playUntil(state: GameState, date: string): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, {});
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const start = loadNewGame(5, { coachClubId: null });
const season = playUntil(start, "2026-12-31");
const ended = season.state;
const next = playUntil(ended, "2027-01-01").state;

const fixturesOf = (state: GameState, competition: Competition) => state.fixtures.filter((f) => f.competitionId === competition.id);
const cupOf = (state: GameState): CupCompetition => {
  const cup = Object.values(state.competitions).find((c) => c.kind === "cup");
  if (cup?.kind !== "cup") throw new Error("no Copa do Brasil");
  return cup;
};
const statesOf = (state: GameState): StateCompetition[] =>
  Object.values(state.competitions).flatMap((c) => (c.kind === "state" ? [c] : []));

/** Every knockout tie has all its legs played and goes to the aggregate winner, or to penalties only when level. */
function expectTiesDecidedCorrectly(state: GameState, competition: Competition) {
  const fixtures = fixturesOf(state, competition);
  competition.stages.forEach((stage, index) => {
    if (stage.kind !== "knockout") return;
    const stageFixtures = fixtures.filter((f) => f.stage === index);
    const results = tieResults(stage, stageFixtures);
    stage.ties.forEach(([a, b], tie) => {
      const legs = stageFixtures.filter((f) => f.tie === tie);
      expect(legs).toHaveLength(stage.dates.length);
      expect(legs.every((f) => f.result)).toBe(true);
      const shootouts = legs.filter((f) => f.result?.penaltyWinnerId);
      const [goalsA, goalsB] = [aggregate(a, legs), aggregate(b, legs)];
      if (goalsA === goalsB) {
        expect(shootouts.map((f) => f.date)).toEqual([stage.dates.at(-1)]);
        expect(results[tie]?.winnerId).toBe(shootouts[0]?.result?.penaltyWinnerId);
      } else {
        expect(shootouts).toEqual([]);
        expect(results[tie]?.winnerId).toBe(goalsA > goalsB ? a : b);
      }
    });
    const following = competition.stages[index + 1];
    if (following?.kind === "knockout") {
      expect(following.ties.flat()).toEqual(expect.arrayContaining(results.map((r) => r.winnerId)));
    }
  });
}

describe("the Copa do Brasil", () => {
  const cup = cupOf(ended);

  it("has 126 clubs: 28 in phase 1, 74 in phase 2, 4 in phase 3 and Série A's 20 in phase 5", () => {
    expect(cup.entries.map((ids) => ids.length)).toEqual([28, 74, 4, 0, 20]);
    expect(new Set(cup.entries.flat()).size).toBe(126);
    expect(cup.entries[4]?.every((id) => ended.clubs[id]?.division === "A")).toBe(true);
    expect(cup.entries.slice(0, 4).flat().some((id) => ended.clubs[id]?.division === "A")).toBe(false);
  });

  it("plays phases 1–4 and the final as one match and phase 5 to the semi-finals over two legs", () => {
    expect(cup.stages.map((stage) => stage.dates.length)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 1]);
    expect(cup.stages.map((stage) => (stage.kind === "knockout" ? stage.ties.length : 0))).toEqual([14, 44, 24, 12, 16, 8, 4, 2, 1]);
  });

  it("resolves the whole bracket, deciding level ties on penalties and never on away goals", () => {
    expectTiesDecidedCorrectly(ended, cup);
  });

  it("plays its matches with the cup's own engine params, so some lower-division clubs knock out Série A clubs", () => {
    const phase5 = cup.stages[4];
    const results = phase5?.kind === "knockout" ? tieResults(phase5, fixturesOf(ended, cup).filter((f) => f.stage === 4)) : [];
    expect(results.some((r) => ended.clubs[r.loserId]?.division === "A")).toBe(true);
  });

  it("credits each club its prize once per stage played, plus the final's prizes", () => {
    const prizes = season.events.flatMap((e) => (e.type === "prizePaid" ? [e] : []));
    const { stagePrizes, champion, runnerUp } = ended.economy.copaDoBrasil;
    const stagesPlayed = new Map<string, number>();
    cup.stages.forEach((stage, index) => {
      if (stage.kind !== "knockout" || index >= stagePrizes.length) return;
      for (const id of stage.ties.flat()) stagesPlayed.set(id, (stagesPlayed.get(id) ?? 0) + 1);
    });
    const finalists = cup.stages[8]?.kind === "knockout" ? cup.stages[8].ties.flat() : [];
    for (const [clubId, stages] of stagesPlayed) {
      expect(prizes.filter((p) => p.clubId === clubId), clubId).toHaveLength(stages + (finalists.includes(clubId) ? 1 : 0));
    }
    const finalPrizes = prizes.filter((p) => p.amount === champion || p.amount === runnerUp).map((p) => p.amount).sort();
    expect(finalPrizes).toEqual([runnerUp, champion].sort());
    const booked = Object.values(ended.finances).reduce((sum, f) => sum + f.season.revenue.prizes + f.month.revenue.prizes, 0);
    expect(booked).toBe(prizes.reduce((sum, p) => sum + p.amount, 0));
  });
});

describe("other income across a season change", () => {
  it("swaps last season's expected Copa prizes for this season's, so a club that misses the cup gets that income back", () => {
    const stayedStateOnly = Object.keys(ended.finances).filter((id) => ended.clubs[id]?.division === null && next.clubs[id]?.division === null);
    const changedCupStatus = stayedStateOnly.filter((id) => (ended.finances[id]?.expectedPrizes ?? 0) !== (next.finances[id]?.expectedPrizes ?? 0));
    expect(changedCupStatus.length).toBeGreaterThan(0);
    const checked = changedCupStatus.filter((id) => (next.finances[id]?.otherIncome ?? 0) > 0);
    expect(checked.length).toBeGreaterThan(0);
    for (const id of checked) {
      const before = ended.finances[id];
      const after = next.finances[id];
      expect((after?.otherIncome ?? 0) + (after?.prizesOutOfOtherIncome ?? 0), id).toBeCloseTo((before?.otherIncome ?? 0) + (before?.prizesOutOfOtherIncome ?? 0), -1);
    }
  });

  it("gives back only the prize money it took out, so a club whose other income ran out gains less than its expected prizes by missing the cup", () => {
    const floored = Object.keys(ended.finances).filter((id) => {
      const before = ended.finances[id];
      return ended.clubs[id]?.division === null && next.clubs[id]?.division === null && before?.otherIncome === 0 && before.expectedPrizes > 0
        && next.finances[id]?.expectedPrizes === 0;
    });
    expect(floored.length).toBeGreaterThan(0);
    for (const id of floored) expect(next.finances[id]?.otherIncome, id).toBeLessThan(ended.finances[id]?.expectedPrizes ?? 0);
  });
});

describe("continental prize money", () => {
  const serieA = Object.values(ended.competitions).find((c) => c.kind === "league" && c.division === "A");
  if (!serieA) throw new Error("no Série A");
  const table = standings(serieA.clubIds, fixturesOf(ended, serieA), serieA.drawOrder).map((row) => row.clubId);
  const cup = cupOf(ended);
  const final = COPA_DO_BRASIL.finalists(cup, fixturesOf(ended, cup));
  const finalists = new Set(final ? [final.championId, final.runnerUpId] : []);
  const paid = (id: string) => next.finances[id]?.month.revenue.prizes ?? 0;

  it("pays the Libertadores and Sul-Americana qualifiers at the season turn, Libertadores more", () => {
    const paidClubs = Object.keys(next.finances).filter((id) => paid(id) > 0);
    expect(paidClubs).toHaveLength(13);
    for (const id of finalists) expect(paidClubs, id).toContain(id);
    const leagueOnly = table.filter((id) => !finalists.has(id));
    expect(paid(leagueOnly[0] ?? "")).toBeGreaterThan(paid(leagueOnly[7] ?? ""));
    expect(paid(leagueOnly[7] ?? "")).toBeGreaterThan(0);
    expect(paid(leagueOnly.at(-1) ?? "")).toBe(0);
  });

  it("counts the money in the board's expected prizes, out of other income, so it is not counted twice", () => {
    const top = table.find((id) => !finalists.has(id)) ?? "";
    expect(next.finances[top]?.expectedPrizes ?? 0).toBeGreaterThanOrEqual(paid(top));
  });
});

describe("ticket money the board expects", () => {
  it("covers the whole season's home games, later stages included, within a tenth of the gate taken", () => {
    for (const division of ["A", "C", "D"] as const) {
      const ids = Object.keys(start.clubs).filter((id) => start.clubs[id]?.division === division);
      const expected = ids.reduce((sum, id) => sum + (start.finances[id]?.expectedTickets ?? 0), 0);
      const taken = ids.reduce((sum, id) => sum + (ended.finances[id]?.season.revenue.tickets ?? 0) + (ended.finances[id]?.month.revenue.tickets ?? 0), 0);
      expect(expected / taken, division).toBeGreaterThan(0.9);
      expect(expected / taken, division).toBeLessThan(1.1);
    }
  });
});

describe("the state championships", () => {
  const championships = statesOf(ended);

  it("puts every club in its own state's championship exactly once", () => {
    expect(championships).toHaveLength(27);
    const members = championships.flatMap((c) => c.clubIds);
    expect(members.sort()).toEqual(Object.keys(ended.clubs).sort());
    expect(championships.every((c) => c.clubIds.every((id) => ended.clubs[id]?.state === c.state))).toBe(true);
  });

  it("plays groups, then a knockout down to one champion, inside the reserved dates", () => {
    for (const championship of championships) {
      const [groups, ...knockout] = championship.stages;
      expect(groups?.kind).toBe("groups");
      expect(knockout.map((stage) => stage.kind === "knockout" && stage.ties.length).at(-1)).toBe(1);
      const dates = new Set(fixturesOf(ended, championship).map((f) => f.date));
      expect([...dates].every((date) => ended.calendar.stateChampionshipDates.includes(date))).toBe(true);
      expectTiesDecidedCorrectly(ended, championship);
    }
  });

  it("ranks the champion first and every club once in the final placings", () => {
    for (const championship of championships) {
      const fixtures = fixturesOf(ended, championship);
      const final = championship.stages.at(-1);
      const placings = STATE_CHAMPIONSHIP.placings(championship, fixtures);
      expect(final?.kind === "knockout" && tieResults(final, fixtures.filter((f) => f.stage === championship.stages.length - 1))[0]?.winnerId).toBe(placings[0]);
      expect([...placings].sort()).toEqual([...championship.clubIds].sort());
    }
  });
});

describe("qualification for next season", () => {
  const placingsOf = (state: StateCompetition["state"]) => {
    const championship = statesOf(ended).find((c) => c.state === state);
    return championship ? STATE_CHAMPIONSHIP.placings(championship, fixturesOf(ended, championship)) : [];
  };

  it("fills Série D's free places only with clubs from the top of their estadual among those without a national division", () => {
    const serieD = Object.values(ended.competitions).find((c) => c.kind === "league" && c.division === "D");
    const lastThirtyTwo = serieD?.stages[2];
    const survivors = new Set(lastThirtyTwo?.kind === "knockout" ? lastThirtyTwo.ties.flat() : []);
    const staysInD = (id: string) => ended.clubs[id]?.division === "D" && survivors.has(id);
    const newcomers = Object.values(next.clubs).filter((c) => c.division === "D" && !staysInD(c.id) && ended.clubs[c.id]?.division !== "C");
    expect(newcomers.length).toBeGreaterThan(50);
    for (const club of newcomers) {
      const eligible = placingsOf(club.state).filter((id) => next.clubs[id]?.division === null || newcomers.some((n) => n.id === id));
      const qualifiedHere = newcomers.filter((n) => n.state === club.state).map((n) => n.id);
      expect(eligible.slice(0, qualifiedHere.length).sort(), club.state).toEqual(qualifiedHere.sort());
    }
    expect(Object.values(next.clubs).filter((c) => c.division === "D")).toHaveLength(96);
  });

  it("gives each state's Copa do Brasil places to its best-placed clubs outside Série A, and phase 3 to the Série C and D champions", () => {
    const cup = cupOf(next);
    const phase3 = cup.entries[2] ?? [];
    const outcome = (division: string) =>
      Object.values(ended.competitions).find((c) => c.kind === "league" && c.division === division);
    const champions = [outcome("C"), outcome("D")].map((league) => {
      if (league?.kind !== "league") return "";
      const final = league.stages.at(-1);
      return final?.kind === "knockout" ? tieResults(final, fixturesOf(ended, league).filter((f) => f.stage === league.stages.length - 1))[0]?.winnerId : "";
    });
    expect(phase3).toEqual(expect.arrayContaining(champions));
    const viaStates = new Set([...(cup.entries[0] ?? []), ...(cup.entries[1] ?? [])]);
    for (const state of ["SP", "RJ", "BA", "AC"] as const) {
      const expected = placingsOf(state).filter((id) => next.clubs[id]?.division !== "A" && !phase3.includes(id)).slice(0, COPA_STATE_PLACES[state]);
      expect(expected.every((id) => viaStates.has(id)), state).toBe(true);
    }
  });
});

describe("the calendar with every competition", () => {
  it("never has a club play twice on one day, this season or next", () => {
    for (const fixtures of [ended.fixtures, next.fixtures]) {
      const keys = fixtures.flatMap((f: Fixture) => [`${f.date}:${f.homeId}`, `${f.date}:${f.awayId}`]);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
