import { expect, test } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

test("the album select works from the keyboard alone, and the game keys wait while its list is open", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });
  await bar(page).getByRole("link", { name: "Busca" }).click();

  const position = page.getByRole("combobox", { name: "Posição" });
  const list = page.getByRole("listbox", { name: "Posição" });
  await position.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  await expect(position).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option", { name: "Goleiro" })).toHaveClass(/\bon\b/);

  // F2 opens the tables everywhere else; with the list open it waits, and letters jump in the list.
  await page.keyboard.press("F2");
  await page.keyboard.press("a");
  await expect(page).toHaveURL(/#\/market$/);
  await expect(list.getByRole("option", { name: "Atacante" })).toHaveClass(/\bon\b/);

  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(position).toContainText("Atacante");
  await expect(position).toBeFocused();
  const rows = page.getByRole("table", { name: "Jogadores" }).getByRole("row");
  await expect(rows.nth(1).getByRole("cell").first()).toHaveText("ATA");

  await page.keyboard.press("Space");
  await page.keyboard.press("Home");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(position).toContainText("Atacante");

  await page.keyboard.press("F2");
  await expect(page).toHaveURL(/#\/tables$/);
});
