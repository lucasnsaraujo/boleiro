import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
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

  it("goes when fired, and the club's own level-1 assistant is back", () => {
    const hired = hireAssistant(withCash(start, { wageCap: 1e12 }), candidateAt(start, 3).id).state;
    expect(assistantOf(fireAssistant(hired)).level).toBe(1);
    expect(fireAssistant(hired).coach).toEqual(start.coach);
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
