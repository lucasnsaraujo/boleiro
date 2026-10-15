import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, barDate, pickOption, startCareer } from "./flows.js";

// An unemployed coach's offers come from the season's sackings; four months of them are plenty for one.
const MAX_WAIT_DAYS = 120;

/** Plays every day up to `date` in the worker with no decisions, through the e2e build's engine hook. */
async function fastForward(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

/** Plays days in the worker until the unemployed coach holds an offer on a day between the game's two windows. */
async function waitForMidSeasonOffer(page: Page): Promise<void> {
  await page.evaluate(async (maxDays) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (let day = 0; day < maxDays; day++) {
      const { date, coach } = await engine.read(["date", "coach"]);
      if (date > "2026-03-03" && date < "2026-07-19" && coach.offers.length > 0) return;
      await engine.apply({ type: "advance", days: [{}] });
    }
    throw new Error(`no offer in ${maxDays} days`);
  }, MAX_WAIT_DAYS);
}

/** Plays days in the worker until the coach has no match today, so "Jogar rodada" plays a day instead of opening the round. */
async function skipMatchDay(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (;;) {
      const { date, fixtures, coachClubId } = await engine.read(["date", "fixtures", "coachClubId"]);
      if (!fixtures.some((f) => f.date === date && (f.homeId === coachClubId || f.awayId === coachClubId))) return;
      await engine.apply({ type: "advance", days: [{}] });
    }
  });
}

test("a new game with the mid-season window off keeps the market closed in July", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  const midSeason = page.getByRole("button", { name: "Janela no meio da temporada" });
  await expect(midSeason).toHaveAttribute("aria-pressed", "true");
  await midSeason.click();
  await expect(midSeason).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Só a janela entre temporadas, de 5 jan a 3 mar.")).toBeVisible();
  await page.getByRole("button", { name: "Modo carreira" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  // The first offers stay open a few days; signing on the first day starts the coach before the January window.
  await page.getByRole("link", { name: "Ver propostas" }).click();
  await page.getByRole("list", { name: "Propostas" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /^Assinar com / }).click();
  await expect(page).toHaveURL(/#\/hub$/);

  await fastForward(page, "2026-07-25");
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Agenda" }).click();
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByText("Janela fechada · abre 5 jan", { exact: true })).toBeVisible();
  await expect(bar.getByRole("status", { name: /^Sua janela/ })).toHaveCount(0);
});

test("a coach who takes a job mid-season gets his own window in the top bar and his board takes his signing", async ({ page }) => {
  await page.goto("/");
  await startCareer(page, "Tite");
  await expect(page.getByRole("heading", { name: "Sem clube" })).toBeVisible();
  await waitForMidSeasonOffer(page);
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Agenda" }).click();
  await bar.getByRole("link", { name: "Times" }).click();

  await page.getByRole("link", { name: "Ver propostas" }).click();
  await page.getByRole("list", { name: "Propostas" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /^Assinar com / }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  const ownWindow = bar.getByRole("status", { name: /^Sua janela de transferências, aberta até \d+ [a-zç]{3}$/ });
  await expect(ownWindow).toBeVisible();

  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByText(/^Sua janela aberta até \d+ [a-zç]{3}$/)).toBeVisible();
  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Série D");
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).last();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  await priced.getByRole("button").click();
  await page.getByRole("region", { name }).getByRole("button", { name: "Comprar" }).click();
  const requests = page.getByRole("list", { name: "Pedidos à diretoria" });
  await expect(requests).toContainText(`Contratação de ${name}`);
  await expect(requests).toContainText("A diretoria responde amanhã.");

  await skipMatchDay(page);
  await bar.getByRole("link", { name: "Times" }).click();
  const before = (await barDate(page).textContent()) ?? "";
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(barDate(page)).not.toHaveText(before);
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(requests).toContainText(new RegExp(`Contratação de ${name}: (aprovada|recusada)`));
  await expect(requests).not.toContainText("janela fechada");
});
