import { describe, expect, test } from "vitest";
import { toGameState } from "@boleiro/engine/sim/saveGame";
import { createEngineSession } from "../engine/createEngineSession.js";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { nationalTeamPage } from "./nationalTeamPage.js";

const session = createEngineSession(bundledGameFiles);
session.apply({ type: "newGame", seed: 4, choices: { coachClubId: "flamengo-rj" } });
const gameOf = () => toGameState((JSON.parse(session.save()) as { game: unknown }).game);
const start = gameOf();
const days = (from: string, to: string) => Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) }, () => ({}));
session.apply({ type: "advance", days: days("2026-01-01", "2026-03-24") });
const inWindow = gameOf();

describe("the national-team screen", () => {
  test("opens on Brazil, sixth in the FIFA ranking of 7 October 2026, with the next window ahead", () => {
    const page = nationalTeamPage(start);
    expect(page?.team).toMatchObject({ id: "brazil", name: "Brasil", code: "BRA", rank: 6 });
    expect(page?.window).toMatchObject({ from: "2026-03-23", until: "2026-03-31" });
    expect(page?.ranking.date).toBe("2026-10-07");
    expect(page?.ranking.rows[0]).toMatchObject({ rank: 1, name: "Espanha" });
  });

  test("shows the national coach's likely call-up between windows, and the real one in a window", () => {
    expect(nationalTeamPage(start)?.callUp.isProvisional).toBe(true);
    const page = nationalTeamPage(inWindow);
    expect(page?.callUp.isProvisional).toBe(false);
    expect(page?.callUp.count).toBeLessThanOrEqual(26);
    expect(page?.callUp.groups.map((g) => [g.role, g.places])).toEqual([["goleiro", 3], ["lateral", 4], ["zagueiro", 4], ["meia", 7], ["atacante", 8]]);
    expect(page?.fixtures.length).toBe(2);
  });

  test("marks the coach's club's players in the call-up and lists those the window takes from it", () => {
    const page = nationalTeamPage(inWindow);
    const ours = page?.callUp.groups.flatMap((g) => g.players).filter((p) => p.isCoachClub) ?? [];
    expect(ours.every((p) => p.clubId === "flamengo-rj")).toBe(true);
    expect(page?.leaving?.players.length).toBeGreaterThan(0);
    expect(page?.leaving?.players.every((p) => p.until === "2026-03-31")).toBe(true);
  });

  test("shows the World Cup's group with Brazil first and another team's screen on request", () => {
    const page = nationalTeamPage(start);
    const worldCup = page?.competitions.find((c) => c.id === "world-cup-2026");
    expect(worldCup?.groups[0]?.rows.map((r) => r.teamId)).toEqual(expect.arrayContaining(["brazil", "morocco"]));
    expect(nationalTeamPage(start, "argentina")?.team.name).toBe("Argentina");
  });
});
