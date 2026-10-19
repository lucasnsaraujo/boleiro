import { expect, type Locator, type Page } from "@playwright/test";

// The round's 4x clock: 110 ms per match minute (MS_PER_MINUTE in ui/screens/Round.tsx).
const FOUR_X_MINUTE_MS = 110;
const PAUSE_LEAD_MS = 200;

/** Opens one of the game's selects and clicks an option, by its name or its place in the list. */
export async function pickOption(select: Locator, option: string | RegExp | { index: number }) {
  await select.click();
  const list = select.page().getByRole("listbox");
  const options = list.getByRole("option");
  await (typeof option === "string" || option instanceof RegExp ? list.getByRole("option", { name: option, exact: true }) : options.nth(option.index)).click();
  await expect(list).toBeHidden();
}

/** From the start menu, a new career at a club found by division and name. */
export async function startAtClub(page: Page, { division, search, club, coach }: { division: string; search: string; club: string; coach: string }) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), division);
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

/** The hub once it has read the game and no turning point or career moment took the screen instead: its dock's paper button. */
export function hubLoaded(page: Page): Locator {
  return page.locator('button[aria-controls="hub-paper"]');
}

/** A career moment's scene over the screen: a title, a call-up, a farewell, a quiet exit, the night of a sacking. */
export function momentScene(page: Page): Locator {
  return page.locator(".mo-stage");
}

/**
 * Sees through each career moment that takes the screen when the hub comes back after days went by, as a player
 * does: skips the scene to its end (Esc, as "Pular") and goes on with its main button ("Continuar", or the way on
 * it offers, "Ver propostas" after a sacking). Waits until `then`, what the spec expects next, is up instead.
 * `then` must show only once no moment is coming, such as the hub's own content, never the bar; returns how many
 * moments it saw through.
 */
export async function passMoments(page: Page, then: Locator): Promise<number> {
  const scene = momentScene(page);
  for (let passed = 0; ; passed++) {
    await expect(then.or(scene).first()).toBeVisible();
    if (!(await scene.isVisible())) return passed;
    await page.keyboard.press("Escape");
    await scene.locator(".btn.go").click();
    await expect(scene).toBeHidden();
  }
}

/**
 * Stops the page clock a moment ahead. pauseAt only moves forward and the page's time keeps flowing until it
 * lands, so on a loaded machine the moment can pass before the call arrives; then it aims again.
 */
export async function pauseClock(page: Page) {
  for (;;) {
    try {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + PAUSE_LEAD_MS);
      return;
    } catch (error) {
      if (!String(error).includes("Cannot fast-forward to the past")) throw error;
    }
  }
}

/** Closes the window a red card or an injury of the coach's side opens, leaving his side as it is; whether there was one. */
export async function leaveIncident(page: Page): Promise<boolean> {
  const incident = page.getByRole("dialog", { name: /^(Expulso|Machucou):/ });
  if (!(await incident.isVisible())) return false;
  await incident.getByRole("button", { name: "Deixar como está" }).click();
  await expect(incident).toBeHidden();
  return true;
}

/**
 * Plays the live round at 4x until the result is in, stepping the paused page clock one match
 * minute at a time instead of waiting for it. Returns how many times the round stopped by itself
 * before full time. The test must install the page clock before the round starts: a timer the page
 * set before the install keeps real time, and the fake clearInterval can't stop it.
 */
