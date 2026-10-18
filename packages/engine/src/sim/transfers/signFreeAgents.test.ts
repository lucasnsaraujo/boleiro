import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { signFreeAgents } from "./signFreeAgents.js";
import { REPLACEMENT_BAND, squadNeeds } from "./squadNeeds.js";

const start = loadNewGame(6, { coachClubId: null });
const clubId = Object.values(start.clubs).find((c) => c.division === "D")?.id ?? "";
const opening = start.finances[clubId];
if (!opening) throw new Error(`no finances for ${clubId}`);
const kept =Object.values(start.players).filter((p) => p.clubId === clubId).slice(0, 15);
const { level, thinnest } = squadNeeds(kept, "D");
const freeAgents: Record<string, SimPlayer> = Object.fromEntries(
  Array.from({ length: 15 }, (_, i): [string, SimPlayer] => {
    const model = kept[0] ?? Object.values(start.players)[0];
    if (!model) throw new Error("no player");
    return [`free${i}`, { ...model, id: `free${i}`, clubId: "abroad", group: thinnest, strength: Math.round(level), age: 26 }];
  }),
);
/** The club down to 15 players, too few to name a matchday squad, with free agents at its level to choose from. */
const thin = (finance: Partial<ClubFinance>): GameState => ({
  ...start,
  players: Object.fromEntries(Object.entries(start.players).filter(([, p]) => p.clubId !== clubId || kept.includes(p))),
  finances: { ...start.finances, [clubId]: { ...opening, ...finance } },
  market: { ...start.market, freeAgents },
});
const signingsBy = (state: GameState) => signFreeAgents(state, seededRandom(3)).events.filter((e) => e.toClubId === clubId);

describe("AI clubs signing free agents", () => {
  it("fill a squad too thin to name a matchday squad when the money is there", () => {
    expect(signingsBy(thin({ cash: 1e9, wagesOwed: 0 })).length).toBeGreaterThan(0);
  });

  it("sign squad players near the middle of a short squad, not only ones fit for its best eleven", () => {
    // An eleven of 60s and 50s over a bench of 46s: the best eleven sits well above the squad's middle.
    const eleven: Record<string, readonly number[]> = { GK: [60], DEF: [60, 60, 50, 50], MID: [60, 60, 50, 50], ATT: [50, 50] };
    const taken = new Map<string, number>();
    const twenty = Object.values(start.players).filter((p) => p.clubId === clubId).slice(0, 20).map((p) => {
      const rank = taken.get(p.group) ?? 0;
      taken.set(p.group, rank + 1);
      return { ...p, strength: eleven[p.group]?.[rank] ?? 46 };
    });
    const needs = squadNeeds(twenty, "D");
    const middle = twenty.map((p) => p.strength).sort((a, b) => a - b)[twenty.length >> 1] ?? 0;
    const strength = Math.floor(needs.level - REPLACEMENT_BAND.below) - 1;
    if (twenty.length < 20 || strength < middle - REPLACEMENT_BAND.below) throw new Error("no gap between the squad's middle and its best eleven");
    const squadPlayers = Object.fromEntries(Object.entries(freeAgents).map(([id, p]) => [id, { ...p, group: needs.thinnest, strength }]));
    const short: GameState = {
      ...start,
      players: { ...Object.fromEntries(Object.entries(start.players).filter(([, p]) => p.clubId !== clubId)), ...Object.fromEntries(twenty.map((p) => [p.id, p])) },
      finances: { ...start.finances, [clubId]: { ...opening, cash: 1e9, wagesOwed: 0 } },
      market: { ...start.market, freeAgents: squadPlayers },
    };
    expect(signingsBy(short).length).toBeGreaterThan(0);
  });

  it("sign nobody, not even to fill the squad, while they owe wages or can't pay the signing costs", () => {
    expect(signingsBy(thin({ cash: 1e9, wagesOwed: 1 }))).toEqual([]);
    expect(signingsBy(thin({ cash: 0, wagesOwed: 0 }))).toEqual([]);
  });
});
