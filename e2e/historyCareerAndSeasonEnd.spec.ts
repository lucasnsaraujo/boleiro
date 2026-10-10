import { expect, test, type Page } from "@playwright/test";

// The last day of the first season; the next day played turns the year.
const LAST_DAY = "2026-12-31";
// From the last day: a sacking and its offers, or a job offer, can each stop the days once before the turn.
const MAX_STEPS = 6;

async function newGame(page: Page, start: (page: Page) => Promise<void>) {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await start(page);
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
}

/** Plays every day up to `date` in the worker with no decisions, through the e2e build's engine hook. */
async function fastForward(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.advance(Array.from({ length: days }, () => ({})));
  }, date);
}

test("in career mode the coach signs with a club from the hub, and his career shows in the history", async ({ page }) => {
  await newGame(page, async (p) => {
    await p.getByRole("tab", { name: "Modo carreira" }).click();
    await p.getByRole("button", { name: "Começar carreira" }).click();
  });
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();

  await page.getByRole("link", { name: "Ver propostas" }).click();
  const offers = page.getByRole("list", { name: "Propostas" });
  await expect(offers.getByRole("button").first()).toBeVisible();
  await offers.getByRole("button").last().click();
  const sign = page.getByRole("button", { name: /^Assinar com / });
  const club = ((await sign.textContent()) ?? "").replace("Assinar com ", "");
  await sign.click();

  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: club })).toBeVisible();
  await expect(page.getByRole("list", { name: "Notícias" })).toContainText(`${club} anuncia você como técnico`);

  await page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: "História" }).click();
  await expect(page.getByRole("heading", { name: "História" })).toBeVisible();
  await expect(page.getByRole("heading", { name: club })).toBeVisible();
  await page.getByRole("tab", { name: "Carreira" }).click();
  await expect(page.getByRole("list", { name: "Clubes" })).toContainText(club);
  await expect(page.getByRole("list", { name: "Clubes" })).toContainText("no cargo");
});

test("a season fast-forwarded to its last day ends on the end-of-season screen and season 2 starts", async ({ page }) => {
  await newGame(page, async (p) => {
    await p.getByRole("button", { name: "Série A" }).click();
    await p.getByRole("searchbox", { name: "Buscar clube" }).fill("flamengo");
    const clubs = p.getByRole("list", { name: "Clubes" });
    await expect(clubs.getByRole("button", { name: "Flamengo" })).not.toContainText("…");
    await clubs.getByRole("button", { name: "Flamengo" }).click();
    await p.getByRole("button", { name: "Assumir o clube" }).click();
  });
  await fastForward(page, LAST_DAY);

  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Calendário" }).click();
  await bar.getByRole("link", { name: "Clube" }).click();
  const seasonEnd = page.getByRole("heading", { name: "Fim da temporada 2026" });
  // A sacking during the year goes through its own screen and the offers before the days go on.
  for (let step = 0; step < MAX_STEPS && !(await seasonEnd.isVisible()); step++) {
    const next = page
      .getByRole("button", { name: /^(Jogar rodada|Esperar propostas|Ver propostas)$/ })
      .or(seasonEnd)
      .first();
    await expect(next).toBeVisible();
    if (await seasonEnd.isVisible()) break;
    await next.click();
    await expect(page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas|Ver propostas)$/ }).or(seasonEnd).first()).toBeVisible();
  }
  await expect(seasonEnd).toBeVisible();

  const board = page.getByRole("button", { name: "Ver a diretoria" });
  if (await board.isVisible()) {
    await expect(page.getByRole("region", { name: "Campanha" })).toContainText("Série A");
    await board.click();
    await expect(page.getByRole("region", { name: "Diretoria" })).toContainText(/Meta (não )?cumprida/);
  }
  await page.getByRole("button", { name: "Começar 2027" }).click();

  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByText(/1 de janeiro de 2027/)).toBeVisible();
  await bar.getByRole("link", { name: "Calendário" }).click();
  await expect(page.getByRole("heading", { name: "Calendário 2027" })).toBeVisible();
});
