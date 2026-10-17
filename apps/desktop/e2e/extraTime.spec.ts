import { expect, test, type Page } from "@playwright/test";
import { playLiveRoundUntil, startAtClub } from "./flows.js";

// A game seed whose 2026 Recopa second leg, Flamengo at home, ends level on aggregate after ninety
// minutes and after extra time, and goes to penalties (searched with the engine on the seeds 1 to 59).
const RECOPA_TO_PENALTIES = 11;
const RECOPA_SECOND_LEG = "2026-02-26";

/** Starts the coach's game over from `seed`'s world, through the e2e build's engine hook. */
async function startOverFrom(page: Page, seed: number) {
  await page.evaluate(async (from) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { coachClubId } = await engine.read(["coachClubId"]);
    await engine.apply({ type: "newGame", seed: from, choices: { coachClubId } });
  }, seed);
}

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

test("a Recopa second leg level after ninety minutes plays extra time, stopping at 90 and 105, then penalties, and its ficha says so", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  await startOverFrom(page, RECOPA_TO_PENALTIES);
  await playDaysBefore(page, RECOPA_SECOND_LEG);

  const play = page.getByRole("button", { name: "Jogar rodada" });
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: "Jornal" });
  for (let day = 0; day < 3 && !(await lineup.isVisible()); day++) {
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(lineup.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toContainText("Recopa");

  await playLiveRoundUntil(page, "90'");
  await expect(band).toContainText("Fim do tempo normal");
  const row = page.locator(".live-r.human");
  await expect(row).toContainText("Prorr.");
  await playLiveRoundUntil(page, "105'");
  await expect(band).toContainText("Intervalo da prorrogação");
  await playLiveRoundUntil(page, null);
  await expect(band).toContainText("Fim de jogo");
  await expect(band).toContainText("nos pênaltis");

  await row.getByRole("button", { name: /^Ficha do jogo: / }).click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByText("Encerrado · prorrogação e pênaltis")).toBeVisible();
  await panel.getByRole("button", { name: /Ver ficha completa/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ficha completa" });
  await expect(sheet.getByRole("region", { name: "Lances" })).toContainText("Prorrogação");
  await expect(sheet.getByRole("article", { name: "Jornal da rodada" })).toContainText("depois da prorrogação");
});
