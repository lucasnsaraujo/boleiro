import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { scoutedStars } from "../youth/academy.js";
import { coachSalary } from "./coachSalary.js";
import { coachCareerDay } from "./coachCareerDay.js";
import {
  assistantCandidates,
  assistantOf,
  assistantReadOf,
  fireAssistant,
  scoutSharpeningAt,
  hireAssistant,
  recordFormerPlayers,
  type Assistant,
  type AssistantLevel,
} from "./assistant.js";

const COACH = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: COACH });
const squad = Object.values(start.players).filter((p) => p.clubId === COACH);
const LEVELS: readonly AssistantLevel[] = [1, 2, 3, 4, 5];

const withCash = (state: GameState, patch: { wageCap?: number; cash?: number }): GameState => {
  const finance = state.finances[COACH];
  if (!finance) throw new Error("no finances for the coach's club");
  return { ...state, finances: { ...state.finances, [COACH]: { ...finance, ...patch } } };
};
const candidateAt = (state: GameState, level: AssistantLevel) => {
  const found = assistantCandidates(state).find((c) => c.level === level && !c.formerPlayer);
  if (!found) throw new Error(`no level-${level} candidate`);
  return found;
};

describe("the coach's assistant", () => {
  it("is the club's own level-1 assistant until the coach hires another, and costs nothing on top of the club's wages", () => {
    const own = assistantOf(start);
    expect(own.level).toBe(1);
    expect(own.wage).toBe(0);
    expect(own.name).not.toBe("");
    expect(assistantOf(start)).toEqual(own);
  });

  it("reads a player's strength off by less the better he is", () => {
    const errors = LEVELS.map((level) => {
      const read = assistantReadOf(start, { id: "same-man", level });
      const total = Object.values(start.players).reduce((sum, p) => sum + Math.abs(read(p.id, p.strength) - p.strength), 0);
      return total / Object.keys(start.players).length;
    });
    for (let i = 1; i < errors.length; i++) expect(errors[i]).toBeLessThan(errors[i - 1] ?? 0);
    expect(errors[4]).toBeLessThan(1);
  });

  it("offers one stranger per level above his own, each dearer than the one below, paid as a share of the head coach's salary", () => {
    const strangers = assistantCandidates(start).filter((c) => !c.formerPlayer);
    expect(strangers.map((c) => c.level)).toEqual([2, 3, 4, 5]);
    for (let i = 1; i < strangers.length; i++) expect(strangers[i]?.wage).toBeGreaterThan(strangers[i - 1]?.wage ?? 0);
    expect(strangers.at(-1)?.wage).toBeLessThan(coachSalary(start, COACH));
  });

  it("hires a better assistant the board can pay, whose wage the club then pays each month with its wages", () => {
    const rich = withCash(start, { wageCap: 1e12 });
    const level4 = candidateAt(rich, 4);
    const hired = hireAssistant(rich, level4.id);
    expect(hired.refusal).toBeNull();
    expect(assistantOf(hired.state)).toMatchObject({ level: 4, name: level4.name, wage: level4.wage, since: rich.date });
    expect(assistantCandidates(hired.state).filter((c) => !c.formerPlayer).map((c) => c.level)).toEqual([5]);

    const payday = (state: GameState) => {
      const paid = coachCareerDay({ ...state, date: "2026-02-01" }, [], undefined, () => 0.99).state;
      return paid.finances[COACH]?.month.costs.wages ?? 0;
    };
    expect(payday(hired.state) - payday(rich)).toBe(level4.wage);
  });

  it("is refused by the board when his wage breaks the wage cap", () => {
    const capped = withCash(start, { wageCap: 0 });
    const hired = hireAssistant(capped, candidateAt(capped, 5).id);
    expect(hired.refusal).toBe("wageCap");
    expect(assistantOf(hired.state).level).toBe(1);
  });

  it("is refused by the board when his whole wage on top of the squad's breaks the wage cap, whoever he replaces", () => {
    const level2 = hireAssistant(withCash(start, { wageCap: 1e12 }), candidateAt(start, 2).id).state;
    const level5 = candidateAt(level2, 5);
    const bill = wageBillsOf(level2).get(COACH) ?? 0;
    expect(hireAssistant(withCash(level2, { wageCap: bill + level5.wage - 1 }), level5.id).refusal).toBe("wageCap");
    expect(hireAssistant(withCash(level2, { wageCap: bill + level5.wage }), level5.id).refusal).toBeNull();
  });

  it("goes when fired, and the club's own level-1 assistant is back", () => {
    const hired = hireAssistant(withCash(start, { wageCap: 1e12 }), candidateAt(start, 3).id).state;
    expect(assistantOf(fireAssistant(hired)).level).toBe(1);
    expect(fireAssistant(hired).coach).toEqual(start.coach);
  });

  it("reads players off evenly, as often too high as too low", () => {
    const read = assistantReadOf(start, { id: "same-man", level: 1 });
    const players = Object.values(start.players);
    const bias = players.reduce((sum, p) => sum + read(p.id, p.strength) - p.strength, 0) / players.length;
    expect(Math.abs(bias)).toBeLessThan(0.25);
  });
});

