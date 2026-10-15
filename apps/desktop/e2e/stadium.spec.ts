import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, playLiveRound, startAtClub } from "./flows.js";

// The Carioca opens in January with a home game within the first few rounds.
const MAX_STEPS = 12;

/** Read-only, through the e2e build's engine hook: how many home games the coach's club has at the gate. */
async function homeGatesPlayed(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { finances, coachClubId } = await engine.read(["finances", "coachClubId"]);
    return (coachClubId && finances[coachClubId]?.homeGates?.length) || 0;
  });
}

test("on the stadium screen the coach prices tickets, sees the next crowd move, plays a home game at that price and asks the board for new seats", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Estádio" }).click();
  await expect(page.getByRole("heading", { name: "Estádio Jornalista Mário Filho" })).toBeVisible();
  const crowd = page.getByTestId("std-crowd");
  const gate = page.getByTestId("std-gate");
  const before = await crowd.textContent();

  // The assistant prices at the division's average until the coach takes over.
  const assistant = page.getByRole("switch", { name: /Auxiliar define o preço/ });
  await expect(assistant).toHaveAttribute("aria-checked", "true");
  await assistant.click();
  await expect(assistant).toHaveAttribute("aria-checked", "false");
  for (let press = 0; press < 4; press++) await page.getByRole("button", { name: "Subir o preço" }).click();
  await expect(page.getByText(/^era R\$ \d+$/)).toBeVisible();
  await expect(crowd).not.toHaveText(before ?? "");
  // Next to the gate, how far it moved from the gate at today's price.
  await expect(gate.locator("xpath=following-sibling::small")).toHaveText(/^[+−]R\$/);
  const tag = (await page.locator(".std-tag").textContent()) ?? "";
  const price = /R\$ (\d+)/.exec(tag)?.[1] ?? "";
  await page.getByRole("button", { name: "Aplicar preço" }).click();
  await expect(page.locator(".std-tag")).toContainText("atual");
  await expect(page.getByRole("button", { name: "Aplicar preço" })).toBeDisabled();

  const kickOff = page.getByRole("button", { name: "Começar a rodada" });
  const playRound = page.getByRole("button", { name: "Jogar rodada", disabled: false });
  await bar.getByRole("link", { name: "Times" }).click();
  for (let step = 0; step < MAX_STEPS && (await homeGatesPlayed(page)) === 0; step++) {
    await expect(playRound.or(kickOff).first()).toBeVisible({ timeout: 60_000 });
    if (await kickOff.isVisible()) {
      await kickOff.click();
      await playLiveRound(page);
      continue;
    }
    await playRound.click();
    await expect(playRound.or(kickOff).first()).toBeVisible({ timeout: 60_000 });
  }
  expect(await homeGatesPlayed(page)).toBe(1);

  await bar.getByRole("link", { name: "Estádio" }).click();
  const last = page.getByRole("region", { name: "Últimos jogos em casa" }).getByRole("listitem");
  await expect(last).toHaveCount(1);
  await expect(last).toContainText(`R$ ${price}`);
  await expect(last).toContainText(/\d{1,3}(\.\d{3})+/);
  await expect(last).toContainText(/R\$ [\d,]+ mi|R\$ \d+ mil/);

  const works = page.getByRole("region", { name: "Pedir obra à diretoria" });
  await works.getByRole("radio", { name: /\+2\.000 lugares/ }).click();
  await works.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Diretoria (aprovou|recusou)/ })).toBeVisible();
});
