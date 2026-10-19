import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { lendYoungPlayers } from "./loans.js";
import { openDraft } from "./movePlayer.js";
import { signFreeAgents } from "./signFreeAgents.js";
import { signFromAbroad } from "./signFromAbroad.js";
import { SQUAD_CAP } from "./squadCap.js";
import { tradeBetweenClubs } from "./tradeBetweenClubs.js";
import type { PlayerMoved, PreContractSigned } from "./transferEvents.js";

const start = loadNewGame(5, { coachClubId: null });
const marketDay: GameState = {
  ...start,
  date: "2026-01-10",
  finances: Object.fromEntries(Object.entries(start.finances).map(([id, f]) => [id, { ...f, cash: 1e12, transferBudget: 1e12, wageCap: 1e12, wagesOwed: 0 }])),
};
const SEEDS = [1, 2, 3, 4];

const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

/** The clubs' squads topped up to `size` with copies of their weakest player, who change nobody's eleven. */
function filledTo(state: GameState, clubIds: readonly string[], size: number): GameState {
  const players = { ...state.players };
  for (const clubId of clubIds) {
    const squad = squadOf(state, clubId);
    const weakest = squad.reduce<SimPlayer | null>((low, p) => (low === null || p.strength < low.strength ? p : low), null);
    if (!weakest) throw new Error(`no players at ${clubId}`);
    for (let i = squad.length; i < size; i++) players[`${clubId}-filler-${i}`] = { ...weakest, id: `${clubId}-filler-${i}` };
  }
  return { ...state, players };
}

type Arrival = PlayerMoved | PreContractSigned;
const arrivalsAt = (events: readonly Arrival[], clubIds: readonly string[]) => events.filter((e) => e.toClubId !== null && clubIds.includes(e.toClubId));
const overSeeds = (step: (random: () => number) => readonly Arrival[], clubIds: readonly string[]) =>
  SEEDS.flatMap((seed) => arrivalsAt(step(seededRandom(seed)), clubIds));

/** The most players the club had registered, counting pre-contracts, at any point of the day's moves. */
function peakSize(events: readonly Arrival[], clubId: string, size: number): number {
  let peak = size;
  for (const e of events) {
    if (e.toClubId === clubId) size++;
    else if (e.type === "playerMoved" && e.fromClubId === clubId) size--;
    peak = Math.max(peak, size);
  }
  return peak;
}

describe(`every AI club keeps to the ${SQUAD_CAP}-player cap`, () => {
  const buyer = ["bahia-ba"];

  it("a club at the cap buys from no other club, nor signs a pre-contract, until one of its players leaves", () => {
    const trade = (size: number) => {
      const state = filledTo(marketDay, buyer, size);
      return (random: () => number) => tradeBetweenClubs(openDraft(state), random).events;
    };
    expect(overSeeds(trade(SQUAD_CAP - 1), buyer).length).toBeGreaterThan(0);
    const full = trade(SQUAD_CAP);
    for (const seed of SEEDS) expect(peakSize(full(seededRandom(seed)), "bahia-ba", SQUAD_CAP), `seed ${seed}`).toBe(SQUAD_CAP);
  });

  it("a club at the cap signs nobody from abroad, though one below it does", () => {
    const abroad = (size: number) => {
      const state = filledTo(marketDay, buyer, size);
      return (random: () => number) => {
        let serial = 0;
        return signFromAbroad(openDraft(state), random, () => `abroad-${serial++}`).events;
      };
    };
    expect(overSeeds(abroad(SQUAD_CAP - 1), buyer).length).toBeGreaterThan(0);
    expect(overSeeds(abroad(SQUAD_CAP), buyer)).toEqual([]);
  });

  it("a lower-division club at the cap borrows nobody, though one below it does", () => {
    const borrower = Object.keys(marketDay.finances).sort().filter((id) => marketDay.clubs[id]?.division === "D" && squadOf(marketDay, id).length < 30).slice(0, 1);
    // The only club the Série A and B sides can lend to.
    const finances = Object.fromEntries(Object.entries(marketDay.finances).filter(([id]) => {
      const division = marketDay.clubs[id]?.division;
      return id === borrower[0] || division === "A" || division === "B";
    }));
    const lend = (size: number) => {
      const state = { ...filledTo(marketDay, borrower, size), finances };
      return (random: () => number) => lendYoungPlayers(openDraft(state), random).events;
    };
    expect(overSeeds(lend(SQUAD_CAP - 1), borrower).length).toBeGreaterThan(0);
    expect(overSeeds(lend(SQUAD_CAP), borrower)).toEqual([]);
  });

  it("a club whose squad and the players joining it reach the cap signs no free agent, though it would below the cap", () => {
    const clubId = "humaita-ac";
    const squad = squadOf(marketDay, clubId).slice(0, 15);
    const level = squad.reduce((sum, p) => sum + p.strength, 0) / squad.length;
    const freeAgents = Object.fromEntries(
      (["GK", "DEF", "MID", "ATT"] as const).flatMap((group) =>
        Array.from({ length: 5 }, (_, i): [string, SimPlayer] => {
          const model = squad[0];
          if (!model) throw new Error(`no players at ${clubId}`);
          return [`free-${group}-${i}`, { ...model, id: `free-${group}-${i}`, clubId: "abroad", group, strength: Math.round(level), age: 26 }];
        }),
      ),
    );
    const others = Object.values(marketDay.players).filter((p) => p.clubId !== clubId);
    /** The club down to 15 players, with `joining` players from other clubs due to join it on pre-contracts. */
    const thin = (joining: number): GameState => ({
      ...marketDay,
      players: Object.fromEntries(Object.entries(marketDay.players).filter(([, p]) => p.clubId !== clubId || squad.includes(p))),
      market: { ...marketDay.market, freeAgents, preContracts: Object.fromEntries(others.slice(0, joining).map((p) => [p.id, clubId])) },
    });
    const sign = (joining: number) => {
      const state = thin(joining);
      return (random: () => number) => signFreeAgents(openDraft(state), random).events;
    };
    expect(overSeeds(sign(SQUAD_CAP - squad.length - 1), [clubId]).length).toBeGreaterThan(0);
    expect(overSeeds(sign(SQUAD_CAP - squad.length), [clubId])).toEqual([]);
  });
});
