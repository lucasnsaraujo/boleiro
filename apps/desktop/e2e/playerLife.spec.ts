import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, hubLoaded, news, passMoments, startAtClub } from "./flows.js";

// The last day of the first season; the next day played turns the year.
const LAST_DAY = "2026-12-31";
// From the last day: a sacking and its offers, or a job offer, can each stop the days once before the turn.
const MAX_STEPS = 6;

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

test("a season ends and the awards screen shows the Bola de Prata team and the Ballon d'Or winner", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await fastForward(page, LAST_DAY);
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Agenda" }).click();
  await bar.getByRole("link", { name: "Times" }).click();
  const seasonEnd = page.getByRole("heading", { name: "Fim da temporada 2026" });
  for (let step = 0; step < MAX_STEPS && !(await seasonEnd.isVisible()); step++) {
    const next = page
      .getByRole("button", { name: /^(Jogar rodada|Esperar propostas|Ver propostas)$/ })
      .or(seasonEnd)
      .first();
    // A title or a farewell the year left waiting takes the screen before the hub comes back.
    await passMoments(page, next);
    await expect(next).toBeVisible();
    if (await seasonEnd.isVisible()) break;
    await next.click();
    await passMoments(page, page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas|Ver propostas)$/ }).or(seasonEnd).first());
    await expect(page.getByRole("button", { name: /^(Jogar rodada|Esperar propostas|Ver propostas)$/ }).or(seasonEnd).first()).toBeVisible();
  }
  await expect(seasonEnd).toBeVisible();
  const board = page.getByRole("button", { name: "Ver a diretoria" });
  if (await board.isVisible()) await board.click();
  await page.getByRole("button", { name: "Começar 2027" }).click();
  await passMoments(page, hubLoaded(page));
  await expect(page).toHaveURL(/#\/hub$/);

  const filed = await page.evaluate(async () => (await window.boleiroEngine?.awards())?.seasons[0]?.awards);
  if (!filed) throw new Error("the 2026 awards were not filed");
  await bar.getByRole("link", { name: "Histórico" }).click();
  await page.getByRole("link", { name: "Prêmios e recordes" }).click();
  await expect(page.getByRole("heading", { name: "Prêmios 2026" })).toBeVisible();
  const team = page.getByRole("list", { name: "Bola de Prata" });
  await expect(team.getByRole("listitem", { name: /, (goleiro|lateral|zagueiro|meia|atacante), / })).toHaveCount(11);
  for (const player of filed.bolaDePrata) await expect(team).toContainText(player.name);
  const ballon = filed.ballonDor[0];
  if (!ballon) throw new Error("nobody won the Ballon d'Or");
  await expect(page.getByRole("listitem", { name: `Ballon d'Or: ${ballon.name}` })).toBeVisible();
  await expect(page.getByRole("group", { name: "Bola de Ouro" })).toContainText(filed.bolaDeOuro?.name ?? "");
});

test("the coach retires one of his players from the player's page", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  const squad = page.getByRole("table", { name: "Elenco do Flamengo" });
  const link = squad.getByRole("link").nth(4);
  const name = ((await link.textContent()) ?? "").trim();
  await link.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: `Aposentar ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Aposentar" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(squad).toBeVisible();
  await expect(squad.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(await news(page)).toContainText(`${name} se aposenta aos`);
});
