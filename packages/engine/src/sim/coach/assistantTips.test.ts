import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { formationOf } from "../players/usualLineups.js";
import { assistantReadOf, type AssistantLevel } from "./assistant.js";
import { weakestSpot } from "./assistantTips.js";

const start = loadNewGame(6, { coachClubId: "flamengo-rj" });
const clubIds = Object.values(start.clubs)
  .filter((club) => club.division !== null)
  .map((club) => club.id);
const squadOf = (clubId: string) => Object.values(start.players).filter((p) => p.clubId === clubId);

/** The share of clubs whose truly weakest starter the assistant of `level` names. */
function hitRate(level: AssistantLevel): number {
  let hits = 0;
  let tips = 0;
  for (const clubId of clubIds) {
    const formation = formationOf(start, clubId, squadOf(clubId));
    const exact = weakestSpot(start, clubId, formation, (_, strength) => strength);
    const tip = weakestSpot(start, clubId, formation, assistantReadOf(start, { id: `staff:${clubId}`, level }));
    if (!exact || !tip) continue;
    tips++;
    if (tip.playerId === exact.playerId) hits++;
  }
  return hits / tips;
}

describe("the assistant's weak-position tip", () => {
  it("names the starter he reads weakest, his position and the best backup there", () => {
    const clubId = "flamengo-rj";
    const tip = weakestSpot(start, clubId, start.coach.tactics.formation, (_, strength) => strength);
    if (!tip) throw new Error("no tip for Flamengo");
    const starter = start.players[tip.playerId];
    expect(starter?.clubId).toBe(clubId);
    expect(tip.read).toBe(starter?.strength);
    if (tip.backup) expect(start.players[tip.backup.playerId]?.clubId).toBe(clubId);
    expect(tip.backup?.playerId).not.toBe(tip.playerId);
  });

  it("is right more often the better the assistant", () => {
    const rates = ([1, 3, 5] as const).map(hitRate);
    expect(rates[0]).toBeLessThan(rates[1] ?? 0);
    expect(rates[1]).toBeLessThan(rates[2] ?? 0);
  });
});
