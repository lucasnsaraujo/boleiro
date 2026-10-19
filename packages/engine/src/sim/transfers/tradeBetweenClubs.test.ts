import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { isWorthKeeping } from "./assistantRenewals.js";
import { marketView } from "./marketView.js";
import { openDraft } from "./movePlayer.js";
import { SQUAD_TARGET } from "./squadNeeds.js";
import { tradeBetweenClubs } from "./tradeBetweenClubs.js";

const start = loadNewGame(8, { coachClubId: null });
const window: GameState = { ...start, date: "2026-01-10" };
const squads = new Map<string, SimPlayer[]>();
for (const p of Object.values(window.players)) squads.set(p.clubId, [...(squads.get(p.clubId) ?? []), p]);
const clubIds = Object.keys(window.clubs).sort();
// Each club's weakest player in every position has agreed to join the next club on the list.
const preContracts = Object.fromEntries(
  [...squads].flatMap(([clubId, squad]) =>
    (["GK", "DEF", "MID", "ATT"] as const).flatMap((group) => {
      const weakest = squad.filter((p) => p.group === group).sort((a, b) => a.strength - b.strength)[0];
      const joining = clubIds[(clubIds.indexOf(clubId) + 1) % clubIds.length] ?? "";
      return weakest ? [[weakest.id, joining]] : [];
    }),
  ),
);
const rich: GameState = {
  ...window,
  finances: Object.fromEntries(Object.entries(window.finances).map(([id, f]) => [id, { ...f, transferBudget: 1e12, wageCap: 1e12 }])),
  market: { ...window.market, preContracts },
};

