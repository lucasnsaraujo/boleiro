import { expect, test, type Page } from "@playwright/test";
import { bar } from "./flows.js";

// Turns until both coaches have set an eleven on a match day: a round or two of the estaduais.
const MAX_TURNS = 20;
const MAX_STOPS = 40;

/** From the start menu, a hot-seat game of Ana at Flamengo and Bruno at Palmeiras, with the five-minute market clock. */
async function startTwoCoaches(page: Page) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Mais um técnico" }).click();
  const clubs = page.getByRole("list", { name: "Clubes" });
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série A");
  await expect(clubs.getByRole("button", { name: "Flamengo" })).not.toContainText("…");
  await page.getByRole("textbox", { name: "Nome do técnico 1" }).fill("Ana");
  await clubs.getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico 2" }).fill("Bruno");
  await clubs.getByRole("button", { name: "Palmeiras" }).click();
  await expect(page.getByRole("radio", { name: "5 min" })).toBeChecked();
  await page.getByRole("button", { name: "Começar jogo" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
}

/** The hand-off names the next coach; he opens his turn. */
async function takeTurn(page: Page, coach: string) {
  await expect(page.getByRole("heading", { name: `Vez de ${coach}` })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Começar minha vez" }).click();
  await expect(page.getByText(new RegExp(`vez \\d de 2`))).toBeVisible();
}

/** Plays the live round at 4x to its end and goes on to the next turn. */
async function playRound(page: Page) {
  const next = page.getByRole("button", { name: "Próxima vez" });
  // A round where only the other coach plays has no band of the coach's own match and runs on its own.
  if (!(await page.getByRole("button", { name: "4x" }).isVisible())) await expect(next).toBeVisible({ timeout: 150_000 });
  for (let stop = 0; stop < MAX_STOPS && !(await next.isVisible()); stop++) {
    const fourX = page.getByRole("button", { name: "4x" });
    if (await fourX.isVisible()) await fourX.click();
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(next)).toBeVisible({ timeout: 30_000 });
  }
  await next.click();
}

/** The clock in the top bar, as m:ss. */
async function clockLeft(page: Page): Promise<string> {
  const clock = bar(page).getByRole("timer", { name: /Relógio do mercado/ });
  await expect(clock).toBeVisible();
  return (await clock.locator("b").textContent()) ?? "";
}

test("two coaches at two clubs take their turns, each sets his eleven, a round plays, and the market clock ticks only on market screens", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto("/");
  await startTwoCoaches(page);
  await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();

  const setLineup = new Set<string>();
  let rounds = 0;
  let clockChecked = false;
  for (let turn = 0; turn < MAX_TURNS && (setLineup.size < 2 || rounds < 1 || !clockChecked); turn++) {
    const coach = (await page.locator(".hub-club b").first().textContent()) ?? "";
    const pass = page.getByRole("button", { name: /passar a vez/i });
    const play = page.getByRole("button", { name: "Jogar rodada" });
    await expect(pass.or(play)).toBeVisible();

    if (coach === "Bruno" && !clockChecked && (await bar(page).getByRole("timer").isVisible())) {
      // On the hub the clock stands still; on the market's search it runs.
      const atHub = await clockLeft(page);
      await page.waitForTimeout(2_500);
      expect(await clockLeft(page)).toBe(atHub);
      await bar(page).getByRole("link", { name: "Busca" }).click();
      await expect(page.getByRole("tab", { name: "Buscar" })).toBeVisible();
      await expect.poll(() => clockLeft(page), { timeout: 10_000 }).not.toBe(atHub);
      await page.waitForTimeout(1_500);
      await bar(page).getByRole("link", { name: "Times" }).click();
      const leftOnHub = await clockLeft(page);
      expect(leftOnHub < atHub).toBe(true);
      await page.waitForTimeout(2_500);
      expect(await clockLeft(page)).toBe(leftOnHub);
      clockChecked = true;
    }

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
    const live = page.locator(".live-list");
    await expect(sheet.or(handOff).or(live)).toBeVisible({ timeout: 60_000 });
    if (await handOff.isVisible()) {
      await takeTurn(page, "Ana");
      continue;
    }
    if (await sheet.isVisible()) {
      await expect(sheet.getByRole("group", { name: "Titulares" }).getByRole("button")).toHaveCount(11);
      await sheet.getByRole("button", { name: "Começar a rodada" }).click();
      setLineup.add(coach);
    }
    // Every human's match is on the board, marked as his.
    await expect(page.locator(".live-r.human").first()).toBeVisible();
    await playRound(page);
    rounds++;
    await takeTurn(page, "Ana");
  }

  expect([...setLineup].sort()).toEqual(["Ana", "Bruno"]);
  expect(rounds).toBeGreaterThan(0);
  expect(clockChecked).toBe(true);
});

