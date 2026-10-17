import { describe, expect, it } from "vitest";
import { doesAssistantHandle, withAssistantDuty } from "../coach/assistantDuties.js";
import { EMPTY_MEMORY } from "../events/eventMemory.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { assistantPick } from "./contractTerms.js";
import { expireContracts } from "./expireContracts.js";
import { nextAssistantReview } from "./assistantRenewals.js";
import { renewalTermsOf, renewedUntil } from "./renewalTerms.js";
import { runTransferDay } from "./runTransferDay.js";
import type { TransferEvent } from "./transferEvents.js";

const COACH = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: COACH });
const ranked = Object.values(start.players)
  .filter((p) => p.clubId === COACH)
  .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
const [star] = ranked;
const weakest = ranked.at(-1);
if (!star || !weakest) throw new Error("no Flamengo players");

const on = (state: GameState, date: string, ...players: SimPlayer[]): GameState => ({
  ...state,
  date,
  players: { ...state.players, ...Object.fromEntries(players.map((p) => [p.id, p])) },
});
const withFinance = (state: GameState, patch: Partial<ClubFinance>): GameState => {
  const finance = state.finances[COACH];
  if (!finance) throw new Error("no finances for the coach's club");
  return { ...state, finances: { ...state.finances, [COACH]: { ...finance, ...patch } } };
};
const renewalsOf = (events: readonly TransferEvent[]) => events.filter((e) => e.type === "playerContractRenewed");
const skipsOf = (events: readonly TransferEvent[]) => events.filter((e) => e.type === "renewalSkipped");
const ending = { ...star, age: 27, contractUntil: "2026-12-31" };

describe("the assistant's contracts duty", () => {
  it("is on by default and can be switched off and on again per coach", () => {
    expect(doesAssistantHandle(start.coach, "contracts")).toBe(true);
    const off = withAssistantDuty(start.coach, "contracts", false);
    expect(doesAssistantHandle(off, "contracts")).toBe(false);
    expect(withAssistantDuty(off, "contracts", true)).toEqual(start.coach);
  });
});

describe("the assistant's renewals", () => {
  it("renews a key player in his last year on a window's last day, for the length he agrees to nearest two years", () => {
    const state = on(withFinance(start, { wageCap: 1e10 }), "2026-03-03", ending);
    const pick = assistantPick(renewalTermsOf(state, ending).terms);
    if (!pick) throw new Error("he agrees to nothing");
    const { state: after, events } = runTransferDay(state, []);
    expect(renewalsOf(events)).toContainEqual({ type: "playerContractRenewed", playerId: star.id, clubId: COACH, until: renewedUntil(ending, state.date, pick.months), wage: pick.wage, byAssistant: true });
    expect(after.players[star.id]).toMatchObject({ contractUntil: "2028-12-31", wage: pick.wage });
  });

  it("looks again on the season's last day, and leaves contracts alone on other days", () => {
    const rich = withFinance(start, { wageCap: 1e10 });
    expect(renewalsOf(runTransferDay(on(rich, "2026-12-31", ending), []).events).map((e) => e.playerId)).toContain(star.id);
    expect(renewalsOf(runTransferDay(on(rich, "2026-03-02", ending), []).events)).toEqual([]);
  });

  it("does nothing for a coach who took contracts back", () => {
    const state = on(withFinance(start, { wageCap: 1e10 }), "2026-03-03", ending);
    const handsOff = { ...state, coach: withAssistantDuty(state.coach, "contracts", false) };
    expect(renewalsOf(runTransferDay(handsOff, []).events)).toEqual([]);
  });

  it("says so when the player agrees to no length or the wage cap has no room", () => {
    const sour: GameState = {
      ...on(withFinance(start, { wageCap: 1e10 }), "2026-03-03", ending),
      mood: { ...start.mood, [COACH]: { squad: 10, fans: 50, supporters: "calm", closedDoorGames: 0 } },
      eventMemory: { ...EMPTY_MEMORY, log: [{ typeId: "player-wants-out", date: "2026-02-01", clubId: COACH, playerId: star.id }] },
    };
    expect(skipsOf(runTransferDay(sour, []).events)).toContainEqual({ type: "renewalSkipped", playerId: star.id, clubId: COACH, until: "2026-12-31", reason: "playerUnwilling" });
    const capped = on(withFinance(start, { wageCap: 0 }), "2026-03-03", { ...ending, wage: 1 });
    expect(skipsOf(runTransferDay(capped, []).events)).toContainEqual({ type: "renewalSkipped", playerId: star.id, clubId: COACH, until: "2026-12-31", reason: "wageCap" });
  });

  it("lets a player outside the plans go, saying so at the last look before his contract ends", () => {
    const veteran = { ...weakest, age: 35, contractUntil: "2026-12-31" };
    expect(skipsOf(runTransferDay(on(start, "2026-09-11", veteran), []).events).filter((e) => e.playerId === veteran.id)).toEqual([]);
    expect(skipsOf(runTransferDay(on(start, "2026-12-31", veteran), []).events)).toContainEqual({ type: "renewalSkipped", playerId: veteran.id, clubId: COACH, until: "2026-12-31", reason: "notInPlans" });
  });

  it("works for each hot-seat coach with his own switch", () => {
    const SECOND = "palmeiras-sp";
    const twoCoaches = loadNewGame(12, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } });
    const [theirs] = Object.values(twoCoaches.players)
      .filter((p) => p.clubId === SECOND)
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
    const [ours] = Object.values(twoCoaches.players)
      .filter((p) => p.clubId === COACH)
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
    if (!theirs || !ours) throw new Error("no players");
    const finances = Object.fromEntries(Object.entries(twoCoaches.finances).map(([id, f]) => [id, { ...f, wageCap: 1e10 }]));
    const state = on({ ...twoCoaches, finances, coach: withAssistantDuty(twoCoaches.coach, "contracts", false) }, "2026-03-03", { ...ours, age: 27, contractUntil: "2026-12-31" }, { ...theirs, age: 27, contractUntil: "2026-12-31" });
    const renewed = renewalsOf(runTransferDay(state, []).events).map((e) => e.playerId);
    expect(renewed).toContain(theirs.id);
    expect(renewed).not.toContain(ours.id);
  });
});

