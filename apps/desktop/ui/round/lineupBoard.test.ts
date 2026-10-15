import type { Role } from "@boleiro/data/players";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { describe, expect, it } from "vitest";
import { benchHints, placedStrength, placeStarters, teamStrength } from "./lineupBoard.js";

const GROUP: Record<Role, PositionGroup> = { goleiro: "GK", lateral: "DEF", zagueiro: "DEF", meia: "MID", atacante: "ATT" };
const player = (name: string, strength: number, ...positions: Role[]): SquadPlayer => ({
  id: name, name, group: GROUP[positions[0] ?? "meia"], positions, strength, fatigue: 0, status: null,
});

const keeper = player("Rossi", 79, "goleiro");
const back = [player("Ayrton Lucas", 75, "lateral"), player("Léo Ortiz", 80, "zagueiro"), player("Léo Pereira", 80, "zagueiro"), player("Varela", 73, "lateral")];
const middle = [player("Jorginho", 77, "meia"), player("Evertton", 76, "meia"), player("Paquetá", 80, "meia"), player("Saúl", 70, "meia")];
const front = [player("Pedro", 76, "atacante"), player("Plata", 76, "atacante", "meia")];
const fourFourTwo = [keeper, ...back, ...middle, ...front];

describe("the lineup board", () => {
  it("puts every starter of an eleven that fits the formation in one of his positions at his whole strength", () => {
    const placed = placeStarters(fourFourTwo, "4-4-2");
    expect(placed).toHaveLength(11);
    expect(placed.every((starter) => starter.cost === null)).toBe(true);
    expect(placed[0]?.player.name).toBe("Rossi");
  });

  it("marks a player in another of his positions with the small cost, and one out of them all with the big one", () => {
    const placed = placeStarters(fourFourTwo, "4-5-1");
    const plata = placed.find((starter) => starter.player.name === "Plata");
    expect(plata?.cost).toEqual({ kind: "secondary", text: "2ª posição, meia −3%" });

    const midfielderAtTheBack = [keeper, back[0], back[1], back[3], ...middle, ...front].flatMap((p) => (p ? [p] : []));
    const pulgar = placeStarters([...midfielderAtTheBack.slice(0, 4), player("Pulgar", 76, "meia"), ...midfielderAtTheBack.slice(4)], "4-4-2");
    const improvised = pulgar.find((starter) => starter.slot.role === "zagueiro" && starter.cost);
    expect(improvised?.cost).toEqual({ kind: "improvised", text: "Improvisado na zaga −15%" });
    expect(improvised && placedStrength(improvised)).toBe(Math.round((improvised?.player.strength ?? 0) * 0.85));
  });

  it("averages the eleven's strength where they stand, lower with someone improvised", () => {
    const inPlace = teamStrength(placeStarters(fourFourTwo, "4-4-2"));
    expect(inPlace).toBeCloseTo(fourFourTwo.reduce((sum, p) => sum + p.strength, 0) / 11, 1);
    const withMidfielderBack = [keeper, back[0], back[1], back[3], ...middle, ...front, player("Pulgar", 80, "meia")].flatMap((p) => (p ? [p] : [])).slice(0, 11);
    expect(teamStrength(placeStarters(withMidfielderBack, "4-4-2"))).toBeLessThan(inPlace);
  });

  it("points the coach to a bench player whose main position a starter is improvised in", () => {
    const eleven = [keeper, back[0], back[1], back[3], player("Pulgar", 76, "meia"), ...middle, ...front.slice(0, 1)].flatMap((p) => (p ? [p] : []));
    const placed = placeStarters(eleven, "4-4-2");
    const improvised = placed.filter((s) => s.cost?.kind === "improvised").map((s) => s.slot.role);
    expect(improvised).toEqual(["zagueiro"]);
    const bench = [player("João Souza", 66, "zagueiro"), player("Vitão", 76, "zagueiro"), player("Bruno Henrique", 69, "atacante")];
    expect(benchHints(bench, placed)).toEqual(new Map([["Vitão", "Zagueiro de origem"]]));
  });
});
