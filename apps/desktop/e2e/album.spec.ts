import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, startAtClub } from "./flows.js";

// A few days into the second season: the first one is filed and its pages printed.
const INTO_SECOND_SEASON = "2027-01-05";

/** Plays every day up to `date` in the worker with no decisions, through the e2e build's engine hook. */
async function fastForward(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

test("a season played prints its page in the album, foil among the stickers, and its title's page opens the final's ficha", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await fastForward(page, INTO_SECOND_SEASON);

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByRole("tab", { name: "Clube", selected: true })).toBeVisible();
  const years = page.getByRole("navigation", { name: "Temporadas" });
  const lastSeason = years.getByRole("button", { name: /^2026/ });
  // A coach still at the club sees the season under way first; the year's tab turns to 2026's page.
  if (await years.isVisible()) await lastSeason.click();
  const stickers = page.getByRole("list", { name: "Figurinhas de 2026" });
  await expect(stickers).toBeVisible();
  await expect(stickers.getByRole("link", { name: /, brilhante: / }).first()).toBeVisible();

  const plate = page.getByRole("button", { name: /^.+ 2026, .+: abrir a página do título$/ }).first();
  await plate.click();
  const titlePage = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Fechar a página do título" }) });
  await expect(titlePage).toBeVisible();
  await titlePage.getByRole("button", { name: /^Ver ficha (da final|do jogo do título)$/ }).click();
  const ficha = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(ficha).toBeVisible();
  await expect(ficha.getByText("Encerrado")).toBeVisible();
});
