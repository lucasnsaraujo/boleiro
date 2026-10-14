import { expect, test } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

// A day that needs the coach (a board decision, a job offer) stops the days early; a new game in
// January reaches the first match day in a couple of presses at most.
const MAX_PRESSES = 5;

test("from a new game, Jogar rodada reaches the first match day", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

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

  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByRole("heading", { name: "Calendário 2026" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Janeiro" })).toContainText("Hoje");
});
