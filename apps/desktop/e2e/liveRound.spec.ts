import { expect, test } from "@playwright/test";
import { backToStart, leaveIncident, news, savedGames, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// Half-time and every goal against, red card or injury of the coach's side stop the clock.
const MAX_STOPS = 30;

test("from the hub, set the lineup, play the round live with a substitution, and land back on the hub with the result saved", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }

  await lineup.getByRole("button", { name: "4-3-3" }).click();
  await lineup.getByRole("button", { name: "Ofensiva" }).click();
  await expect(lineup).toContainText("4-3-3 · ofensiva");
  const starters = lineup.getByRole("group", { name: "Titulares" }).getByRole("button");
  const eleven = (await starters.evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")))).sort();
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  await page.getByRole("button", { name: "4x" }).click();

  const back = page.getByRole("button", { name: "Voltar ao clube" });
  let hasSubbed = false;
  for (let stop = 0; stop < MAX_STOPS && !(await back.isVisible()); stop++) {
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(back)).toBeVisible({ timeout: 20_000 });
    if (await back.isVisible()) break;
    if (await leaveIncident(page)) continue;
    if (!hasSubbed) {
      await page.getByRole("button", { name: /^Escalação/ }).click();
      await expect(lineup).toContainText("4-3-3 · ofensiva");
      expect((await starters.evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")))).sort()).toEqual(eleven);
      await starters.last().click();
      await lineup.getByRole("list", { name: "Banco" }).locator("button:enabled").first().click();
      await expect(lineup).toContainText("Trocas 4");
      await lineup.getByRole("button", { name: "Voltar ao jogo" }).click();
      await expect(lineup).toBeHidden();
      await expect(page.getByRole("button", { name: /^Escalação/ })).toContainText("4 trocas");
      hasSubbed = true;
    }
    await page.getByRole("button", { name: "4x" }).click();
  }
  expect(hasSubbed).toBe(true);
  await expect(back).toBeVisible();
  await expect(band).toContainText("Fim de jogo");
  const score = await band.getByLabel(/ \d+ x \d+ /).getAttribute("aria-label");

  await back.click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
  await expect(await news(page)).toContainText(score ?? "no score");

  await backToStart(page);
  await savedGames(page);
  await expect(page.getByRole("button", { name: "Apagar Automático" })).toBeVisible();
});
