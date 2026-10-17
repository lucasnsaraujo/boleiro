import { expect, test, type Locator } from "@playwright/test";
import type { InboxLine } from "@boleiro/game-client/hub/inboxLines";
import { bar, news, startAtClub } from "./flows.js";

const WIDTHS = [1024, 1280, 1600] as const;
// The smallest window the app opens at, its default one, and a large screen.
const WINDOWS = [
  { width: 1024, height: 680 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
] as const;

// As many lines as the hub's paper prints, each long enough to wrap three times in the panel.
const LONG_NEWS: InboxLine[] = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-01-0${index + 1}`,
  text: `Proposta de emprego: o Clube Atlético Paranaense oferece contrato de dois anos, salário de R$ 450 mil e meta de vaga na Libertadores (${index + 1}).`,
  tone: "neutral",
}));

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether a click at the middle of `target` lands on it rather than on something drawn over it. */
async function isOnTop(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && el.contains(hit);
  });
}

/** How far each of `section`'s descendants reaches past its right edge, the widest first. */
async function spillsPastRight(section: Locator): Promise<string[]> {
  return section.evaluate((root) => {
    const edge = root.getBoundingClientRect().right;
    return [...root.querySelectorAll("*")]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > edge + 0.5)
      .map(({ el, right }) => `${el.className || el.tagName} +${Math.round(right - edge)}px`);
  });
}

test("the hub's cash and confidence meters fit the club panel at every window width", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe Luís" });
  const money = page.getByRole("region", { name: "Caixa, diretoria e torcida" });
  const board = money.getByRole("meter", { name: "Diretoria" });
  const fans = money.getByRole("meter", { name: "Torcida" });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await expect(money).toBeVisible();
    expect(await spillsPastRight(money), `at ${width}px`).toEqual([]);
    // Stacked, each meter gets the panel's whole width for its label and percentage.
    const boardBox = await board.boundingBox();
    const fansBox = await fans.boundingBox();
    expect(fansBox?.y ?? 0, `at ${width}px`).toBeGreaterThan((boardBox?.y ?? 0) + (boardBox?.height ?? 0));
  }
});

test("the open paper never covers Jogar rodada or the dock, however long its news", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe Luís" });
  // A day that stops for a job offer opens the paper on lines like these; the hub reads them again on its way back.
  await page.evaluate((lines) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    engine.inbox = async () => lines;
  }, LONG_NEWS);
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  const lines = await news(page);
  await expect(lines.getByRole("listitem")).toHaveCount(LONG_NEWS.length);

  const paper = page.getByRole("dialog", { name: "Jornal" });
  const playRound = page.getByRole("button", { name: "Jogar rodada" });
  const dock = page.getByRole("navigation", { name: "Clube" });
  const oldest = lines.getByRole("listitem").last();
  const close = paper.getByRole("button", { name: "Fechar o jornal" });
  for (const size of WINDOWS) {
    const at = `at ${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await expect(paper).toBeVisible();
    // Measured once the slip has landed, not while it flies in.
    await paper.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    const paperBox = await paper.boundingBox();
    const playBox = await playRound.boundingBox();
    const dockBox = await dock.boundingBox();
    if (!paperBox || !playBox || !dockBox) throw new Error(`the hub lost the paper, the button or the dock ${at}`);
    expect(overlaps(paperBox, playBox), at).toBe(false);
    expect(overlaps(paperBox, dockBox), at).toBe(false);
    expect(await isOnTop(playRound), at).toBe(true);
    await playRound.click({ trial: true, timeout: 2_000 });
    // The lines that don't fit scroll inside the paper, under a header that keeps its close button in reach.
    await oldest.scrollIntoViewIfNeeded();
    const oldestBox = await oldest.boundingBox();
    expect(oldestBox && oldestBox.y + oldestBox.height <= paperBox.y + paperBox.height + 1, at).toBe(true);
    expect(await isOnTop(close), at).toBe(true);
  }
});
