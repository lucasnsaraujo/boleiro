import { expect, test, type Page } from "@playwright/test";
import { bar, hubLoaded, passMoments, pickOption, playSeasonThroughScreens } from "./flows.js";

const FIRST_SEASON = 2026;

/** A new career at a Série D club on the short calendar: every league on the same days, one turn, single-match knockouts, no estaduais. */
async function startOnShortCalendar(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série D");
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("brasiliense");
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Brasiliense" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Brasiliense" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Estaduais" }).click();
  await page.locator("label").filter({ hasText: "Personalizar" }).click();
  await page.locator("label").filter({ hasText: "1 turno" }).click();
  await page.locator("label").filter({ hasText: "Jogo único" }).click();
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: "Brasiliense" })).toBeVisible();
}

/** From a season's end screen to the next season's hub; a coach whose club has a board to meet looks at it first. */
async function startNextSeason(page: Page, season: number) {
  const board = page.getByRole("button", { name: "Ver a diretoria" });
  if (await board.isVisible()) await board.click();
  await page.getByRole("button", { name: `Começar ${season}` }).click();
  await passMoments(page, hubLoaded(page));
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(bar(page)).toContainText(`Temporada ${season}`);
}

test("a Série D club plays two whole seasons through the screens, from the club pick to the end of season 2", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.clock.install();
  await startOnShortCalendar(page);

  const first = await playSeasonThroughScreens(page, FIRST_SEASON);
  expect(first.rounds).toBeGreaterThan(0);
  await startNextSeason(page, FIRST_SEASON + 1);

  const second = await playSeasonThroughScreens(page, FIRST_SEASON + 1);
  expect(second.rounds).toBeGreaterThan(0);
  test.info().annotations.push({ type: "career", description: `season 1: ${first.rounds} rounds, sacked ${first.wasSacked}; season 2: ${second.rounds} rounds, sacked ${second.wasSacked}` });

  await startNextSeason(page, FIRST_SEASON + 2);
  await bar(page).getByRole("link", { name: "Histórico" }).click();
  await page.getByRole("tab", { name: "Campeões" }).click();
  const table = page.getByRole("table", { name: "Campeões" });
  for (const season of [FIRST_SEASON, FIRST_SEASON + 1]) {
    await expect(table.getByRole("row", { name: new RegExp(`^${season}`) }).getByRole("button").first()).toBeVisible();
  }
});
