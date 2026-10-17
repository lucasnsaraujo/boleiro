import { expect, test, type Page } from "@playwright/test";
import { bar, playLiveRound, startAtClub } from "./flows.js";

const FLAMENGO = { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" };
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

test("the thank-you to Brasfoot opens from the start menu's hidden sticker and from typing brasfoot", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("dialog", { name: "Valeu, Brasfoot" });
  await page.getByRole("button", { name: "Uma homenagem ao Brasfoot" }).click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Lançado em 2003");
  await card.getByRole("button", { name: "Fechar" }).click();
  await expect(card).toBeHidden();

  await page.keyboard.type("brasfoot");
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-skin", "win98");
});

test("typing BRASFOOT in a game plays the next round as Windows 98, finds its sticker, then comes back to 2026", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, FLAMENGO);
  const html = page.locator("html");
  const taskbar = page.getByRole("toolbar", { name: "Barra de tarefas" });

  await page.keyboard.type("brasfoot");
  await expect(html).toHaveAttribute("data-skin", "win98");
  await expect(taskbar).toBeVisible();
  const reveal = page.getByRole("complementary", { name: "Figurinha rara" });
  await expect(reveal.getByRole("figure", { name: /Rodada de 1998/ })).toBeVisible();
  await reveal.getByRole("button", { name: "Fechar" }).click();
  await expect(reveal).toBeHidden();

  await toKickOff(page);
  await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();
  await expect(html).toHaveAttribute("data-skin", "win98");
  await playLiveRound(page);
  await expect(html).not.toHaveAttribute("data-skin", "win98");
  await expect(taskbar).toBeHidden();

  await bar(page).getByRole("link", { name: "Histórico" }).click();
  await page.getByRole("tab", { name: "Raridades" }).click();
  await expect(page.getByRole("tabpanel", { name: "Raridades" }).getByRole("figure", { name: /Rodada de 1998/ })).toBeVisible();
});

test("a played match's page tapes the egg it laid under Almanaque", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.goto("/");
  await startAtClub(page, FLAMENGO);
  // Days played in the worker, a month at a time, until one of the coach's matches has an egg on its page.
  const found = await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const looked = new Set<string>();
    for (let month = 0; month < 5; month++) {
      await engine.apply({ type: "advance", days: Array.from({ length: 30 }, () => ({})) });
      const { fixtures, clubs, coachClubId } = await engine.read(["fixtures", "clubs", "coachClubId"]);
      for (const f of fixtures) {
        if (!f.result || looked.has(f.id) || (f.homeId !== coachClubId && f.awayId !== coachClubId)) continue;
        looked.add(f.id);
        const egg = (await engine.matchPage(f.id))?.eggs[0];
        const opponent = clubs[f.homeId === coachClubId ? f.awayId : f.homeId]?.shortName;
        if (egg && opponent) return { date: f.date, opponent, title: egg.title };
      }
    }
    return null;
  });
  if (!found) throw new Error("no match of the coach's laid an egg in five months");

  await bar(page).getByRole("link", { name: "Agenda" }).click();
  const month = MONTHS[Number(found.date.slice(5, 7)) - 1] ?? "";
  await page.getByRole("group", { name: "Meses" }).getByRole("button", { name: new RegExp(`^${month},`) }).click();
  const day = Number(found.date.slice(8, 10));
  await page
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`\\b${day}, `) })
    .filter({ hasText: found.opponent })
    .getByRole("button", { name: `Ficha do jogo contra ${found.opponent}` })
    .click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByRole("note", { name: `Almanaque: ${found.title}` })).toBeVisible();

  await panel.getByRole("button", { name: /Ver ficha completa/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ficha completa" });
  await expect(sheet.getByRole("complementary", { name: "Curiosidades" }).getByRole("note", { name: `Almanaque: ${found.title}` })).toBeVisible();
});
