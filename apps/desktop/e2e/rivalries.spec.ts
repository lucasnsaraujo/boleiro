import { expect, test, type Page } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

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

/** Makes the coach in the seat a Flamengo man since 2019, with Fluminense's job open today, through a save the worker loads back. */
async function makeFlamengoIdol(page: Page) {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const save: { game: { date: string; history: { coach: { stints: { from: string }[] } }; coaches: { openJobs: Record<string, string> } } } = JSON.parse(await engine.save());
    const { game } = save;
    const [stint] = game.history.coach.stints;
    if (!stint) throw new Error("the coach has no spell at his club");
    stint.from = "2019-01-01";
    game.coaches.openJobs["fluminense-rj"] = game.date;
    await engine.apply({ type: "load", save: JSON.stringify(save) });
  });
}

test("a derby on the live board wears its sticker, and its match page names it", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await toKickOff(page);
  await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();

  const others = page.getByRole("button", { name: /Outras ligas/ });
  if ((await others.isVisible()) && (await others.getAttribute("aria-expanded")) === "false") await others.click();
  const derby = page.locator(".live-r:not([hidden])").filter({ has: page.getByRole("img", { name: /rivalidade \d de 5$/ }) }).first();
  await expect(derby).toBeVisible();
  const sticker = derby.getByRole("img", { name: /rivalidade \d de 5$/ });
  await expect(sticker).toContainText("Clássico");
  const words = (await sticker.getAttribute("aria-label")) ?? "";

  await derby.getByRole("button", { name: /^Ficha do jogo: / }).click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByRole("img", { name: words })).toBeVisible();
});

test("a long-serving Flamengo coach finds Fluminense's door shut in the job centre, and his profile calls him an idol", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Lucas" });
  await makeFlamengoIdol(page);

  await bar(page).getByRole("link", { name: "Técnicos" }).click();
  await expect(page.getByRole("complementary", { name: "Perfil de Lucas" })).toContainText("Ídolo do Flamengo");
  await page.getByRole("tab", { name: /Vagas/ }).click();
  const fluminense = page.getByRole("list", { name: "Vagas" }).getByRole("listitem").filter({ hasText: "Fluminense" });
  await expect(fluminense).toContainText("porta fechada");
  await expect(fluminense).toContainText("não contrata ídolo do Flamengo");
  await expect(fluminense.getByRole("button", { name: "Candidatar-se: Fluminense" })).toBeDisabled();
});
