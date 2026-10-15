import { loadPack } from "@boleiro/data/dataPack";
import { describe, expect, it } from "vitest";
import { fittingFormation, inFormation, SECONDARY_POSITION } from "../../engine/formations.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { saveGame } from "../saveGame.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { formationOf, usualStartersOf } from "./usualLineups.js";
import { withPackPositions } from "./withPackPositions.js";

const pack = loadPack();
const start = loadNewGame(5, { coachClubId: "flamengo-rj" });
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const context = { date: "2026-01-20", pitch: "natural" as const };
const real = new Map(pack.lineups.map((lineup) => [lineup.clubId, lineup]));
const withoutLineup = Object.keys(start.clubs).find((clubId) => !real.has(clubId)) ?? "";

describe("a new game", () => {
  it("gives every player from the data his positions, main first", () => {
    const paqueta = Object.values(start.players).find((p) => p.name === "Lucas Paquetá" && p.clubId === "flamengo-rj");
    expect(paqueta?.positions?.[0]).toBe("meia");
    expect(paqueta?.positions).toContain("atacante");
  });

  it("starts every club with the data's last real match in its formation and eleven, else the formation its squad fits best", () => {
    const flamengo = real.get("flamengo-rj");
    expect(start.usualLineups?.["flamengo-rj"]?.formation).toBe(flamengo?.formation);
    const starters = start.usualLineups?.["flamengo-rj"]?.starters.map((id) => start.players[id]?.name);
    expect(starters).toEqual(flamengo?.starters.flatMap((row) => (row === null ? [] : [pack.players[row]?.name])));
    expect(start.usualLineups?.[withoutLineup]).toEqual({ formation: fittingFormation(squadOf(start, withoutLineup)), starters: [] });
  });

  it("puts the coach in his club's real formation", () => {
    expect(start.coach.tactics.formation).toBe(real.get("flamengo-rj")?.formation);
  });
});

describe("an AI club's eleven", () => {
  it("keeps nearly all of its real eleven while those players are fit", () => {
    for (const clubId of ["palmeiras-sp", "flamengo-rj", "corinthians-sp", "bahia-ba"]) {
      const squad = squadOf(start, clubId);
      const usual = usualStartersOf(start, clubId);
      const formation = formationOf(start, clubId, squad);
      const kept = (eleven: readonly SimPlayer[]) => eleven.filter((p) => usual.has(p.id)).length;
      expect(usual.size, clubId).toBe(11);
      expect(kept(pickMatchLineup(squad, context, formation, usual)), clubId).toBeGreaterThanOrEqual(9);
    }
  });

  it("plays everyone in one of his positions when the squad has a player for every slot", () => {
    for (const clubId of ["palmeiras-sp", "flamengo-rj", "corinthians-sp"]) {
      const squad = squadOf(start, clubId);
      const formation = formationOf(start, clubId, squad);
      const placed = inFormation(pickMatchLineup(squad, context, formation, new Set()), formation);
      expect(placed.every((p) => p.fit >= SECONDARY_POSITION), clubId).toBe(true);
    }
  });
});

describe("a save from before positions", () => {
  const strip = (state: GameState): GameState => {
    const old: GameState = { ...state, players: {} };
    delete old.usualLineups;
    for (const [id, player] of Object.entries(state.players)) {
      const withoutPositions = { ...player };
      delete withoutPositions.positions;
      old.players[id] = withoutPositions;
    }
    return old;
  };

  it("gets each data player's positions and every club's usual lineup from the pack, as a new game has them", () => {
    const migrated = withPackPositions(strip(start), pack);
    expect(migrated.usualLineups).toEqual(start.usualLineups);
    expect(Object.values(migrated.players).map((p) => p.positions)).toEqual(Object.values(start.players).map((p) => p.positions));
  });

  it("leaves a player alone whose id no longer names the pack's row", () => {
    const old = strip(start);
    const renamed = { ...old, players: { ...old.players, p0: { ...(old.players.p0 as SimPlayer), name: "Someone Else" } } };
    expect(withPackPositions(renamed, pack).players.p0?.positions).toBeUndefined();
  });

  it("leaves a game that has its usual lineups exactly as it is", () => {
    expect(saveGame(withPackPositions(start, pack))).toBe(saveGame(start));
  });
});
