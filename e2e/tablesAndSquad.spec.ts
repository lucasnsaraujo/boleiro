import { expect, test } from "@playwright/test";

test("from a new game, the bar opens the tables, the squad and a player", async ({ page }) => {
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

  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("heading", { name: "Tabelas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Baiano" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row").filter({ has: page.getByText("Bahia", { exact: true }) })).toHaveAttribute("aria-current", "true");

  await page.getByRole("tab", { name: "Série A" }).click();
  await expect(page.getByRole("table", { name: "Série A" }).getByRole("row")).toHaveCount(21);
  await expect(page.getByText("Libertadores", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Copa do Brasil" }).click();
  await expect(page.getByRole("list", { name: "1ª fase" }).getByRole("listitem")).toHaveCount(14);
  await expect(page.getByRole("group", { name: "Fases" }).getByRole("button", { name: "Final", exact: true })).toBeDisabled();

  await bar.getByRole("link", { name: "Elenco" }).click();
  await expect(page.getByRole("heading", { name: "Elenco" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Goleiros" })).toBeVisible();
  const age = page.getByRole("columnheader", { name: "Idade" });
  await age.getByRole("button").click();
  await expect(age).toHaveAttribute("aria-sort", "ascending");

  const player = page.getByRole("table").getByRole("link").first();
  const name = (await player.textContent()) ?? "";
  await player.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Renovar" })).toBeDisabled();
  await page.getByRole("link", { name: "Voltar ao elenco" }).click();
  await expect(page.getByRole("heading", { name: "Elenco" })).toBeVisible();
});
