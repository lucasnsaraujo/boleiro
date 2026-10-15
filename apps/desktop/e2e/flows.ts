import { expect, type Locator, type Page } from "@playwright/test";

/** From the start menu, a new career at a club found by division and name. */
export async function startAtClub(page: Page, { division, search, club, coach }: { division: string; search: string; club: string; coach: string }) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption(division);
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill(search);
  const clubs = page.getByRole("list", { name: "Clubes" });
  // The sticker shows the squad's strength once the season is drawn.
  await expect(clubs.getByRole("button", { name: club })).not.toContainText("…");
  await clubs.getByRole("button", { name: club }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill(coach);
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: club })).toBeVisible();
}

/** From the start menu, a career without a club, saved in `slot` when given. */
export async function startCareer(page: Page, coach: string, slot?: RegExp) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Modo carreira" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill(coach);
  if (slot) {
    // The slot's radio sits inside its sticker, which is what the coach clicks.
    const radio = page.getByRole("radio", { name: slot });
    await page.locator("label", { has: radio }).click();
    await expect(radio).toBeChecked();
  }
  await page.getByRole("button", { name: "Começar carreira" }).click();
}

/** Inside a game, back to the start menu through Opções. */
export async function backToStart(page: Page) {
  await bar(page).getByRole("link", { name: "Opções" }).click();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page.getByRole("link", { name: "Novo jogo" })).toBeVisible();
}

/** The start menu's list of every save, opened from Carregar jogo. */
export async function savedGames(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Carregar jogo" }).click();
  return page.getByRole("dialog", { name: "Jogos salvos" }).getByRole("list");
}

export function bar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Telas" });
}

/** The game's day in the top bar, "Qui, 1 jan". */
export function barDate(page: Page): Locator {
  return bar(page).getByText(/^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom), \d+ [a-zç]{3}$/);
}

/** The hub's paper, opened from the dock if it is closed. */
export async function news(page: Page): Promise<Locator> {
  const paper = page.getByRole("button", { name: /^Jornal/ });
  const list = page.getByRole("list", { name: "Notícias" });
  // The hub opens the paper by itself when a day brings news, so a click can land just as it does and shut it again.
  await expect(async () => {
    if (!(await list.isVisible())) await paper.click();
    await expect(list).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return list;
}
