import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, playLiveRound, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;

/** The first day of the Libertadores stage the coach's club joins at, read through the e2e build's engine hook. */
async function firstLibertadoresDate(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { competitions, coachClubId } = await engine.read(["competitions", "coachClubId"]);
    const libertadores = competitions["libertadores-2026"];
    const stage = libertadores?.kind === "continental" ? libertadores.entries.findIndex((ids) => ids.includes(coachClubId ?? "")) : -1;
    const date = libertadores?.stageDates[stage]?.[0];
    if (!date) throw new Error("the coach's club is not in the Libertadores");
    return date;
  });
}

/** Plays every day before `date` in the worker with no decisions, through the e2e build's engine hook. */
async function playDaysBefore(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

test("a Libertadores club plays its first group match live and finds its group table on the Libertadores tab", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "palmeiras", club: "Palmeiras", coach: "Tite" });
  const matchDay = await firstLibertadoresDate(page);
  // The months before the group stage are played in the worker; the cup's match itself is played on screen.
  await playDaysBefore(page, matchDay);

  const bar = barOf(page);
  // Through another screen and back, so the hub reads the game as the worker left it.
  await bar.getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByRole("heading", { name: "Calendário 2026" })).toBeAttached();
  await bar.getByRole("link", { name: "Times" }).click();

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }
  await expect(lineup).toContainText("Libertadores");
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  await playLiveRound(page);

  await bar.getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Libertadores" }).click();
  const stages = page.getByRole("group", { name: "Fases" });
  await expect(stages.getByRole("button", { name: "Grupos" })).toHaveAttribute("aria-pressed", "true");
  const group = page.getByRole("table").filter({ has: page.getByText("Palmeiras", { exact: true }) });
  await expect(group).toHaveCount(1);
  await expect(group.getByRole("row")).toHaveCount(5);
  const palmeiras = group.getByRole("row").filter({ has: page.getByText("Palmeiras", { exact: true }) });
  await expect(palmeiras).toHaveAttribute("aria-current", "true");
  await expect(palmeiras.getByRole("cell").nth(3)).toHaveText("1");
});
