import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { E2E_SEED_KEY } from "../ui/newGame/worldSeed.js";
import { leaveIncident, pickOption } from "../e2e/flows.js";

const OUT = process.env.VIDEO_DIR ?? "/tmp/boleiro-video";
const FIRST_SEED = 14;
const MAX_SEEDS = 60;
const PORT = Number(process.env.E2E_PORT ?? 4173);
const DWELL_MS = 2500;

/** The first world seed in which VAR changes a call in Flamengo's first match, found in a game nobody films. */
async function seedWithVarCheck(page: Page): Promise<number> {
  await page.goto("/");
  await page.waitForFunction(() => window.boleiroEngine !== undefined);
  return page.evaluate(
    async ([first, max]) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      for (let seed = first; seed < first + max; seed++) {
        await engine.apply({ type: "newGame", seed, choices: { coachClubId: "flamengo-rj" } });
        await engine.apply({ type: "playToMatchDay" });
        const round = await engine.apply({ type: "startRound" });
        const mine = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
        const hasGoal = mine?.events.some((e) => e.type === "goal") ?? false;
        const check = mine?.events.find((e) => e.type === "varCheck" && e.decision !== "goalStands" && e.minute > 10 && e.minute < 80);
        if (check && hasGoal) return seed;
      }
      throw new Error("no seed gives Flamengo's first match a goal and a VAR check");
    },
    [FIRST_SEED, MAX_SEEDS] as const,
  );
}

test("a minute-long film: the start menu, a new game, the hub and a live round with a goal, the board, a VAR check and the match page", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const scout = await browser.newPage();
  const seed = await seedWithVarCheck(scout);
  await scout.close();

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: E2E_SEED_KEY, value: String(seed) }, { name: "boleiro.theme", value: "light" }] }] },
  });
  const page = await context.newPage();
  const pause = (ms = DWELL_MS) => page.waitForTimeout(ms);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Novo jogo" })).toBeVisible();
  await pause(3500);
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await pause();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série A");
  await page.getByRole("searchbox", { name: "Buscar clube" }).pressSequentially("flamengo", { delay: 90 });
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Flamengo" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Flamengo" }).click();
  await pause();
  await page.getByRole("textbox", { name: "Nome do técnico" }).pressSequentially("Rui Tavares", { delay: 80 });
  await pause(1200);
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  await pause(4000);

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: "Jornal" });
  for (let press = 0; press < 12 && !(await lineup.isVisible()); press++) {
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible({ timeout: 60_000 });
  }
  await expect(lineup).toBeVisible();
  await pause(3500);
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  const varCheck = band.getByRole("status").filter({ hasText: "VAR checando" });
  await page.getByRole("button", { name: "2x" }).click();
  let sawVar = false;
  for (let guard = 0; guard < 2000 && !(await finishing.or(back).first().isVisible()); guard++) {
    if (await varCheck.isVisible()) sawVar = true;
    if (await paused.isVisible()) {
      await pause(1500);
      if (!(await leaveIncident(page))) await page.getByRole("button", { name: "2x" }).click();
    }
    await page.waitForTimeout(200);
  }
  await expect(back).toBeVisible({ timeout: 60_000 });
  await pause(3000);

  const rows = page.getByRole("button", { name: /^Ficha do jogo: / });
  await rows.nth(1).click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel).toBeVisible();
  await pause();
  await panel.getByRole("button", { name: /Ver ficha completa/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ficha completa" });
  await expect(sheet).toBeVisible();
  for (const tab of ["Resumo", "Escalações", "Estatísticas", "Confronto"]) {
    await sheet.getByRole("tab", { name: tab }).click();
    await pause(2200);
  }
  await sheet.getByRole("button", { name: "Fechar a ficha" }).click();
  await pause(800);
  await back.click();
  await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  await pause(3000);

  expect(sawVar, "the board showed the VAR check").toBe(true);
  test.info().annotations.push({ type: "film", description: `world seed ${seed}, VAR check on the board: ${sawVar}` });
  await page.close();
  await context.close();
});
