import { expect, test, type Page } from "@playwright/test";
import { bar, leaveIncident, pickOption, startAtClub } from "./flows.js";

const MAX_TURNS = 12;
const MAX_STOPS = 40;
const PREMIER_LEAGUE = "Premier League · Inglaterra";

/** The hand-off names the next coach; he opens his turn. */
async function takeTurn(page: Page, coach: string) {
  await expect(page.getByRole("heading", { name: `Vez de ${coach}` })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Começar minha vez" }).click();
}

/** Plays the live round at 4x until `done` shows, then clicks it. */
async function playRound(page: Page, done: string) {
  const next = page.getByRole("button", { name: done });
  for (let stop = 0; stop < MAX_STOPS && !(await next.isVisible()); stop++) {
    // A red card or an injury to a coach's side stops the round with its window over the board.
    await leaveIncident(page);
    const fourX = page.getByRole("button", { name: "4x" });
    if (await fourX.isVisible()) await fourX.click();
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(next)).toBeVisible({ timeout: 30_000 });
  }
  await next.click();
}

test("a Rápido game of a Brazilian and an English coach plays their first league round together, both leagues live on the board", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Mais um técnico" }).click();
  await page.getByRole("button", { name: "Estaduais" }).click();
  const clubs = page.getByRole("list", { name: "Clubes" });
  await page.getByRole("textbox", { name: "Nome do técnico 1" }).fill("Ana");
  await clubs.getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico 2" }).fill("Bruno");
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), PREMIER_LEAGUE);
  await clubs.getByRole("button", { name: "Arsenal FC" }).click();
  await expect(page.getByRole("radio", { name: "Rápido" })).toBeChecked();
  await page.getByRole("button", { name: "Começar jogo" }).click();
  await expect(page).toHaveURL(/#\/hub$/);

  const setLineup = new Set<string>();
  let isRoundPlayed = false;
  for (let turn = 0; turn < MAX_TURNS && !isRoundPlayed; turn++) {
    const coach = (await page.locator(".hub-club b").first().textContent()) ?? "";
    const pass = page.getByRole("button", { name: /passar a vez/i });
    const play = page.getByRole("button", { name: "Jogar rodada" });
    await expect(pass.or(play)).toBeVisible();
    if (await pass.isVisible()) {
      const playsToday = (await pass.textContent())?.includes("Escalar");
      await pass.click();
      if (playsToday) {
        const sheet = page.getByRole("dialog", { name: "Escalação" });
        await expect(sheet.getByRole("group", { name: "Titulares" }).getByRole("button")).toHaveCount(11);
        await sheet.getByRole("button", { name: "Confirmar e passar a vez" }).click();
        setLineup.add(coach);
      }
      await takeTurn(page, coach === "Ana" ? "Bruno" : "Ana");
      continue;
    }
    await play.click();
    const sheet = page.getByRole("dialog", { name: "Escalação" });
    const handOff = page.getByRole("heading", { name: /^Vez de / });
    await expect(sheet.or(handOff).or(page.locator(".live-list"))).toBeVisible({ timeout: 60_000 });
    if (await handOff.isVisible()) {
      await takeTurn(page, "Ana");
      continue;
    }
    if (await sheet.isVisible()) {
      await sheet.getByRole("button", { name: "Começar a rodada" }).click();
      setLineup.add(coach);
    }
    const board = page.locator(".live-list");
    for (const league of ["Série A", "Premier League"]) {
      const section = board.locator(".live-group", { has: page.getByRole("heading", { name: new RegExp(league) }) });
      await expect(section.locator(".live-r.human")).toBeVisible();
    }
    await playRound(page, "Próxima vez");
    isRoundPlayed = true;
  }

  expect([...setLineup].sort()).toEqual(["Ana", "Bruno"]);
  expect(isRoundPlayed).toBe(true);
});

test("a career at an English club plays a round live, then shows its league's table and its finances", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: PREMIER_LEAGUE, search: "Arsenal", club: "Arsenal FC", coach: "Rogério" });
  await expect(page.getByText("Premier League").first()).toBeVisible();
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const sheet = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: /Jornal|Notícias|Edição/ }).or(page.locator("#hub-paper"));
  for (let stop = 0; stop < MAX_TURNS && !(await sheet.isVisible()); stop++) {
    // A day with news opens the hub's paper over the play button; the dock's paper button shuts it.
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(sheet.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await sheet.getByRole("button", { name: "Começar a rodada" }).click();
  await expect(page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /Premier League/ }) }).locator(".live-r.human")).toBeVisible();
  await playRound(page, "Voltar ao clube");

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("tab", { name: "Premier League" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table", { name: "Premier League" }).getByRole("row")).toHaveCount(21);
  await expect(page.getByRole("row").filter({ has: page.getByText("Arsenal FC", { exact: true }) })).toHaveAttribute("aria-current", "true");

  await bar(page).getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Finanças" }).click();
  await expect(page.getByRole("heading", { name: /Finanças/ })).toBeVisible();
});
