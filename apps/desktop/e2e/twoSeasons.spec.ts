import { expect, test } from "@playwright/test";
import { bar, hubLoaded, passMoments, playSeasonThroughScreens, startAtClub } from "./flows.js";

const FIRST_SEASON = 2026;

test("a Série D club plays two whole seasons through the screens, from the club pick to the end of season 2", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série D", search: "brasiliense", club: "Brasiliense", coach: "Tite" });

  const first = await playSeasonThroughScreens(page, FIRST_SEASON);
  expect(first.rounds).toBeGreaterThan(0);
  await page.getByRole("button", { name: `Começar ${FIRST_SEASON + 1}` }).click();
  await passMoments(page, hubLoaded(page));
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(bar(page)).toContainText(`Temporada ${FIRST_SEASON + 1}`);

  const second = await playSeasonThroughScreens(page, FIRST_SEASON + 1);
  expect(second.rounds).toBeGreaterThan(0);
  test.info().annotations.push({ type: "career", description: `season 1: ${first.rounds} rounds, sacked ${first.wasSacked}; season 2: ${second.rounds} rounds, sacked ${second.wasSacked}` });

  await page.getByRole("button", { name: `Começar ${FIRST_SEASON + 2}` }).click();
  await passMoments(page, hubLoaded(page));
  await bar(page).getByRole("link", { name: "Histórico" }).click();
  await page.getByRole("tab", { name: "Campeões" }).click();
  const table = page.getByRole("table", { name: "Campeões" });
  for (const season of [FIRST_SEASON, FIRST_SEASON + 1]) {
    await expect(table.getByRole("row", { name: new RegExp(`^${season}`) }).getByRole("button").first()).toBeVisible();
  }
});
