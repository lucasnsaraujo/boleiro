import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { CALL_UP_SIZE, nationalsByTeam, OUTSIDER_MARK, pickCallUp, roleOf } from "./callUps.js";
import type { Outsiders } from "./nations.js";
import { valueOnFullContract } from "../transfers/valuePlayer.js";
import { strengthFromValue } from "../world/strengthYardstick.js";

const start = loadNewGame(5, { coachClubId: null, nationalFootball: loadNationalFootball() });
const brazilians = nationalsByTeam(start.players, start.nations?.teams ?? {}).get("brazil") ?? [];

describe("a national coach's call-up", () => {
  it("fills every place, goalkeepers too, from the players at home when the pool abroad has none for them", () => {
    const stars: Outsiders = { names: ["A", "B", "C", "D"], roles: "mmaa", strengths: [99, 99, 99, 99], born: [2000, 2000, 2000, 2000], clubs: ["", "", "", ""], clubIds: ["", "", "", ""] };
    const refs = pickCallUp(brazilians, stars, "2026-03-22");
    expect(refs).toHaveLength(CALL_UP_SIZE);
    expect(refs.filter((ref) => ref.startsWith(OUTSIDER_MARK))).toHaveLength(4);
    const keepers = refs.filter((ref) => start.players[ref] && roleOf(start.players[ref]) === "goleiro");
    expect(keepers).toHaveLength(3);
  });

  const poolOf = (roles: string, strength: number): Outsiders => {
    const names = [...roles].map((_, i) => `Abroad ${i}`);
    return { names, roles, strengths: names.map(() => strength), born: names.map(() => 2000), clubs: names.map(() => ""), clubIds: names.map(() => "") };
  };

  it("rates a player at home by his market value, as the pool abroad is rated, so a better rating alone doesn't take an outsider's place", () => {
    const pool = poolOf("gggllllzzzzmmmmmmmaaaaaaaa", 80);
    const rated = brazilians.filter((p) => p.strength > 80 && strengthFromValue(valueOnFullContract(p, "A")) < 80);
    expect(rated.length).toBeGreaterThan(0);
    const refs = pickCallUp(rated, pool, "2026-03-22");
    expect(refs.filter((ref) => !ref.startsWith(OUTSIDER_MARK))).toEqual([]);
  });

  it("counts no more than the three goalkeepers a call-up takes toward that full squad", () => {
    const refs = pickCallUp(brazilians, poolOf("gggggglllllzzzzmmmmmaaaaa", 95), "2026-03-22");
    expect(refs).toHaveLength(26);
    expect(refs.some((ref) => !ref.startsWith(OUTSIDER_MARK))).toBe(true);
  });

  it("calls only his pool abroad when it holds a full squad of 23, rather than add weaker players at home to reach 26", () => {
    const refs = pickCallUp(brazilians, poolOf("ggglllllzzzzmmmmmmaaaaa", 95), "2026-03-22");
    expect(refs).toHaveLength(23);
    expect(refs.every((ref) => ref.startsWith(OUTSIDER_MARK))).toBe(true);
  });
});
