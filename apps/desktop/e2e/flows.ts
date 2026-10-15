import { expect, type Locator, type Page } from "@playwright/test";

// The round's 4x clock: 110 ms per match minute (MS_PER_MINUTE in ui/screens/Round.tsx).
const FOUR_X_MINUTE_MS = 110;
const PAUSE_LEAD_MS = 200;

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

/**
 * Stops the page clock a moment ahead. pauseAt only moves forward and the page's time keeps flowing until it
 * lands, so on a loaded machine the moment can pass before the call arrives; then it aims again.
 */
async function pauseClock(page: Page) {
  for (;;) {
    try {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + PAUSE_LEAD_MS);
      return;
    } catch (error) {
      if (!String(error).includes("Cannot fast-forward to the past")) throw error;
    }
  }
}

/**
 * Plays the live round at 4x until the result is in, stepping the paused page clock one match
 * minute at a time instead of waiting for it. Returns how many times the round stopped by itself
 * before full time.
 */
export async function playLiveRound(page: Page): Promise<number> {
  const band = page.getByRole("region", { name: "Seu jogo" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  const fourX = page.getByRole("button", { name: "4x" });
  const minute = band.getByLabel("Minuto");
  await expect(band).toBeVisible();
  await pauseClock(page);
  await fourX.click();
  let stops = 0;
  // One tick per step, so the screen has stopped the clock by itself before the next tick is due.
  while (!(await finishing.or(back).first().isVisible())) {
    const before = await minute.textContent();
    await page.clock.runFor(FOUR_X_MINUTE_MS);
    await expect
      .poll(async () => (await minute.textContent()) !== before || (await paused.or(finishing).or(back).count()) > 0, { intervals: [0, 20, 50, 100] })
      .toBe(true);
    if (await paused.isVisible()) {
      stops++;
      await fourX.click();
    }
  }
  await page.clock.resume();
  await expect(back).toBeVisible();
  await expect(band).toContainText("Fim de jogo");
  await back.click();
  await expect(band).toBeHidden();
  return stops;
}
