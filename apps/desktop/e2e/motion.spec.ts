import { expect, test, type Page } from "@playwright/test";
import { playLiveRoundUntil, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;

declare global {
  interface Window {
    /** Every animation seen so far, by name, and whether any of its keyframes moves something. */
    seenMotion?: { name: string; moves: boolean }[];
    /** How far the page has jumped by itself, as the browser's cumulative layout shift. */
    shifted?: number;
  }
}

/** Records every animation the page runs (CSS, WAAPI, transitions and view transitions), frame by frame. */
async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    const seen = new WeakSet<Animation>();
    window.seenMotion = [];
    const MOVING = ["transform", "translate", "scale", "rotate"];
    const look = () => {
      for (const animation of document.getAnimations()) {
        if (seen.has(animation)) continue;
        seen.add(animation);
        const effect = animation.effect;
        if (!(effect instanceof KeyframeEffect) || Number(effect.getComputedTiming().duration) === 0) continue;
        const moves = effect.getKeyframes().some((frame) => MOVING.some((property) => property in frame && frame[property] !== "none"));
        const name = animation instanceof CSSAnimation ? animation.animationName : animation instanceof CSSTransition ? animation.transitionProperty : "script";
        window.seenMotion?.push({ name: `${name}${effect.pseudoElement ?? ""}`, moves });
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

async function newGame(page: Page) {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });
}

/** A tour of the moments that move: screen changes, a squad re-sort, the lineup sheet, kick-off and the full table. */
async function tour(page: Page) {
  await newGame(page);
  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Tabelas" }).click();
  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("button", { name: "Idade" }).click();
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const play = page.getByRole("button", { name: "Jogar rodada" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    // The round can open between the check and the press, taking the button with it.
    await play.click({ timeout: 2000 }).catch(() => undefined);
    await expect(play.or(lineup)).toBeVisible();
  }
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  await page.getByRole("button", { name: "Pausar" }).click();
  await page.getByRole("button", { name: "Tabela completa" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.waitForTimeout(800);
  return page.evaluate(() => window.seenMotion ?? []);
}

test("a click on the arriving screen lands while the screen change is still running", async ({ page }) => {
  await newGame(page);
  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Tabelas" }).click();
  await expect(page.getByRole("heading", { name: "Tabelas" })).toBeVisible();
  const squad = await bar.getByRole("link", { name: "Times" }).boundingBox();
  if (!squad) throw new Error("no Times link");
  await page.mouse.click(squad.x + squad.width / 2, squad.y + squad.height / 2);
  // Read the squad as soon as it is drawn, without waiting for anything to stop moving.
  const age = await page.waitForFunction(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Idade") ?? null, null, { polling: "raf" });
  const box = await age.asElement()?.boundingBox();
  if (!box) throw new Error("no Idade button");
  const isMidTransition = await page.evaluate(() => document.getAnimations().some((animation) => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith("::view-transition")));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  expect(isMidTransition).toBe(true);
  await expect(page.getByRole("columnheader", { name: "Idade" })).not.toHaveAttribute("aria-sort", "none");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  const title =
    reducedMotion === "reduce" ? "with reduced motion, every moment only fades and nothing moves" : "with full motion, the screens, sheets, kick-off and squad rows move";
  test(title, async ({ browser }) => {
    const page = await browser.newPage({ reducedMotion });
    await recordMotion(page);
    const seen = await tour(page);
    await page.close();

    const names = new Set(seen.map((motion) => motion.name));
    for (const moment of ["shell-arrive", "lineup-fade-in", "round-fade-in", "script"]) expect(names, moment).toContain(moment);
    const moving = [...new Set(seen.filter((motion) => motion.moves).map((motion) => motion.name))];
    if (reducedMotion === "reduce") expect(moving).toEqual([]);
    else expect(moving).toEqual(expect.arrayContaining(["shell-arrive", "sheet-rise", "round-kickoff-home", "lineup-shirt-in", "round-sheet-in", "script"]));
  });
}

test("at the final whistle the súmula lands above the board without the rows jumping", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.addInitScript(() => {
    window.shifted = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if ("value" in entry && typeof entry.value === "number" && !("hadRecentInput" in entry && entry.hadRecentInput)) window.shifted = (window.shifted ?? 0) + entry.value;
    }).observe({ type: "layout-shift" });
  });
  await newGame(page);
  await page.clock.install();
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const play = page.getByRole("button", { name: "Jogar rodada" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await play.click({ timeout: 2000 }).catch(() => undefined);
    await expect(play.or(lineup)).toBeVisible();
  }
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  const before = await page.evaluate(() => window.shifted ?? 0);
  await playLiveRoundUntil(page, null);
  await expect(page.getByRole("region", { name: "Súmula do jogo" })).toBeVisible();
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.shifted ?? 0)).toBeLessThan(before + 0.05);
});
