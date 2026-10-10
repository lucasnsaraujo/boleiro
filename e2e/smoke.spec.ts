import { expect, test } from "@playwright/test";

test("a new game is created, saved to a slot and listed on the start menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nenhum jogo salvo.")).toBeVisible();

  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("tab", { name: "Modo carreira" }).click();
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Rogério");
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await expect(page.getByText("1 de janeiro de 2026")).toBeVisible();

  await page.getByRole("button", { name: "Salvar jogo" }).click();
  await expect(page.getByText("Salvo em Jogo 1.")).toBeVisible();

  await page.getByRole("link", { name: "Boleiro" }).click();
  const slots = page.getByRole("list");
  await expect(slots.getByRole("button", { name: /Sem clube.*Jogo 1.*Rogério/ })).toBeVisible();

  await slots.getByRole("button", { name: /Sem clube.*Jogo 1/ }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
});
