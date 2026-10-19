import { expect, test, type Page } from "@playwright/test";
import { bar, hubLoaded, momentScene, passMoments, playLiveRoundUntil, startAtClub } from "./flows.js";

const MAX_PRESSES = 12;
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
// The Série A round of 8 April 2026 sits the day after the Libertadores' group day: Flamengo's game in it moves.
const ROUND_NEXT_TO_LIBERTADORES = "2026-04-08";

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

/** The coach's game postponed from `round`'s day: its id and the day it is set for now. */
async function postponedFrom(page: Page, round: string): Promise<{ id: string; date: string }> {
  return page.evaluate(async (from) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { fixtures, coachClubId } = await engine.read(["fixtures", "coachClubId"]);
    const game = fixtures.find((f) => f.postponedFrom === from && (f.homeId === coachClubId || f.awayId === coachClubId));
    if (!game) throw new Error(`no game of ${coachClubId ?? "nobody"} postponed from ${from}`);
    return { id: game.id, date: game.date };
  }, round);
}

/** Plays the days up to a game's day, again each time a cup match drawn next to it moves it on; its day. */
async function playDaysBeforeGame(page: Page, id: string): Promise<string> {
  return page.evaluate(async (gameId) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (;;) {
      const { fixtures, date: today } = await engine.read(["fixtures", "date"]);
      const game = fixtures.find((f) => f.id === gameId);
      if (!game || game.result) throw new Error(`game ${gameId} is gone or played`);
      if (game.date === today) return today;
      const days = Math.round((Date.parse(game.date) - Date.parse(today)) / 86_400_000);
      await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
    }
  }, id);
}

/** Back on the hub through another screen, so it reads the days the worker played and any moment they left waiting. */
async function backToHub(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
}

/** Presses "Jogar rodada" until the lineup sheet opens, then starts the live round. */
async function startRound(page: Page) {
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const sheet = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.locator("#hub-paper");
  for (let press = 0; press < MAX_PRESSES && !(await sheet.isVisible()); press++) {
    // A day with news opens the hub's paper over the play button; the dock's paper button shuts it.
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(sheet.or(play).or(momentScene(page)).first()).toBeVisible({ timeout: 60_000 });
    await passMoments(page, sheet.or(play));
  }
  await sheet.getByRole("button", { name: "Começar a rodada" }).click();
}

test("a Libertadores club's Série A game next to its group match is postponed: the table and the calendar say so, and it is played later", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  await playDaysBefore(page, "2026-04-10");
  const game = await postponedFrom(page, ROUND_NEXT_TO_LIBERTADORES);
  expect(game.date > "2026-04-10").toBe(true);

  await backToHub(page);
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  const flamengo = page.getByRole("table", { name: "Série A" }).getByRole("row").filter({ hasText: "Flamengo" });
  await expect(flamengo.locator(".st-postponed")).toHaveText("adiado");

  await bar(page).getByRole("link", { name: "Agenda" }).click();
  const month = MONTHS[Number(game.date.slice(5, 7)) - 1] ?? "";
  await page.getByRole("group", { name: "Meses" }).getByRole("button", { name: new RegExp(`^${month},`) }).click();
  await expect(page.getByRole("list", { name: month })).toContainText("adiado");

  const day = await playDaysBeforeGame(page, game.id);
  expect(day > "2026-04-10").toBe(true);
  await backToHub(page);
  await expect(page.getByRole("region", { name: "Próximo jogo" })).toContainText(/Série A · \d+ª rodada · adiado/);
  await startRound(page);
  const ownMatch = page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /Série A/ }) }).locator(".live-r.human");
  await expect(ownMatch).toBeVisible();
  await playLiveRoundUntil(page, null);
  await ownMatch.getByRole("button", { name: /^Ficha do jogo: / }).click();
  await expect(page.getByRole("dialog", { name: "Ficha do jogo" })).toContainText("adiado");
});
