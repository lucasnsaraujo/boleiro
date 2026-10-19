import { expect } from "vitest";
import type { WindowCallUps } from "./callUpsBySeason.js";

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

// National teams called 39 Série A players in September and in October 2024 (Trivela,
// https://trivela.com.br/brasil/campeonato-brasileiro/clubes-brasileiro-jogadores-convocados-data-fifa/) and 36 in
// March 2026 (90min, https://www.90min.com/pt-br/todos-jogadores-brasileirao-serie-a-convocados-data-fifa-marco).
/** Série A players called in a FIFA window average 30 to 50 over the run, and no season averages over 56. */
export function expectSerieACallUpsNearReal(windows: readonly WindowCallUps[]): void {
  const regular = windows.filter((w) => w.serieAToTournament === 0);
  expect(mean(regular.map((w) => w.serieA))).toBeGreaterThan(30);
  expect(mean(regular.map((w) => w.serieA))).toBeLessThan(50);
  for (const season of new Set(regular.map((w) => w.from.slice(0, 4)))) {
    expect(mean(regular.filter((w) => w.from.startsWith(season)).map((w) => w.serieA)), season).toBeLessThan(56);
  }
}

// 32 Série A players went to the 2026 World Cup, 7 of them Brazil's (Trivela,
// https://trivela.com.br/copa-do-mundo/brasileirao-recorde-convocados-mundial-2026/).
/** A World Cup takes 20 to 45 Série A players from the window before it. */
export function expectWorldCupSerieANearReal(windows: readonly WindowCallUps[]): void {
  const worldCups = windows.filter((w) => w.isBeforeWorldCup);
  expect(worldCups.length).toBeGreaterThan(0);
  for (const w of worldCups) {
    expect(w.serieAToTournament, w.from).toBeGreaterThanOrEqual(20);
    expect(w.serieAToTournament, w.from).toBeLessThanOrEqual(45);
  }
}
