import { describe, expect, it } from "vitest";
import type { Role } from "@boleiro/data/players";
import { arrange, FORMATION_NAMES, FORMATIONS, fittingFormation, inFormation, positionFit, SECONDARY_POSITION, type Formation } from "./formations.js";
import { KEEPER_SWAP, OUT_OF_POSITION, type Player, type PositionGroup } from "./match.js";

const eleven = (shape: Record<PositionGroup, number>): Player[] =>
  (Object.entries(shape) as [PositionGroup, number][]).flatMap(([group, count]) =>
    Array.from({ length: count }, (_, i) => ({ name: `${group}${i}`, group, strength: 60 + i })),
  );

describe("inFormation", () => {
  it("puts every player of an eleven that fits the formation in his own position", () => {
    const players = inFormation(eleven({ GK: 1, DEF: 4, MID: 3, ATT: 3 }), "4-3-3");
    expect(players.every((p) => p.slot === p.group)).toBe(true);
  });

  it("moves the weakest spare players into the slots their group cannot fill", () => {
    const players = inFormation(eleven({ GK: 1, DEF: 4, MID: 4, ATT: 2 }), "4-3-3");
    const moved = players.filter((p) => p.slot !== p.group);
    expect(moved).toEqual([expect.objectContaining({ name: "MID0", slot: "ATT" })]);
  });
});

describe("formations", () => {
  const roles = (formation: Formation) => FORMATIONS[formation].map((slot) => slot.role);

  it("line up a back four as two full-backs around two centre-backs, wingers behind a lone striker, and a back three's wide midfielders as wing-backs", () => {
    expect(roles("4-2-3-1")).toEqual(["goleiro", "lateral", "zagueiro", "zagueiro", "lateral", "meia", "meia", "atacante", "meia", "atacante", "atacante"]);
    expect(roles("4-5-1")).toEqual(["goleiro", "lateral", "zagueiro", "zagueiro", "lateral", "meia", "meia", "meia", "meia", "meia", "atacante"]);
    expect(roles("3-5-2")).toEqual(["goleiro", "zagueiro", "zagueiro", "zagueiro", "lateral", "meia", "meia", "meia", "lateral", "atacante", "atacante"]);
  });

  it("have eleven slots each, the keeper behind everyone and the last slot, a forward, ahead of everyone", () => {
    for (const formation of FORMATION_NAMES) {
      const slots = FORMATIONS[formation];
      expect(slots).toHaveLength(11);
      const outfield = slots.slice(1).map((slot) => slot.y);
      expect(slots[0]?.y).toBeGreaterThan(Math.max(...outfield));
      expect(slots[10]).toMatchObject({ role: "atacante", y: Math.min(...outfield) });
    }
  });
});

describe("positionFit", () => {
  const meia: Player = { name: "Paquetá", group: "MID", strength: 80, positions: ["meia", "atacante"] };

  it("keeps a player's whole strength in his main position, a little less in another of his and much less elsewhere", () => {
    expect(positionFit(meia, "meia")).toBe(1);
    expect(positionFit(meia, "atacante")).toBe(SECONDARY_POSITION);
    expect(positionFit(meia, "zagueiro")).toBe(OUT_OF_POSITION);
    expect(SECONDARY_POSITION).toBeGreaterThan(OUT_OF_POSITION);
    expect(SECONDARY_POSITION).toBeLessThan(1);
  });

  it("halves a keeper outfield and an outfielder in goal", () => {
    expect(positionFit(meia, "goleiro")).toBe(KEEPER_SWAP);
    expect(positionFit({ group: "GK", positions: ["goleiro"] }, "zagueiro")).toBe(KEEPER_SWAP);
  });

  it("lets a player without positions play anywhere in his group", () => {
    const defender: Player = { name: "D", group: "DEF", strength: 70 };
    expect(positionFit(defender, "lateral")).toBe(1);
    expect(positionFit(defender, "zagueiro")).toBe(1);
    expect(positionFit(defender, "meia")).toBe(OUT_OF_POSITION);
  });
});

