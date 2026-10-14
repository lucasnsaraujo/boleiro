import { expect, test, type Page } from "@playwright/test";

async function startCareer(page: Page, coachName: string) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("tab", { name: "Modo carreira" }).click();
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill(coachName);
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
}

async function startAtClub(page: Page, search: string, club: string, coachName: string) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Série A" }).click();
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill(search);
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: club })).not.toContainText("…");
  await clubs.getByRole("button", { name: club }).click();
  await page.getByRole("button", { name: "Assumir o clube" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill(coachName);
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: club })).toBeVisible();
}

test("after a career game and a club game, continue reopens the club game across a reload", async ({ page }) => {
  await page.goto("/");
  await startCareer(page, "Rogério");
  await page.getByRole("link", { name: "Boleiro" }).click();
  await startAtClub(page, "bahia", "Bahia", "Tite");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Nenhum jogo aberto" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  const slots = page.getByRole("list");
  await expect(slots.getByRole("button", { name: /Sem clube.*Jogo 1.*Rogério/ })).toBeVisible();
  await expect(slots.getByRole("button", { name: /Bahia.*Jogo 2.*Tite.*Série A/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Bahia" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
});

test("starting over a saved game asks before replacing it", async ({ page }) => {
  await page.goto("/");
  await startCareer(page, "Rogério");
  await page.getByRole("link", { name: "Boleiro" }).click();

  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("tab", { name: "Modo carreira" }).click();
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Abel");
  await page.getByRole("radio", { name: /Jogo 1/ }).check();
  await page.getByRole("button", { name: "Começar" }).click();
  await page.getByRole("alertdialog", { name: "Substituir o Jogo 1?" }).getByRole("button", { name: "Substituir" }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();

  await page.getByRole("link", { name: "Boleiro" }).click();
  await expect(page.getByRole("list").getByRole("button", { name: /Jogo 1.*Abel/ })).toBeVisible();
  await expect(page.getByRole("list").getByRole("button", { name: /Rogério/ })).toHaveCount(0);
});
