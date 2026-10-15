import { expect, test, type Page } from "@playwright/test";

const MAX_TURNS = 12;
const MAX_STOPS = 40;

/** The hand-off names the next coach; he opens his turn. */
async function takeTurn(page: Page, coach: string) {
  await expect(page.getByRole("heading", { name: `Vez de ${coach}` })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Começar minha vez" }).click();
}

/** Plays the live round at 4x to its end and goes on to the next turn. */
async function playRound(page: Page) {
  const next = page.getByRole("button", { name: "Próxima vez" });
  for (let stop = 0; stop < MAX_STOPS && !(await next.isVisible()); stop++) {
    const fourX = page.getByRole("button", { name: "4x" });
    if (await fourX.isVisible()) await fourX.click();
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(next)).toBeVisible({ timeout: 30_000 });
  }
  await next.click();
}

test("a Rápido game of a Série A and a Série B coach plays their first league round together, both leagues live on the board", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await expect(page.getByRole("radio", { name: "Realista" })).toBeChecked();
  await page.getByRole("button", { name: "Mais um técnico" }).click();
  await expect(page.getByRole("radio", { name: "Rápido" })).toBeChecked();
  await page.getByRole("button", { name: "Estaduais" }).click();
  const clubs = page.getByRole("list", { name: "Clubes" });
  await page.getByRole("textbox", { name: "Nome do técnico 1" }).fill("Ana");
  await clubs.getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico 2" }).fill("Bruno");
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("Goiás");
  await clubs.getByRole("button", { name: "Goiás", exact: true }).click();
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
    // A stop with no match of either coach hands the seat back to the first one.
    if (await handOff.isVisible()) {
      await takeTurn(page, "Ana");
      continue;
    }
    if (await sheet.isVisible()) {
      await sheet.getByRole("button", { name: "Começar a rodada" }).click();
      setLineup.add(coach);
    }
    const board = page.locator(".live-list");
    for (const league of ["Série A", "Série B"]) {
      const section = board.locator(".live-group", { has: page.getByRole("heading", { name: new RegExp(league) }) });
      await expect(section.locator(".live-r.human")).toBeVisible();
    }
    await playRound(page);
    isRoundPlayed = true;
  }

  expect([...setLineup].sort()).toEqual(["Ana", "Bruno"]);
  expect(isRoundPlayed).toBe(true);
});