describe("arrange", () => {
  const p = (name: string, strength: number, ...positions: Role[]): Player => ({ name, group: positions[0] === "goleiro" ? "GK" : positions[0] === "meia" ? "MID" : positions[0] === "atacante" ? "ATT" : "DEF", strength, positions });

  it("puts full-backs at full-back and centre-backs in the middle, whatever order they come in", () => {
    const back = [p("Z1", 70, "zagueiro"), p("L1", 70, "lateral"), p("Z2", 70, "zagueiro"), p("L2", 70, "lateral")];
    const eleven = [p("G", 70, "goleiro"), ...back, ...Array.from({ length: 4 }, (_, i) => p(`M${i}`, 70, "meia")), p("A1", 70, "atacante"), p("A2", 70, "atacante")];
    const slots = FORMATIONS["4-4-2"];
    arrange(eleven, "4-4-2").forEach((player, s) => expect(player?.positions?.[0]).toBe(slots[s]?.role));
  });

  it("moves a player who has the position as a second one before a player who doesn't", () => {
    const eleven = [p("G", 70, "goleiro"), p("L1", 70, "lateral"), p("L2", 70, "lateral"), p("Z1", 70, "zagueiro"),
      p("Pulgar", 75, "meia"), p("Versatile", 70, "meia", "zagueiro"), p("M2", 70, "meia"), p("M3", 70, "meia"), p("M4", 70, "meia"), p("A1", 70, "atacante"), p("A2", 70, "atacante")];
    const placed = inFormation(eleven, "4-4-2");
    expect(placed.find((player) => player.name === "Versatile")).toMatchObject({ slot: "DEF", fit: SECONDARY_POSITION });
    expect(placed.find((player) => player.name === "Pulgar")).toMatchObject({ slot: "MID", fit: 1 });
  });
});

describe("fittingFormation", () => {
  it("picks the formation an eleven fills with nobody out of position", () => {
    expect(fittingFormation(eleven({ GK: 1, DEF: 5, MID: 3, ATT: 2 }))).toBe("5-3-2");
    expect(fittingFormation(eleven({ GK: 1, DEF: 4, MID: 5, ATT: 1 }))).toBe("4-5-1");
  });

  it("falls back to the 4-4-2 when no formation fits better", () => {
    expect(fittingFormation(eleven({ GK: 2, DEF: 4, MID: 4, ATT: 1 }))).toBe("4-4-2");
  });

  it("fits the same players again once their positions change", () => {
    const squad = (roles: Role[]): Player[] => [
      { name: "keeper", group: "GK", strength: 60 },
      ...roles.map((role, i): Player => ({ name: `player${i}`, group: "MID", strength: 60, positions: [role] })),
    ];
    const lines = (counts: Partial<Record<Role, number>>) => (Object.entries(counts) as [Role, number][]).flatMap(([role, count]) => Array<Role>(count).fill(role));
    expect(fittingFormation(squad(lines({ lateral: 2, zagueiro: 2, meia: 3, atacante: 3 })))).toBe("4-3-3");
    expect(fittingFormation(squad(lines({ lateral: 2, zagueiro: 3, meia: 3, atacante: 2 })))).toBe("5-3-2");
  });

  it("fits the same players again once their strengths change", () => {
    const squad = (spareMidfielder: number, spareForward: number): Player[] => [
      ...eleven({ GK: 1, DEF: 4, MID: 3, ATT: 2 }),
      { name: "spareMID", group: "MID", strength: spareMidfielder },
      { name: "spareATT", group: "ATT", strength: spareForward },
    ];
    expect(fittingFormation(squad(40, 90))).toBe("4-3-3");
    expect(fittingFormation(squad(90, 40))).toBe("4-4-2");
  });
});
