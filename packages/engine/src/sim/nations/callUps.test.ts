import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { CALL_UP_SIZE, nationalsByTeam, OUTSIDER_MARK, pickCallUp, roleOf } from "./callUps.js";
import type { Outsiders } from "./nations.js";

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
});
