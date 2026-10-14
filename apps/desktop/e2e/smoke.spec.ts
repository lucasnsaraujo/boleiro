import { expect, test } from "@playwright/test";
import { backToStart, bar, savedGames, startCareer } from "./flows.js";

test("a new game is created, saved to a slot and listed on the start menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nenhum jogo salvo.")).toBeVisible();

  await startCareer(page, "Rogério");
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await expect(bar(page)).toContainText("Qui, 1 jan");
  await expect(bar(page)).toContainText("Temporada 2026");

  await bar(page).getByRole("link", { name: "Opções" }).click();
  await page.getByRole("button", { name: "Salvar agora" }).click();
  await expect(page.getByText("Salvo em Jogo 1.")).toBeVisible();

  await page.getByRole("link", { name: "Voltar ao início" }).click();
  const slots = await savedGames(page);
  await expect(slots.getByRole("button", { name: /Sem clube.*Jogo 1.*Rogério/ })).toBeVisible();

  await slots.getByRole("button", { name: /Sem clube.*Jogo 1/ }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await backToStart(page);
});