describe("a former player of the coach as his assistant", () => {
  const [star] = [...squad].sort((a, b) => b.strength - a.strength);
  if (!star) throw new Error("no Flamengo players");
  const retiredStar = { type: "playerRetired" as const, playerId: star.id, clubId: COACH, name: star.name, age: 36 };
  const after = recordFormerPlayers(start, start, [retiredStar]);

  it("is offered once he retires at the coach's club, at a higher level for less than a stranger of that level", () => {
    const former = assistantCandidates(after).find((c) => c.formerPlayer);
    expect(former).toMatchObject({ name: star.name, formerPlayer: { group: star.group } });
    if (!former) return;
    expect(former.level).toBeGreaterThanOrEqual(3);
    expect(former.wage).toBeLessThan(candidateAt(after, former.level).wage);
  });

  it("is not offered for a player who retired at another club", () => {
    const elsewhere = recordFormerPlayers(start, start, [{ ...retiredStar, clubId: "palmeiras-sp" }]);
    expect(assistantCandidates(elsewhere).some((c) => c.formerPlayer)).toBe(false);
  });

  it("can be hired", () => {
    const former = assistantCandidates(after).find((c) => c.formerPlayer);
    if (!former) throw new Error("no former player offered");
    const hired = hireAssistant(withCash(after, { wageCap: 1e12 }), former.id);
    const assistant: Assistant = assistantOf(hired.state);
    expect(assistant).toMatchObject({ name: star.name, level: former.level });
    expect(assistantCandidates(hired.state).some((c) => c.id === former.id)).toBe(false);
  });
});

describe("the assistant's read of the academy", () => {
  const kids = Object.values(start.youth?.prospects ?? {}).filter((p) => p.joinedSeason === start.season);

  it("narrows the scouts' first look at the kids the better he is, never past their true stars", () => {
    const spread = (level: AssistantLevel) => kids.reduce((sum, kid) => {
      const { low, high } = scoutedStars(kid, start.season, scoutSharpeningAt(level));
      return sum + high - low;
    }, 0);
    const spreads = LEVELS.map(spread);
    for (let i = 1; i < spreads.length; i++) expect(spreads[i]).toBeLessThanOrEqual(spreads[i - 1] ?? 0);
    expect(spreads[0]).toBe(spread(1));
    expect(spreads[4]).toBe(0);
    expect(spreads[4]).toBeLessThan(spreads[0] ?? 0);
  });
});

describe("the hired assistant when the coach takes another job", () => {
  const serieC = Object.values(start.clubs).find((club) => club.division === "C" && start.finances[club.id]);
  if (!serieC) throw new Error("no Série C club");
  const withBoardCap = (state: GameState, wageCap: number): GameState => {
    const finance = state.finances[serieC.id];
    if (!finance) throw new Error("no finances for the new club");
    return { ...state, finances: { ...state.finances, [serieC.id]: { ...finance, wageCap } } };
  };
  const offered = (state: GameState): GameState => ({ ...state, coach: { ...state.coach, offers: [{ clubId: serieC.id, salary: 20_000, untilSeason: 2027, expiresOn: "2026-12-31" }] } });
  const hired = hireAssistant(withCash(start, { wageCap: 1e12 }), candidateAt(start, 5).id).state;
  const moved = (state: GameState) => coachCareerDay(offered(state), [], serieC.id, () => 0.99);
  // What a level-5 stranger asks at the new club, for a coach who just arrived there.
  const askedThere = candidateAt({ ...start, coachClubId: serieC.id }, 5).wage;

  it("follows him for the wage the new club pays a man of his level, when its board can pay it", () => {
    const { state, events } = moved(withBoardCap(hired, 1e12));
    expect(assistantOf(state)).toMatchObject({ level: 5, wage: askedThere });
    expect(askedThere).toBeLessThan(assistantOf(hired).wage);
    expect(events.some((event) => event.type === "assistantLeft")).toBe(false);
  });

  it("stays behind when the new club's board can't pay him, and the coach hears of it", () => {
    const { state, events } = moved(withBoardCap(hired, 0));
    expect(state.coachClubId).toBe(serieC.id);
    expect(assistantOf(state).level).toBe(1);
    expect(events).toContainEqual({ type: "assistantLeft", clubId: serieC.id, name: assistantOf(hired).name });
  });
});
