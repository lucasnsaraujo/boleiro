import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, barDate, startAtClub } from "./flows.js";

// A cheap listing draws a buyer in about four window days; a month is plenty for three of them.
const MAX_WAIT_DAYS = 30;

/** Plays one day at a time in the worker, with no decisions, until a club has made an offer for one of the coach's players. */
async function waitForOffer(page: Page): Promise<void> {
  await page.evaluate(async (maxDays) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (let day = 0; day < maxDays; day++) {
      const { market } = await engine.read(["market"]);
      if (Object.keys(market.coach?.bids ?? {}).length > 0) return;
      await engine.apply({ type: "advance", days: [{}] });
    }
    throw new Error(`no offer in ${maxDays} days`);
  }, MAX_WAIT_DAYS);
}

/** Plays days in the worker until the coach has no match today, so "Jogar rodada" plays a day instead of opening the round. */
async function skipMatchDay(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (;;) {
      const { date, fixtures, coachClubId } = await engine.read(["date", "fixtures", "coachClubId"]);
      if (!fixtures.some((f) => f.date === date && (f.homeId === coachClubId || f.awayId === coachClubId))) return;
      await engine.apply({ type: "advance", days: [{}] });
    }
  });
}

test("from a new game: list players, answer a club's offer, make an offer and get a counter-offer", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });
  const bar = barOf(page);

  await bar.getByRole("link", { name: "Busca" }).click();
  await page.getByRole("tab", { name: "Propostas" }).click();
  await expect(page.getByRole("heading", { name: "Nenhuma proposta na mesa" })).toBeVisible();
  const sale = page.getByRole("combobox", { name: "Jogador para vender" });
  const forSale = page.getByRole("list", { name: "Jogadores à venda" });
  for (let listed = 0; listed < 3; listed++) {
    await sale.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Pôr à venda" }).click();
    await expect(forSale.getByRole("listitem")).toHaveCount(listed + 1);
  }
  await expect(forSale.getByRole("button", { name: "Barato e rápido", pressed: true })).toHaveCount(3);

  await waitForOffer(page);
  await bar.getByRole("link", { name: "Times" }).click();
  await bar.getByRole("link", { name: "Busca" }).click();
  await page.getByRole("tab", { name: /^Propostas/ }).click();
  const card = page.getByRole("article", { name: /^Proposta por / });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Responder até");
  await card.getByRole("button", { name: "Contraproposta", exact: true }).click();
  const outcome = page.getByText(/vendido para|subiu a oferta|desistiu de/);
  await expect(outcome).toBeVisible();
  if (await page.getByText(/subiu a oferta/).isVisible()) {
    await page.getByRole("article", { name: /^Proposta por / }).getByRole("button", { name: /^Aceitar / }).click();
    await expect(page.getByText(/vendido para/)).toBeVisible();
  }

  await page.getByRole("tab", { name: "Buscar" }).click();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série B");
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  await priced.getByRole("button").click();
  const chosen = page.getByRole("region", { name });
  for (let press = 0; press < 3; press++) await chosen.getByRole("button", { name: "Diminuir oferta" }).click();
  await chosen.getByRole("button", { name: "Fazer proposta" }).click();
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}`);

  await skipMatchDay(page);
  await bar.getByRole("link", { name: "Times" }).click();
  const before = (await barDate(page).textContent()) ?? "";
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(barDate(page)).not.toHaveText(before);
  await bar.getByRole("link", { name: "Busca" }).click();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série B");
  await page.getByRole("searchbox", { name: "Nome" }).fill(name);
  await page.getByRole("table", { name: "Jogadores" }).getByRole("button", { name, exact: true }).first().click();
  const countered = page.getByRole("region", { name });
  await expect(countered).toContainText(/pede R\$ [\d,]+ (mi|mil) por ele/);
  await expect(countered.getByRole("button", { name: /^Aceitar R\$/ })).toBeVisible();
});

test("a squad over the 35-player cap can't sign anyone: the market warns and the board refuses", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "são paulo", club: "São Paulo", coach: "Tite" });
  const bar = barOf(page);
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    await engine.apply({ type: "advance", days: Array.from({ length: 5 }, () => ({})) });
  });
  await skipMatchDay(page);
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByText(/^Elenco \d+\/35$/)).toBeVisible();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série B");
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  await priced.getByRole("button").click();
  const chosen = page.getByRole("region", { name });
  await expect(chosen).toContainText(/Elenco cheio: \d+ de 35 jogadores/);
  await chosen.getByRole("button", { name: "Comprar" }).click();

  await bar.getByRole("link", { name: "Times" }).click();
  const before = (await barDate(page).textContent()) ?? "";
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(barDate(page)).not.toHaveText(before);
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}: recusada, o elenco já tem 35 jogadores`);
});
