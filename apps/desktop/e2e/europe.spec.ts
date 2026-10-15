import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, pickOption, startAtClub } from "./flows.js";

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

test("after Europe's first month the Champions League's league phase and the Premier League table show their results under Outras ligas", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "palmeiras", club: "Palmeiras", coach: "Tite" });
  // The Champions League's first matchday is 8 September 2026; the Premier League starts on 15 August.
  await playDaysBefore(page, "2026-09-10");

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Agenda" }).click();
  await bar.getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Outras ligas" }).click();
  const picker = page.getByRole("combobox", { name: "Liga" });

  await pickOption(picker, "Champions League");
  const phase = page.getByRole("tabpanel", { name: "Champions League" }).getByRole("table", { name: "Fase de liga" });
  await expect(phase.getByRole("row")).toHaveCount(37);
  const leader = phase.getByRole("row").nth(1);
  await expect(leader.getByRole("cell").nth(3)).toHaveText("1");
  await expect(page.getByRole("region", { name: "Supercopa da UEFA" })).toContainText(/Paris Saint-Germain \d × \d Aston Villa/);

  await pickOption(picker, "Inglaterra");
  const premierLeague = page.getByRole("tabpanel", { name: "Inglaterra" }).getByRole("table", { name: "Premier League" });
  await expect(premierLeague.getByRole("row")).toHaveCount(21);
  await expect(premierLeague.getByRole("row").nth(1).getByRole("cell").nth(3)).not.toHaveText("0");
  await expect(page.getByRole("region", { name: "Vagas" })).toContainText("Champions League");
});
