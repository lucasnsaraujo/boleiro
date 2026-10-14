import { expect, test } from "@playwright/test";
import { backToStart, savedGames, startAtClub, startCareer } from "./flows.js";

test("after a career game and a club game, continue reopens the club game across a reload", async ({ page }) => {
  await page.goto("/");
  await startCareer(page, "Rogério");
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await backToStart(page);
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Nenhum jogo aberto" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page.getByRole("region", { name: "Continuar" })).toContainText(/Bahia.*Tite.*Série A.*Jogo 2/);
  const slots = await savedGames(page);
  await expect(slots.getByRole("button", { name: /Sem clube.*Jogo 1.*Rogério/ })).toBeVisible();
  await expect(slots.getByRole("button", { name: /Bahia.*Jogo 2.*Tite.*Série A/ })).toBeVisible();
  await expect(slots.getByRole("img", { name: "Bahia" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
});

test("starting over a saved game asks before replacing it", async ({ page }) => {
  await page.goto("/");
  await startCareer(page, "Rogério");
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await backToStart(page);

  await startCareer(page, "Abel", /Jogo 1/);
  await page.getByRole("alertdialog", { name: "Substituir o Jogo 1?" }).getByRole("button", { name: "Substituir" }).click();
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();

  await backToStart(page);
  const slots = await savedGames(page);
  await expect(slots.getByRole("button", { name: /Jogo 1.*Abel/ })).toBeVisible();
  await expect(slots.getByRole("button", { name: /Rogério/ })).toHaveCount(0);
});
