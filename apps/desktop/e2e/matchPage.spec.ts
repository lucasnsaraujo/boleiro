import { expect, test, type Page } from "@playwright/test";
import { bar, pickOption, playLiveRound, startAtClub } from "./flows.js";

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

/** Plays on from the hub to the coach's next match day and kicks the round off; a day with news opens the paper over the play button. */
async function toKickOff(page: Page) {
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: "Jornal" });
  for (let day = 0; day < 10 && !(await lineup.isVisible()); day++) {
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(lineup.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
}

test("a match on the live board opens in the panel, Ver ficha completa opens its tabs, and the round plays on to the end", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await toKickOff(page);
  await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();

  const rows = page.getByRole("button", { name: /^Ficha do jogo: / });
  const other = rows.nth(1);
  const [home, away] = ((await other.getAttribute("aria-label")) ?? "").replace("Ficha do jogo: ", "").split(" x ");
  await other.click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByLabel(new RegExp(`^${home} \\d+ x \\d+ ${away}$`))).toBeVisible();

  await panel.getByRole("button", { name: /Ver ficha completa/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ficha completa" });
  await expect(sheet.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByRole("article", { name: "Jornal da rodada" })).toBeVisible();
  for (const tab of ["Escalações", "Estatísticas", "Confronto"]) {
    await sheet.getByRole("tab", { name: tab }).click();
    await expect(sheet.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  await expect(sheet.getByRole("region", { name: "Na tabela" })).toBeVisible();
  await sheet.getByRole("button", { name: "Fechar a ficha" }).click();
  await expect(sheet).toBeHidden();
  await expect(panel).toBeHidden();

  await playLiveRound(page);
});

test("a played match opens from the calendar and from a table's form marks, and a league abroad played result-only shows its scorers", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await playDaysBefore(page, "2026-05-10");
  const nav = bar(page);
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });

  await nav.getByRole("link", { name: "Agenda" }).click();
  await page.getByRole("button", { name: /^Ficha do jogo contra / }).first().click();
  await expect(panel.getByText("Encerrado")).toBeVisible();
  await panel.getByRole("button", { name: "Fechar a ficha" }).click();
  await expect(panel).toBeHidden();

  await nav.getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Série A" }).click();
  await page.getByRole("table", { name: "Série A" }).getByRole("button", { name: /ficha do jogo$/ }).first().click();
  await expect(panel.getByText("Encerrado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("tab", { name: "Outras ligas" }).click();
  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Argentina");
  const leader = page.getByRole("tabpanel", { name: "Argentina" }).getByRole("row").nth(1);
  await leader.getByRole("button", { name: /^Vitória, ficha do jogo$/ }).first().click();
  const goals = panel.getByRole("list", { name: "Gols" }).getByRole("listitem");
  await expect(goals.first()).toBeVisible();
  for (const goal of await goals.all()) await expect(goal).toHaveText(/\S+.*\d+'/);
});
