import { expect, test, type Page } from "@playwright/test";

const SEASON = 2026;
// A Série C club plays about 40 matches a year, and some presses of "Jogar rodada" stop early for news.
const MAX_STEPS = 400;
// The round's 4x clock: 110 ms per match minute (MS_PER_MINUTE in ui/screens/Round.tsx).
const FOUR_X_MINUTE_MS = 110;
const PAUSE_LEAD_MS = 200;
// The answer to "Jogar rodada" can take a while: up to 120 days played in the worker.
const PLAY_TIMEOUT = 60_000;

async function startAtSerieC(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Série C" }).click();
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("paysandu");
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Paysandu" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Paysandu" }).click();
  await page.getByRole("button", { name: "Assumir o clube" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: "Paysandu" })).toBeVisible();
}

/** Read-only, through the e2e build's engine hook: the game date and how many matches of the coach's club have a result. */
async function finishedCoachMatches(page: Page): Promise<{ date: string; count: number }> {
  return page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date, fixtures, coachClubId } = await engine.read(["date", "fixtures", "coachClubId"]);
    return { date, count: fixtures.filter((f) => f.result && (f.homeId === coachClubId || f.awayId === coachClubId)).length };
  });
}

/** Asks the board for a priced Série D player while the window is open, and returns his name. */
async function askForSigning(page: Page): Promise<string> {
  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Mercado" }).click();
  await expect(page.getByText(/^Janela aberta até /)).toBeVisible();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série D");
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  expect(name).not.toBe("");
  await priced.getByRole("button").click();
  await page.getByRole("region", { name }).getByRole("button", { name: "Comprar" }).click();
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}`);
  await expect(page.getByRole("region", { name })).toContainText("A diretoria responde amanhã.");
  await bar.getByRole("link", { name: "Clube" }).click();
  return name;
}

/**
 * Plays the live round at 4x until the result is in, stepping the paused page clock one match
 * minute at a time instead of waiting for it. Returns how many times the round stopped by itself
 * before full time.
 */
async function playLiveRound(page: Page): Promise<number> {
  const band = page.getByRole("region", { name: "Seu jogo" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  const fourX = page.getByRole("button", { name: "4x" });
  const minute = band.getByLabel("Minuto");
  await expect(band).toBeVisible();
  // pauseAt only moves forward, and the page's time keeps flowing until it lands.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + PAUSE_LEAD_MS);
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

test("a Série C club plays its whole first season through the screens and starts season 2", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await startAtSerieC(page);

  const hubDate = page.getByText(/ de \d{4} · Tite$/);
  const seeOffers = page.getByRole("link", { name: "Ver propostas" });
  const playRound = page.getByRole("button", { name: "Jogar rodada" });
  const waitForOffers = page.getByRole("button", { name: "Esperar propostas" });
  const canPlay = page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas)$/, disabled: false });
  const kickOff = page.getByRole("button", { name: "Começar a rodada" });
  const band = page.getByRole("region", { name: "Seu jogo" });
  const seasonEnd = page.getByRole("heading", { name: `Fim da temporada ${SEASON}` });
  const sacked = page.getByRole("heading", { name: "Demitido" });
  const offers = page.getByRole("heading", { name: "Propostas" });
  const inbox = page.getByRole("list", { name: "Notícias" });
  const elsewhere = kickOff.or(band).or(seasonEnd).or(sacked).or(offers);

  const labels: string[] = [];
  const stops: number[] = [];
  let signing: string | null = null;
  let isAnswered = false;
  let hasBeenSacked = false;
  // A season's fixtures are gone once the year turns, so the count is taken on the hub before that.
  let finished = 0;

  for (let step = 0; step < MAX_STEPS && !(await seasonEnd.isVisible()); step++) {
    await expect(canPlay.or(elsewhere).first()).toBeVisible();
    if (await seasonEnd.isVisible()) break;

    if (await kickOff.isVisible()) {
      labels.push((await page.getByRole("dialog", { name: "Escalação" }).getByText(/ x .+ · /).textContent()) ?? "");
      await kickOff.click();
      stops.push(await playLiveRound(page));
      continue;
    }
    if (await sacked.isVisible()) {
      hasBeenSacked = true;
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

    // A coach without a club looks at the offers as soon as there are any.
    if (await seeOffers.isVisible()) {
      await seeOffers.click();
      await expect(offers).toBeVisible();
      continue;
    }
    await expect(playRound.or(waitForOffers)).toBeVisible();
    // Paysandu's first match falls in January, inside the window that opens on 5 January.
    if (signing === null && labels.length > 0) {
      signing = await askForSigning(page);
      await expect(playRound).toBeVisible();
    }
    const before = (await hubDate.allTextContents()).join();
    await ((await playRound.isVisible()) ? playRound : waitForOffers).click();
    // The days are played once another screen is up, or once the hub shows a later date and can play again.
    await expect
      .poll(async () => (await elsewhere.count()) > 0 || ((await canPlay.count()) > 0 && (await hubDate.allTextContents()).join() !== before), {
        timeout: PLAY_TIMEOUT,
      })
      .toBe(true);
    const seen = await finishedCoachMatches(page);
    if (seen.date.startsWith(String(SEASON))) finished = seen.count;
    if (signing && !isAnswered && (await inbox.isVisible())) {
      const answer = inbox.getByText(`Diretoria aprova a contratação de ${signing}`).or(inbox.getByText(`Diretoria recusa a contratação de ${signing}`));
      isAnswered = await answer.isVisible();
    }
  }

  await expect(seasonEnd).toBeVisible();
  test.info().annotations.push({ type: "season", description: `${labels.length} matches, sacked: ${hasBeenSacked}, signing: ${signing}` });
  expect(isAnswered).toBe(true);
  // Every match stops at least at half-time, so the fast clock went through the round's own pauses.
  expect(stops.every((n) => n >= 1)).toBe(true);
  const played = labels.join("\n");
  expect(played).toContain("Paraense");
  expect(played).toContain("Copa do Brasil");

  // The seed is random: a sacked coach may finish the year at another club, or with none.
  const campaign = page.getByRole("region", { name: "Campanha" });
  if (!hasBeenSacked) {
    expect(played).toContain("Série C");
    // No match of the club was played without the coach.
    expect(labels).toHaveLength(finished);
    await expect(campaign).toContainText(/\d+º\s*Série C/);
  }
  if (await campaign.isVisible()) {
    await expect(campaign).toContainText(/Sobe para a Série|Cai para a Série|Fica na Série|Fica só no estadual|Campeão da Série/);
    await page.getByRole("button", { name: "Ver a diretoria" }).click();
    await expect(page.getByRole("region", { name: "Diretoria" })).toContainText(/Meta (não )?cumprida/);
  } else {
    await expect(page.getByLabel("Campeões")).toContainText("Série C");
  }
  await page.getByRole("button", { name: `Começar ${SEASON + 1}` }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByText(`1 de janeiro de ${SEASON + 1}`)).toBeVisible();
});
