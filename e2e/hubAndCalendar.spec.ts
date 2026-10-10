import { expect, test } from "@playwright/test";

// A day that needs the coach (a board decision, a job offer) stops the days early; a new game in
// January reaches the first match day in a couple of presses at most.
const MAX_PRESSES = 5;

test("from a new game, Jogar rodada reaches the first match day", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Série A" }).click();
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("bahia");
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Bahia" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Bahia" }).click();
  await page.getByRole("button", { name: "Assumir o clube" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar" }).click();

  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
  const next = page.getByRole("region", { name: "Próximo jogo" });
  await expect(next).toContainText(/Baiano · \d+ª rodada/);
  await expect(next).not.toContainText("Hoje");

  for (let press = 0; press < MAX_PRESSES && !page.url().endsWith("#/round"); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(page.getByRole("heading", { name: "Escalação" }))).toBeVisible();
  }
  await expect(page).toHaveURL(/#\/round$/);

  await page.getByRole("button", { name: "Voltar ao clube" }).click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
  await expect(next).toContainText("Hoje");

  await page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: "Calendário" }).click();
  await expect(page.getByRole("heading", { name: "Calendário 2026" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Janeiro" })).toContainText("Hoje");
});
