import { describe, expect, test } from "vitest";
import { withAssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { releaseClauseOf } from "@boleiro/engine/sim/transfers/releaseClause";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { contractsEnding, renewalSheet, signingTerms } from "./contracts.js";
import { compareText } from "@boleiro/engine/sim/compareText";

const COACH = "bahia-ba";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const squad = Object.values(game.players)
  .filter((p) => p.clubId === COACH)
  .sort((a, b) => b.strength - a.strength || compareText(a.id, b.id));
const [star] = squad;
if (!star) throw new Error("Bahia has no players");
const withPlayers = (state: GameState, ...players: SimPlayer[]): GameState => ({ ...state, players: { ...state.players, ...Object.fromEntries(players.map((p) => [p.id, p])) } });
const rich = (state: GameState): GameState => {
  const finance = state.finances[COACH];
  if (!finance) throw new Error("no finances");
  return { ...state, finances: { ...state.finances, [COACH]: { ...finance, wageCap: 1e10 } } };
};

describe("contractsEnding", () => {
  test("lists the coach's players in their last year, soonest first, with what the assistant will do", () => {
    const state = rich(withPlayers({ ...game, date: "2026-02-10" }, { ...star, age: 27, contractUntil: "2026-12-31" }));
    const rows = contractsEnding(state);
    expect(rows.every((row) => row.until < "2027-02-10")).toBe(true);
    expect(rows.map((row) => row.until)).toEqual([...rows.map((row) => row.until)].sort());
    expect(rows.find((row) => row.playerId === star.id)).toMatchObject({ name: star.name, until: "2026-12-31", isPreContractOpen: false, plan: { kind: "renews", on: "2026-03-03", months: 24 } });
  });

  test("says when other clubs may already sign him, and shows no plan when the coach runs contracts himself", () => {
    const state = withPlayers({ ...game, date: "2026-08-01" }, { ...star, contractUntil: "2026-12-31" });
    expect(contractsEnding(state).find((row) => row.playerId === star.id)).toMatchObject({ isPreContractOpen: true });
    const handsOff = { ...state, coach: withAssistantDuty(state.coach, "contracts", false) };
    expect(contractsEnding(handsOff).find((row) => row.playerId === star.id)?.plan).toBeNull();
  });
});

describe("renewalSheet", () => {
  const state = rich(withPlayers({ ...game, date: "2026-10-18" }, { ...star, age: 29, contractUntil: "2027-12-31" }));
  const sheet = renewalSheet(state, star.id);

  test("offers every length with its wage, total, end and how he takes it, the assistant's pick marked", () => {
    expect(sheet?.options.map((o) => [o.months, o.until, o.stance])).toEqual([
      [6, "2028-06-30", "refuses"],
      [12, "2028-12-31", "hard"],
      [24, "2029-12-31", "agrees"],
      [36, "2030-12-31", "wants"],
      [48, "2031-06-30", "agrees"],
      [60, "2031-06-30", "hard"],
    ]);
    const two = sheet?.options.find((o) => o.months === 24);
    expect(two).toMatchObject({ isAssistantPick: true, ageAtEnd: 32, total: (two?.wage ?? 0) * 24 });
    expect(sheet?.options.filter((o) => o.isAssistantPick)).toHaveLength(1);
  });

  test("shows the wage bill and the release clause each length leaves, and when pre-contracts open", () => {
    const two = sheet?.options.find((o) => o.months === 24);
    if (!sheet || !two) throw new Error("no sheet");
    expect(two.billAfter).toBe(sheet.bill - sheet.wage + two.wage);
    expect(two.clauseAfter).toBe(releaseClauseOf({ ...star, age: 29, wage: two.wage }, "A", state.market.eurBrl));
    expect(sheet).toMatchObject({ preferredMonths: 36, until: "2027-12-31", preContractFrom: "2027-07-01" });
  });

  test("is null for a player who is not the coach's", () => {
    const other = Object.values(game.players).find((p) => p.clubId !== COACH);
    expect(renewalSheet(game, other?.id ?? "")).toBeNull();
  });
});

describe("signingTerms", () => {
  test("asks for each length around the wage he wants to join, the dearest the furthest from his wish", () => {
    const target = Object.values(game.players).find((p) => p.clubId === "vitoria-ba" && p.age >= 30);
    if (!target) throw new Error("no veteran at Vitória");
    const terms = signingTerms(game, target.id, 100_000);
    expect(terms.find((t) => t.months === 36)).toMatchObject({ wage: 100_000, stance: "wants" });
    expect(terms.find((t) => t.months === 6)).toMatchObject({ stance: "refuses" });
    expect(terms.find((t) => t.months === 12)?.wage).toBeGreaterThan(100_000);
  });
});