test("during a hot-seat round Space opens the first coach's match, → moves to the second's, and a substitute dragged onto the pitch shows on the board", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto("/");
  await startTwoCoaches(page);

  let isDone = false;
  for (let turn = 0; turn < MAX_TURNS && !isDone; turn++) {
    const pass = page.getByRole("button", { name: /passar a vez/i });
    const play = page.getByRole("button", { name: "Jogar rodada" });
    await expect(pass.or(play)).toBeVisible();
    if (await pass.isVisible()) {
      const playsToday = (await pass.textContent())?.includes("Escalar");
      await pass.click();
      if (playsToday) await page.getByRole("dialog", { name: "Escalação" }).getByRole("button", { name: "Confirmar e passar a vez" }).click();
      await takeTurn(page, "Bruno");
      continue;
    }
    await play.click();
    const sheet = page.getByRole("dialog", { name: "Escalação" });
    const handOff = page.getByRole("heading", { name: /^Vez de / });
    const live = page.locator(".live-list");
    await expect(sheet.or(handOff).or(live)).toBeVisible({ timeout: 60_000 });
    if (await handOff.isVisible()) {
      await takeTurn(page, "Ana");
      continue;
    }
    if (await sheet.isVisible()) await sheet.getByRole("button", { name: "Começar a rodada" }).click();
    await expect(live).toBeVisible();
    if ((await page.locator(".live-r.human").count()) < 2) {
      await playRound(page);
      await takeTurn(page, "Ana");
      continue;
    }

    const lineup = page.getByRole("dialog", { name: "Escalação" });
    const coaches = lineup.getByRole("group", { name: "Jogos dos técnicos" });
    // The round takes its match keys a moment after it shows; inside the lineup Space is the sheet's own.
    await expect(async () => {
      if (!(await coaches.isVisible())) await page.keyboard.press(" ");
      await expect(coaches).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(coaches).toContainText("Ana");
    await expect(coaches).toContainText("1 de 2");
    await page.keyboard.press("ArrowRight");
    await expect(coaches).toContainText("Bruno");
    await expect(lineup).toContainText("Palmeiras");

    const bench = lineup.getByRole("list", { name: "Banco" });
    const substitute = bench.locator("li.drag").first();
    const onName = (await substitute.getByRole("button").getAttribute("aria-label")) ?? "";
    const starter = lineup.getByRole("group", { name: "Titulares" }).getByRole("button").last();
    const offName = (await starter.getAttribute("aria-label")) ?? "";
    await substitute.dragTo(starter);
    await expect(lineup.getByRole("group", { name: "Titulares" }).getByRole("button", { name: onName })).toBeVisible();
    await lineup.getByRole("button", { name: "Voltar ao jogo" }).click();
    await expect(lineup).toBeHidden();

    const brunosRow = page.locator(".live-r.human", { hasText: `Entra ${onName}, sai ${offName}` });
    await expect(brunosRow).toBeVisible();
    await expect(brunosRow).toContainText("Palmeiras");
    await expect(brunosRow.getByText("Troca")).toBeVisible();
    isDone = true;
  }
  expect(isDone).toBe(true);
});
