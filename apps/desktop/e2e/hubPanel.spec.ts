import { expect, test, type Locator } from "@playwright/test";
import { startAtClub } from "./flows.js";

const WIDTHS = [1024, 1280, 1600] as const;

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
