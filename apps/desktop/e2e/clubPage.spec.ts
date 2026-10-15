import { expect, test } from "@playwright/test";
import { bar, pickOption, startAtClub } from "./flows.js";

test("in the market, a league then a club narrows the list, the club's name opens its whole squad, and a player there opens his screen", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });
  await bar(page).getByRole("link", { name: "Busca" }).click();

  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Série B");
  const club = page.getByRole("combobox", { name: "Clube" });
  await club.click();
  const clubs = page.getByRole("listbox", { name: "Clube" });
  await expect(clubs.getByRole("option", { name: "Goiás", exact: true })).toBeVisible();
  await expect(clubs.getByRole("option", { name: "Palmeiras", exact: true })).toHaveCount(0);
  await clubs.getByRole("option", { name: "Goiás", exact: true }).click();

  const results = page.getByRole("table", { name: "Jogadores" });
  const rows = results.getByRole("row");
  await expect(rows.nth(1)).toContainText("Goiás");
  const listed = await rows.count();
  for (let i = 1; i < listed; i++) await expect(rows.nth(i).getByRole("cell").nth(2)).toHaveText("Goiás");

  await rows.nth(1).getByRole("link", { name: "Goiás" }).click();
  await expect(page).toHaveURL(/#\/club\/goias-go$/);
  await expect(page.getByRole("heading", { name: "Goiás" })).toBeVisible();
  const squad = page.getByRole("table", { name: "Elenco do Goiás" });
  await expect(squad.getByRole("link")).toHaveCount(listed - 1);

  const player = squad.getByRole("link").first();
  const name = (await player.textContent()) ?? "";
  await player.click();
  await expect(page).toHaveURL(/#\/squad\//);
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
