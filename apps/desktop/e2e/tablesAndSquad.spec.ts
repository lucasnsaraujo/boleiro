import { expect, test } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

test("from a new game, the bar opens the tables, the squad and a player", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  await expect(bar(page).getByRole("link")).toHaveText(["Agenda", "Tabelas", "Estádio", "Base", "Times", "Busca", "Técnicos", "Histórico", "Opções"]);
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("heading", { name: "Tabelas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Baiano" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row").filter({ has: page.getByText("Bahia", { exact: true }) })).toHaveAttribute("aria-current", "true");

  await page.getByRole("tab", { name: "Série A" }).click();
  await expect(page.getByRole("table", { name: "Série A" }).getByRole("row")).toHaveCount(21);
  await expect(page.getByText("Libertadores", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Copa do Brasil" }).click();
  await expect(page.getByRole("list", { name: "1ª fase" }).getByRole("listitem")).toHaveCount(14);
  const tieScore = page.getByRole("list", { name: "1ª fase" }).locator(".tie-score > span").first();
  await expect(tieScore).toHaveCSS("overflow", "visible");
  await expect(tieScore).toHaveCSS("position", "static");
  await expect(page.getByRole("group", { name: "Fases" }).getByRole("button", { name: "Final", exact: true })).toBeDisabled();

  await bar(page).getByRole("link", { name: "Times" }).click();
  const squad = page.getByRole("table", { name: "Elenco do Bahia" });
  await expect(squad).toBeVisible();
  await expect(squad.getByRole("rowgroup", { name: "Goleiros" })).toBeVisible();
  const age = page.getByRole("columnheader", { name: "Idade" });
  await age.getByRole("button").click();
  await expect(age).toHaveAttribute("aria-sort", "ascending");

  const player = squad.getByRole("link").first();
  const name = (await player.textContent()) ?? "";
  await player.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Renovar" })).toBeEnabled();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(squad).toBeVisible();
});
