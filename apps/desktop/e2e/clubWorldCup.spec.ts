import { expect, test, type Page } from "@playwright/test";
import { bar, playLiveRound, startAtClub } from "./flows.js";

const MAX_PRESSES = 12;
// FIFA's first Club World Cup after 2025; the game plays one every four years from it.
const EDITION = 2029;

/** Plays every day before `date` in the worker with no decisions, through the e2e build's engine hook, a season at a time. */
async function playDaysBefore(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (;;) {
      const { date: today } = await engine.read(["date"]);
      const yearEnd = `${today.slice(0, 4)}-12-31`;
      const stop = until < yearEnd ? until : yearEnd;
      const days = Math.round((Date.parse(stop) - Date.parse(today)) / 86_400_000) + (stop === until ? 0 : 1);
      if (days <= 0) return;
      await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
    }
  }, date);
}

test("a career at an MLS club plays its first round live, then finds MLS's two conferences on the tables", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "MLS · Estados Unidos", search: "Los Angeles", club: "Los Angeles FC", coach: "Rogério" });
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const sheet = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: /Jornal|Notícias|Edição/ }).or(page.locator("#hub-paper"));
  for (let press = 0; press < MAX_PRESSES && !(await sheet.isVisible()); press++) {
    // A day with news opens the hub's paper over the play button; the dock's paper button shuts it.
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(sheet.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await sheet.getByRole("button", { name: "Começar a rodada" }).click();
  await expect(page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /MLS/ }) }).locator(".live-r.human")).toBeVisible();
  await playLiveRound(page);

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("tab", { name: "MLS" })).toHaveAttribute("aria-selected", "true");
  const conferences = page.getByRole("tabpanel", { name: "MLS" }).getByRole("table");
  await expect(conferences).toHaveCount(2);
  await expect(page.getByRole("row").filter({ has: page.getByText("Los Angeles FC", { exact: true }) })).toHaveAttribute("aria-current", "true");
});

test("Flamengo, the 2025 Libertadores champion, finds the 2029 Club World Cup on its June calendar, its eight groups on the tables and then its bracket", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  // The seasons up to the edition's are played in the worker.
  await playDaysBefore(page, `${EDITION}-01-02`);

  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await page.getByRole("group", { name: "Meses" }).getByRole("button", { name: /^Junho/ }).click();
  await expect(page.getByRole("list", { name: "Junho" })).toContainText("Mundial de Clubes");

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Mundial de Clubes" }).click();
  const stages = page.getByRole("group", { name: "Fases" });
  await expect(stages.getByRole("button", { name: "Grupos" })).toHaveAttribute("aria-pressed", "true");
  await expect(stages.getByRole("button", { name: "Oitavas" })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Grupos" }).getByRole("button")).toHaveCount(8);
  await expect(page.getByRole("row").filter({ has: page.getByText("Flamengo", { exact: true }) })).toHaveAttribute("aria-current", "true");

  // The months up to the round of 16 are played in the worker.
  await playDaysBefore(page, `${EDITION}-06-26`);
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Mundial de Clubes" }).click();
  await stages.getByRole("button", { name: "Oitavas" }).click();
  await expect(page.getByRole("group", { name: "Mundial de Clubes, mata-mata" }).getByLabel(/ x /)).toHaveCount(8);
});
