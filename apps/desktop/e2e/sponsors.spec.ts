import { expect, test } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

test("the coach sees his betting sponsor's odds before a match, takes the sponsors from the board, signs an offer and finds its logo and money on the finances screen", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto("/");
  // Botafogo's 2026 kit carried Vbet, a betting house, on the chest and left its front and back empty.
  await startAtClub(page, { division: "Série A", search: "botafogo", club: "Botafogo", coach: "Rita" });

  const next = page.getByRole("region", { name: "Próximo jogo" });
  await expect(next.getByRole("group", { name: /^Odds da Vbet: .+ \d+,\d{2}, empate \d+,\d{2}, .+ \d+,\d{2}$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Patrocínio: Vbet" })).toBeVisible();

  await page.getByRole("link", { name: "Patrocínio", exact: true }).click();
  const board = page.getByRole("switch", { name: /A diretoria negocia/ });
  await expect(board).toHaveAttribute("aria-checked", "true");
  await board.click();
  await expect(board).toHaveAttribute("aria-checked", "false");

  // The biggest offer with a logo: the finances screen lists the kit's biggest deals by logo.
  const offers = page.getByRole("list", { name: "Propostas de patrocínio" }).getByRole("button").filter({ has: page.getByRole("img") });
  const labels = await offers.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
  const parsed = labels.map((label) => /^(.+?): .+, (R\$ ([\d,]+) (mi|mil)) por ano$/.exec(label)).filter((match) => match !== null);
  const value = (match: RegExpExecArray) => Number((match[3] ?? "0").replace(",", ".")) * (match[4] === "mi" ? 1e6 : 1e3);
  const best = parsed.reduce<RegExpExecArray | null>((top, match) => (!top || value(match) > value(top) ? match : top), null);
  const [label = "", brand = "", yearly = ""] = best ?? [];
  expect(brand).not.toBe("");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: `Fechar com ${brand}` }).click();
  await expect(page.getByRole("list", { name: "Na camisa hoje" })).toContainText(brand);

  await bar(page).getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Finanças" }).click();
  const sponsors = page.getByRole("region", { name: "Patrocínio" });
  const deal = sponsors.getByRole("listitem", { name: `${brand}: ${yearly} por ano` });
  await expect(deal).toBeVisible();
  await expect(deal.getByRole("img", { name: brand })).toBeVisible();
  await expect(deal).toContainText(yearly);
});

test("the sponsors screen fits the smallest window: the deal list keeps room for its rows and nothing spills out of its card", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "botafogo", club: "Botafogo", coach: "Rita" });
  await page.getByRole("link", { name: "Patrocínio", exact: true }).click();
  const deals = page.getByRole("list", { name: "Na camisa hoje" });
  await expect(deals).toBeVisible();
  const card = page.getByRole("region", { name: "Patrocínio", exact: true });
  const spills = await card.evaluate((root) => {
    const edge = root.getBoundingClientRect();
    return [...root.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => el.getBoundingClientRect().right > edge.right + 0.5 || el.getBoundingClientRect().bottom > edge.bottom + 0.5)
      .map((el) => `${el.className || el.tagName}`);
  });
  expect(spills).toEqual([]);
  const listBox = await deals.boundingBox();
  expect(listBox?.width ?? 0).toBeGreaterThanOrEqual(300);
  for (const row of await deals.getByRole("listitem").all()) {
    const clipped = await row.evaluate((el) => [...el.querySelectorAll("b, .v")].some((part) => part.scrollWidth > part.clientWidth + 1));
    expect(clipped).toBe(false);
  }
  const side = page.getByRole("region", { name: /^Propostas/ });
  expect(await side.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