export async function playLiveRound(page: Page): Promise<number> {
  const band = page.getByRole("region", { name: "Seu jogo" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  const fourX = page.getByRole("button", { name: "4x" });
  const minute = band.getByLabel("Minuto");
  const varCheck = band.getByRole("status").filter({ hasText: "VAR checando" });
  await expect(band).toBeVisible();
  await pauseClock(page);
  await fourX.click();
  let stops = 0;
  // One tick per step, so the screen has stopped the clock by itself before the next tick is due.
  while (!(await finishing.or(back).first().isVisible())) {
    const before = await minute.textContent();
    await page.clock.runFor(FOUR_X_MINUTE_MS);
    await expect
      // A VAR check stands the clock still for a few seconds of its own; the steps run it down.
      .poll(async () => (await minute.textContent()) !== before || (await paused.or(finishing).or(back).or(varCheck).count()) > 0, { intervals: [0, 20, 50, 100] })
      .toBe(true);
    if (await paused.isVisible()) {
      stops++;
      if (!(await leaveIncident(page))) await fourX.click();
    }
  }
  await page.clock.resume();
  await expect(back).toBeVisible();
  await expect(band).toContainText("Fim de jogo");
  await back.click();
  await expect(band).toBeHidden();
  return stops;
}

/**
 * Plays the live round at 4x a match minute a step, as playLiveRound does, until it stands paused at the
 * minute `stop` ("90'"), or, with no `stop`, until the result is in; it leaves the round open there.
 */
export async function playLiveRoundUntil(page: Page, stop: string | null): Promise<void> {
  const band = page.getByRole("region", { name: "Seu jogo" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  const fourX = page.getByRole("button", { name: "4x" });
  const minute = band.getByLabel("Minuto");
  const varCheck = band.getByRole("status").filter({ hasText: "VAR checando" });
  const isThere = async () => (stop ? (await minute.textContent()) === stop && (await paused.isVisible()) : await back.isVisible());
  await pauseClock(page);
  await fourX.click();
  while (!(await isThere())) {
    const before = await minute.textContent();
    await page.clock.runFor(FOUR_X_MINUTE_MS);
    await expect
      .poll(async () => (await minute.textContent()) !== before || (await paused.or(finishing).or(back).or(varCheck).count()) > 0, { intervals: [0, 20, 50, 100] })
      .toBe(true);
    if (await finishing.isVisible()) await page.clock.resume();
    if ((await paused.isVisible()) && !(await isThere()) && !(await leaveIncident(page))) await fourX.click();
  }
}


const PLAY_TIMEOUT = 60_000;
const MAX_SEASON_STEPS = 400;

/**
 * Plays the whole season a career is in, through the screens, until its end screen ("Fim da temporada") is up:
 * every round's live match, the moments between them, a sacking's offers and the days between matches. The test
 * must install the page clock first (see playLiveRound). Returns how many live rounds it played and whether the
 * coach was sacked on the way.
 */
export async function playSeasonThroughScreens(page: Page, season: number): Promise<{ rounds: number; wasSacked: boolean }> {
  const hubDate = barDate(page);
  const seeOffers = page.getByRole("link", { name: "Ver propostas" });
  const playRound = page.getByRole("button", { name: "Jogar rodada" });
  const waitForOffers = page.getByRole("button", { name: "Esperar propostas" });
  const canPlay = page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas)$/, disabled: false });
  const kickOff = page.getByRole("button", { name: "Começar a rodada" });
  const band = page.getByRole("region", { name: "Seu jogo" });
  const seasonEnd = page.getByRole("heading", { name: `Fim da temporada ${season}` });
  const sacked = page.getByRole("heading", { name: "Demitido" });
  const offers = page.getByRole("heading", { name: "Propostas" });
  const moment = momentScene(page);
  const elsewhere = kickOff.or(band).or(seasonEnd).or(sacked).or(offers).or(moment);
  let rounds = 0;
  let wasSacked = false;

  for (let step = 0; step < MAX_SEASON_STEPS && !(await seasonEnd.isVisible()); step++) {
    await expect(canPlay.or(elsewhere).first()).toBeVisible();
    if (await seasonEnd.isVisible()) break;
    if (await moment.isVisible()) {
      if (/#\/sacked$/.test(page.url())) wasSacked = true;
      await passMoments(page, canPlay.or(kickOff).or(band).or(seasonEnd).or(sacked).or(offers));
      continue;
    }
    if (await kickOff.isVisible()) {
      await kickOff.click();
      await playLiveRound(page);
      rounds++;
      continue;
    }
    if (await sacked.isVisible()) {
      wasSacked = true;
      await page.getByRole("button", { name: "Ver propostas" }).click();
      await expect(offers).toBeVisible();
      continue;
    }
    if (await offers.isVisible()) {
      const sign = page.getByRole("button", { name: /^Assinar com / });
      await ((await sign.isVisible()) ? sign : waitForOffers).click();
      await expect(offers).toBeHidden({ timeout: PLAY_TIMEOUT });
      continue;
    }
    if (await seeOffers.isVisible()) {
      await seeOffers.click();
      await expect(offers).toBeVisible();
      continue;
    }
    await expect(playRound.or(waitForOffers)).toBeVisible();
    const before = (await hubDate.allTextContents()).join();
    await ((await playRound.isVisible()) ? playRound : waitForOffers).click();
    await expect
      .poll(async () => (await elsewhere.count()) > 0 || ((await canPlay.count()) > 0 && (await hubDate.allTextContents()).join() !== before), { timeout: PLAY_TIMEOUT })
      .toBe(true);
  }
  await expect(seasonEnd).toBeVisible();
  return { rounds, wasSacked };
}

/** From a season's end screen to the next season's hub; a coach whose club has a board to meet looks at it first. */
export async function startNextSeason(page: Page, season: number) {
  const board = page.getByRole("button", { name: "Ver a diretoria" });
  if (await board.isVisible()) await board.click();
  await page.getByRole("button", { name: `Começar ${season}` }).click();
  await passMoments(page, hubLoaded(page));
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(bar(page)).toContainText(`Temporada ${season}`);
}
