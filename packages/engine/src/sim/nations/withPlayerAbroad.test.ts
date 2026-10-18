import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { movePlayer, openDraft } from "../transfers/movePlayer.js";
import { OUTSIDER_MARK, pickCallUp, nationalsByTeam } from "./callUps.js";

const start = loadNewGame(5, { coachClubId: null, nationalFootball: loadNationalFootball() });

it("keeps a Brazilian sold abroad in Brazil's pool, so his country can still call him", () => {
  const brazilians = nationalsByTeam(start.players, start.nations?.teams ?? {}).get("brazil") ?? [];
  const star = brazilians.reduce((a, b) => (b.strength > a.strength ? b : a));
  const sold = movePlayer(openDraft(start), { playerId: star.id, kind: "abroad", toClubId: null, fee: 100_000_000 }).state;
  const pool = sold.nations?.outsiders.brazil;
  const row = pool?.names.lastIndexOf(star.name) ?? -1;
  expect(sold.players[star.id]).toBeUndefined();
  expect(row).toBe((pool?.names.length ?? 0) - 1);
  expect(pool?.born[row]).toBe(2026 - star.age);
  const left = nationalsByTeam(sold.players, sold.nations?.teams ?? {}).get("brazil") ?? [];
  const callUp = pickCallUp(left, pool, "2026-03-22");
  expect(callUp).toContain(`${OUTSIDER_MARK}${row}`);
});