describe("nextAssistantReview", () => {
  it("is the next window's last day or the season's last day, after today", () => {
    expect(nextAssistantReview(start, "2026-01-10")).toBe("2026-03-03");
    expect(nextAssistantReview(start, "2026-03-03")).toBe("2026-09-11");
    expect(nextAssistantReview(start, "2026-09-12")).toBe("2026-12-31");
    expect(nextAssistantReview({ ...start, hasMidSeasonWindow: false }, "2026-03-04")).toBe("2026-12-31");
    expect(nextAssistantReview(start, "2026-12-31")).toBe("2027-03-03");
  });
});

describe("AI clubs' renewals", () => {
  const lastDay = { ...start, date: "2026-12-31" };

  it("renew on the season's last day the key players whose contract ends then, for the length nearest two years they agree to, at their ask", () => {
    const { events, state } = runTransferDay(lastDay, []);
    const renewed = renewalsOf(events).filter((e) => e.clubId !== COACH);
    expect(renewed.length).toBeGreaterThan(100);
    for (const event of renewed.slice(0, 50)) {
      const before = lastDay.players[event.playerId];
      if (!before) throw new Error("a renewed player was nowhere");
      const pick = assistantPick(renewalTermsOf(lastDay, before).terms);
      expect(event).toMatchObject({ until: "2028-12-31", wage: pick?.wage });
      expect(event).not.toHaveProperty("byAssistant");
      expect(state.players[event.playerId]?.wage).toBe(pick?.wage);
    }
  });

  it("renew the players they lent out whose contract ends with the loan, judged against their own squad", () => {
    const LENDER = "palmeiras-sp";
    const ending = Object.values(start.players)
      .filter((p) => p.clubId === LENDER && p.age < 30)
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
      .slice(0, 10)
      .map((p) => ({ ...p, contractUntil: "2026-12-31" }));
    const atHome = on(lastDay, lastDay.date, ...ending);
    const borrowers = ending.map((_, i) => (i === 0 ? COACH : "vitoria-ba"));
    const lent: GameState = {
      ...on(lastDay, lastDay.date, ...ending.map((p, i) => ({ ...p, clubId: borrowers[i] ?? COACH }))),
      market: { ...lastDay.market, loans: { ...lastDay.market.loans, ...Object.fromEntries(ending.map((p) => [p.id, { fromClubId: LENDER, until: "2026-12-31", lenderWageShare: 0.5, buyOption: null }])) } },
    };
    const ids = new Set(ending.map((p) => p.id));
    const renewedAtHome = renewalsOf(runTransferDay(atHome, []).events).filter((e) => ids.has(e.playerId));
    const talked = runTransferDay(lent, []);
    expect(renewedAtHome.length).toBeGreaterThan(5);
    expect(renewalsOf(talked.events).filter((e) => ids.has(e.playerId))).toEqual(renewedAtHome);
    const back = runTransferDay({ ...talked.state, date: "2027-01-01" }, []).state;
    for (const event of renewedAtHome) expect(back.players[event.playerId]).toMatchObject({ clubId: LENDER, contractUntil: event.until });
  });

  it("let the others go when the year turns, without talking again", () => {
    const talked = runTransferDay(lastDay, []).state;
    const { events } = expireContracts({ ...talked, date: "2027-01-01" }, () => 0);
    expect(renewalsOf(events)).toEqual([]);
    expect(events.filter((e) => e.type === "playerMoved" && e.kind === "released").length).toBeGreaterThan(0);
  });

  it("talk over a contract ending mid-season when it ends, on a stream of their own whatever the market's draws", () => {
    const midSeason = Object.values(start.players)
      .filter((p) => p.clubId !== COACH)
      .map((p) => ({ ...p, contractUntil: "2026-06-30" }));
    const july = { ...start, date: "2026-07-01", players: { ...start.players, ...Object.fromEntries(midSeason.map((p) => [p.id, p])) } };
    const ids = (random: () => number) => renewalsOf(expireContracts(july, random).events).map((e) => e.playerId);
    expect(ids(() => 0).length).toBeGreaterThan(100);
    expect(ids(() => 0.99)).toEqual(ids(() => 0));
  });
});
