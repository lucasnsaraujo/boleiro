import { expect, test, type Page } from "@playwright/test";
import { bar, playLiveRound, startAtClub } from "./flows.js";

const MAX_PRESSES = 12;
// A game seed whose 2026 Libertadores Flamengo wins with no decisions taken, keeping its coach.
const LIBERTADORES_WON = 29;

/** Plays every day before `date` in the worker with no decisions, through the e2e build's engine hook. */
async function playDaysBefore(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

/** Starts the coach's game over from `seed`'s world, through the e2e build's engine hook. */
async function startOverFrom(page: Page, seed: number) {
  await page.evaluate(async (from) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { coachClubId } = await engine.read(["coachClubId"]);
    await engine.apply({ type: "newGame", seed: from, choices: { coachClubId } });
  }, seed);
}

test("Flamengo, the 2026 Libertadores champion, finds the Mundial de Clubes on its ladder and its December calendar, and plays its Derby of the Americas live", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  await startOverFrom(page, LIBERTADORES_WON);

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Mundial de Clubes" }).click();
  await expect(page.getByRole("heading", { name: /^Mundial de Clubes 2026/ }).locator("img")).toBeVisible();
  const ladder = page.getByRole("group", { name: "Mundial de Clubes, mata-mata" });
  await expect(ladder.getByText("Campeão da Libertadores")).toBeVisible();
  await expect(ladder.getByText("Campeão da Champions")).toBeVisible();

  // The months up to the Derby are played in the worker; the Libertadores final in November sends Flamengo to it.
  await playDaysBefore(page, "2026-12-09");
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await page.getByRole("group", { name: "Meses" }).getByRole("button", { name: /^Dezembro/ }).click();
  await expect(page.getByRole("list", { name: "Dezembro" })).toContainText("Mundial de Clubes");
  // The Derby is in Qatar, at no club's ground.
  await expect(page.getByRole("region", { name: /^Mundial de Clubes/ })).toContainText("Estádio Ahmad bin Ali");
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Mundial de Clubes" }).click();
  await expect(ladder.getByLabel(/Flamengo/)).toHaveClass(/mine/);
  // The note under the next tie carries no blank strip over its text.
  const note = page.getByText(/^Empate vai para a prorrogação/);
  await expect(note).toBeVisible();
  expect(await note.evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");

  await bar(page).getByRole("link", { name: "Times" }).click();
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const sheet = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: /Jornal|Notícias|Edição/ }).or(page.locator("#hub-paper"));
  for (let press = 0; press < MAX_PRESSES && !(await sheet.isVisible()); press++) {
    // A day with news opens the hub's paper over the play button; the dock's paper button shuts it.
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(sheet.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await sheet.getByRole("button", { name: "Começar a rodada" }).click();
  const derby = page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /Mundial de Clubes/ }) }).locator(".live-r.human");
  await expect(derby).toBeVisible();
  await expect(derby).toContainText("Estádio Ahmad bin Ali");
  await playLiveRound(page);

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Mundial de Clubes" }).click();
  await expect(ladder.getByRole("button", { name: /^Ficha do jogo: .*Flamengo/ })).toBeVisible();
});
