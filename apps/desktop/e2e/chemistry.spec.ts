import { expect, test, type Page } from "@playwright/test";
import { bar, pickOption, playLiveRound, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// Reserves who start in place of the usual eleven: enough to unsettle the side.
const ROTATED = 6;

async function openChemistry(page: Page) {
  await page.getByRole("link", { name: "Entrosamento" }).click();
  await expect(page).toHaveURL(/#\/chemistry$/);
  const meter = page.getByRole("meter", { name: "Entrosamento" });
  await expect(meter).toBeVisible();
  return Number(await meter.getAttribute("aria-valuenow"));
}

test("open the chemistry map from the squad, name a captain, rotate the eleven and see the meter move", async ({ page }) => {
  await page.goto("/");
  await page.clock.install();
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe Luís" });

  const before = await openChemistry(page);
  const map = page.getByRole("group", { name: "Mapa do entrosamento" });
  await expect(map.getByRole("listitem")).not.toHaveCount(0);
  await expect(map.locator("line.good").first()).toBeAttached();
  await expect(map.locator("line.bad").first()).toBeAttached();
  await expect(page.getByRole("list", { name: "Ligações" })).toContainText("se dão bem");
  await expect(page.getByRole("list", { name: "Ligações" })).toContainText("disputam");

  await bar(page).getByRole("link", { name: "Times" }).click();
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }
  const pitch = lineup.getByRole("group", { name: "Titulares" });
  const foot = lineup.getByText("Entrosamento", { exact: true }).locator("..");
  await expect(foot).toContainText(String(before));

  const starters = pitch.getByRole("button");
  const chosen = (await starters.last().getAttribute("aria-label")) ?? "";
  const startsWithChosen = new RegExp(`^${chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  await pickOption(lineup.getByRole("combobox", { name: "Capitão" }), startsWithChosen);
  await expect(pitch.getByRole("button", { name: chosen }).locator(".pl-cap")).toBeVisible();
  await expect(pitch.locator(".pl-cap")).toHaveCount(1);

  const bench = lineup.getByRole("list", { name: "Banco" });
  for (let change = 0; change < ROTATED; change++) {
    const outfield = pitch.getByRole("button").filter({ hasNot: page.locator(".pos.G") });
    await outfield.nth(change).click();
    await bench.locator("button:enabled").filter({ hasNot: page.locator(".pos.G") }).first().click();
  }
  const named = Number((await foot.locator("b").textContent()) ?? "");
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  await playLiveRound(page);

  const after = await openChemistry(page);
  expect(after).toBeLessThan(named);
  await expect(page.getByText(/caiu \d+ desde o último jogo/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Mapa do entrosamento" }).getByRole("listitem", { name: new RegExp(`${startsWithChosen.source}.*capitão`) })).toBeVisible();
});
