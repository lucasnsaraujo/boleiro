import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, barDate, news, pickOption, playLiveRound, startAtClub } from "./flows.js";

const SEASON = 2026;
// A Série C club plays about 40 matches a year, and some presses of "Jogar rodada" stop early for news.
const MAX_STEPS = 400;
// The answer to "Jogar rodada" can take a while: up to 120 days played in the worker.
const PLAY_TIMEOUT = 60_000;

async function startAtSerieC(page: Page) {
  await page.goto("/");
  await startAtClub(page, { division: "Série C", search: "paysandu", club: "Paysandu", coach: "Tite" });
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
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByText(/^Janela aberta até /)).toBeVisible();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série D");
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  expect(name).not.toBe("");
  await priced.getByRole("button").click();
  await page.getByRole("region", { name }).getByRole("button", { name: "Comprar" }).click();
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}`);
  await expect(page.getByRole("region", { name })).toContainText("A diretoria responde amanhã.");
  await bar.getByRole("link", { name: "Times" }).click();
  return name;
}

/** After a played match: the club's row in its table, the result on the agenda, and the game saved from the saves screen. */
async function tourScreens(page: Page, club: string) {
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("heading", { name: "Tabelas" })).toBeAttached();
  await expect(page.getByRole("row").filter({ has: page.getByText(club, { exact: true }) }).first()).toHaveAttribute("aria-current", "true");
  await bar.getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByRole("heading", { name: `Calendário ${SEASON}` })).toBeAttached();
  // The agenda opens on today's week; the first match was played in January, maybe the week before.
  await page.getByRole("button", { name: /^Janeiro/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: /\d×\d/ }).first()).toBeVisible();
  await bar.getByRole("link", { name: "Opções" }).click();
  await page.getByRole("link", { name: "Abrir" }).click();
  // The card is there since Novo jogo wrote the slot; the status says this press saved again.
  const saved = page.getByRole("status").filter({ hasText: /^Salvo em Jogo \d\.$/ });
  await expect(saved).toBeHidden();
  await page.getByRole("button", { name: "Salvar agora" }).click();
  await expect(saved).toBeVisible();
  await expect(page.getByRole("list", { name: "Vagas" }).getByRole("button", { name: new RegExp(`^Jogo \\d · ${club}`) })).toBeVisible();
  await bar.getByRole("link", { name: "Times" }).click();
}

test("a Série C club plays its whole first season through the screens and starts season 2 with the champions on record", async ({ page }) => {
  // The board now draws every match of the round, and the season visits the tables, agenda and saves on the way.
  test.setTimeout(20 * 60_000);
  await page.clock.install();
  await startAtSerieC(page);

  const hubDate = barDate(page);
  const seeOffers = page.getByRole("link", { name: "Ver propostas" });
  const playRound = page.getByRole("button", { name: "Jogar rodada" });
  const waitForOffers = page.getByRole("button", { name: "Esperar propostas" });
  const canPlay = page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas)$/, disabled: false });
  const kickOff = page.getByRole("button", { name: "Começar a rodada" });
  const band = page.getByRole("region", { name: "Seu jogo" });
  const seasonEnd = page.getByRole("heading", { name: `Fim da temporada ${SEASON}` });
  const sacked = page.getByRole("heading", { name: "Demitido" });
  const offers = page.getByRole("heading", { name: "Propostas" });
  const elsewhere = kickOff.or(band).or(seasonEnd).or(sacked).or(offers);

  const labels: string[] = [];
  const stops: number[] = [];
  let signing: string | null = null;
  let hasToured = false;
  let isAnswered = false;
  let hasBeenSacked = false;
  // A season's fixtures are gone once the year turns, so the count is taken after every step that can play a match.
  let finished = 0;
  const countFinished = async () => {
    const seen = await finishedCoachMatches(page);
    if (seen.date.startsWith(String(SEASON))) finished = seen.count;
  };

  for (let step = 0; step < MAX_STEPS && !(await seasonEnd.isVisible()); step++) {
    await expect(canPlay.or(elsewhere).first()).toBeVisible();
    if (await seasonEnd.isVisible()) break;

    if (await kickOff.isVisible()) {
      labels.push((await page.getByRole("dialog", { name: "Escalação" }).getByText(/ x .+ · /).textContent()) ?? "");
      await kickOff.click();
      stops.push(await playLiveRound(page));
      await countFinished();
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
    if (!hasToured && labels.length > 0 && !hasBeenSacked) {
      await tourScreens(page, "Paysandu");
      hasToured = true;
      await expect(playRound).toBeVisible();
    }
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
    await countFinished();
    if (signing && !isAnswered && (await playRound.isVisible())) {
      const inbox = await news(page);
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
  await expect(barOf(page)).toContainText("1 jan");
  await expect(barOf(page)).toContainText(`Temporada ${SEASON + 1}`);

  expect(hasToured).toBe(true);
  await barOf(page).getByRole("link", { name: "Histórico" }).click();
  await page.getByRole("tab", { name: "Campeões" }).click();
  const lastSeason = page.getByRole("table", { name: "Campeões" }).getByRole("row", { name: new RegExp(`^${SEASON}`) });
  await expect(lastSeason.getByRole("button").first()).toBeVisible();
});