describe("AI clubs trading", () => {
  it("never release a player who has agreed to join another club, keeping that club's pre-contract", () => {
    const agreed = Object.entries(preContracts);
    const { state, events } = tradeBetweenClubs(openDraft(rich), seededRandom(2));
    expect(events.filter((e) => e.type === "playerMoved" && e.kind === "released").length).toBeGreaterThan(0);
    for (const [playerId, clubId] of agreed) expect(state.market.preContracts[playerId], playerId).toBe(clubId);
  });

  it("sign none of Flamengo's idols for Fluminense, Vasco or Botafogo, who otherwise take some of its expiring players", () => {
    const rivals = ["fluminense-rj", "vasco-rj", "botafogo-rj"];
    const flamengo = squads.get("flamengo-rj") ?? [];
    const expiring: GameState = { ...rich, market: { ...rich.market, preContracts: {} }, players: { ...rich.players, ...Object.fromEntries(flamengo.map((p) => [p.id, { ...p, contractUntil: "2026-02-28" }])) } };
    const idols = Object.fromEntries(flamengo.map((p) => [p.id, { name: p.name, apps: 220, goals: 10 }]));
    const idolised: GameState = { ...expiring, history: { ...expiring.history, players: { ...expiring.history.players, "flamengo-rj": idols } } };
    const signedByRivals = (state: GameState) =>
      Array.from({ length: 6 }, (_, seed) => tradeBetweenClubs(openDraft(state), seededRandom(seed)).events)
        .flat()
        .filter((e) => e.type === "preContractSigned" || e.type === "playerMoved")
        .filter((e) => e.fromClubId === "flamengo-rj" && rivals.includes(e.toClubId ?? "")).length;
    expect(signedByRivals(expiring)).toBeGreaterThan(0);
    expect(signedByRivals(idolised)).toBe(0);
  });

  it("sign pre-contracts only with the expiring players an AI club would not keep", () => {
    const flamengo = squads.get("flamengo-rj") ?? [];
    const players = Object.fromEntries(flamengo.map((p) => [p.id, { ...p, contractUntil: "2026-02-28" }]));
    const expiring: GameState = { ...rich, market: { ...rich.market, preContracts: {} }, players: { ...rich.players, ...players } };
    const signed = Array.from({ length: 6 }, (_, seed) => tradeBetweenClubs(openDraft(expiring), seededRandom(seed)).events)
      .flat()
      .flatMap((e) => (e.type === "preContractSigned" && e.fromClubId === "flamengo-rj" ? [players[e.playerId]] : []));
    expect(signed.length).toBeGreaterThan(0);
    expect(signed.filter((p) => p && isWorthKeeping(p, flamengo, "A")).map((p) => p?.id)).toEqual([]);
  });

  describe("a Série B squad short of players, with veterans it would take on pre-contracts", () => {
    const buyer = clubIds.find((id) => window.clubs[id]?.division === "B") ?? "";
    const [model] = squads.get(buyer) ?? [];
    if (!model) throw new Error(`${buyer} has no players`);
    // A squad of 97s, so the veterans are replacements for it but not upgrades on its weakest starter.
    const squadOf = (size: number) => Array.from({ length: size }, (_, i): SimPlayer => ({ ...model, id: `own-${i}`, group: (["GK", "DEF", "DEF", "MID", "MID", "ATT"] as const)[i % 6] ?? "DEF", age: 25, strength: 97, contractUntil: "2029-12-31" }));
    const veterans = Object.values(window.players)
      .filter((p) => window.clubs[p.clubId]?.division === "C" || window.clubs[p.clubId]?.division === "D")
      .slice(0, 60)
      .map((p) => ({ ...p, age: 34, strength: 95, contractUntil: "2026-02-28" }));
    const withSquad = (size: number, preContracts: Record<string, string> = {}): GameState => {
      const others = Object.values(rich.players).filter((p) => p.clubId !== buyer);
      const players = [...others, ...veterans, ...squadOf(size)];
      return { ...rich, players: Object.fromEntries(players.map((p) => [p.id, p])), market: { ...rich.market, preContracts } };
    };
    type Events = ReturnType<typeof tradeBetweenClubs>["events"];
    const signedBy = (events: Events) => events.filter((e) => (e.type === "preContractSigned" || (e.type === "playerMoved" && e.kind === "transfer")) && e.toClubId === buyer).length;
    const soldBy = (events: Events) => events.filter((e) => e.type === "playerMoved" && e.fromClubId === buyer).length;

    it("fill their one open place once, counting the player who agreed to join on the first market day on the next", () => {
      const state = withSquad(SQUAD_TARGET.B - 1);
      const days = Array.from({ length: 6 }, (_, seed) => {
        const first = tradeBetweenClubs(openDraft(state), seededRandom(seed));
        return [...first.events, ...tradeBetweenClubs(openDraft(first.state), seededRandom(seed + 100)).events];
      });
      expect(days.some((events) => signedBy(events) > 0)).toBe(true);
      expect(days.map((events) => signedBy(events) - soldBy(events)).filter((added) => added > 1)).toEqual([]);
    });

    it("stop for the day once the player who agreed to join fills their open place, upgrades on offer or not", () => {
      const state = withSquad(SQUAD_TARGET.B - 1);
      const upgrades = veterans.slice(0, 20).map((p) => ({ ...p, strength: 99 }));
      const offered: GameState = { ...state, players: { ...state.players, ...Object.fromEntries(upgrades.map((p) => [p.id, p])) } };
      const days = Array.from({ length: 6 }, (_, seed) => tradeBetweenClubs(openDraft(offered), seededRandom(seed)).events);
      expect(days.some((events) => signedBy(events) > 0)).toBe(true);
      expect(days.map((events) => signedBy(events) - soldBy(events)).filter((added) => added > 1)).toEqual([]);
    });

    it("count the wage promised to a player who agreed to join against the board's wage cap", () => {
      const star = veterans[0];
      if (!star) throw new Error("no veterans");
      const joining = withSquad(SQUAD_TARGET.B - 2, { [star.id]: buyer });
      const starJoining: GameState = { ...joining, players: { ...joining.players, [star.id]: { ...star, age: 27, strength: 99 } } };
      const capped = (cap: number): GameState => {
        const finance = starJoining.finances[buyer];
        if (!finance) throw new Error(`no finances for ${buyer}`);
        return { ...starJoining, finances: { ...starJoining.finances, [buyer]: { ...finance, wageCap: cap } } };
      };
      const signings = (state: GameState) => Array.from({ length: 6 }, (_, seed) => signedBy(tradeBetweenClubs(openDraft(state), seededRandom(seed)).events)).reduce((a, b) => a + b, 0);
      expect(signings(capped(1e12))).toBeGreaterThan(0);
      expect(signings(capped(marketView(starJoining).plannedBill(buyer) - 1))).toBe(0);
    });
  });
});
