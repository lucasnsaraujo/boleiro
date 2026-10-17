import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, barDate, pickOption, startAtClub } from "./flows.js";

/** Plays days in the worker until the transfer window is open and the coach has no match today, so "Jogar rodada" plays one day. */
async function openWindowDay(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (;;) {
      const { date, fixtures, coachClubId } = await engine.read(["date", "fixtures", "coachClubId"]);
      const hasMatch = fixtures.some((f) => f.date === date && (f.homeId === coachClubId || f.awayId === coachClubId));
      if (date >= "2026-01-05" && !hasMatch) return;
      await engine.apply({ type: "advance", days: [{}] });
    }
  });
}

type Save = { game: { coachClubId: string; players: Record<string, { clubId: string; contractUntil: string; strength: number }>; clubs: Record<string, { division: string | null }>; finances: Record<string, { wageCap: number; transferBudget: number }> } };

/** Gives the coach's board room for any wage and fee, through a save the worker loads back. */
async function openTheCheckbook(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const save: Save = JSON.parse(await engine.save());
    const finance = save.game.finances[save.game.coachClubId];
    if (!finance) throw new Error("the coach's club has no finances");
    finance.wageCap = 1e10;
    finance.transferBudget = 1e10;
    await engine.apply({ type: "load", save: JSON.stringify(save) });
  });
}

/** Ends the contract of the strongest Série C player on 30 June, through a save the worker loads back. */
async function endAContractInJune(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const save: Save = JSON.parse(await engine.save());
    const { players, clubs } = save.game;
    const [best] = Object.values(players).filter((p) => clubs[p.clubId]?.division === "C").sort((a, b) => b.strength - a.strength);
    if (!best) throw new Error("no Série C player");
    best.contractUntil = "2026-06-30";
    await engine.apply({ type: "load", save: JSON.stringify(save) });
  });
}

/** Plays one day from the hub and comes back to the market. */
async function playDay(page: Page): Promise<void> {
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Times" }).click();
  const before = (await barDate(page).textContent()) ?? "";
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(barDate(page)).not.toHaveText(before);
  await bar.getByRole("link", { name: "Busca" }).click();
}

/** Picks the first player the list shows and returns his name. */
async function pickFirstPlayer(page: Page): Promise<string> {
  const first = page.getByRole("table", { name: "Jogadores" }).getByRole("row").nth(1).getByRole("button").first();
  const name = (await first.textContent()) ?? "";
  await first.click();
  return name;
}

test("a reserve of a bigger club comes on loan through the board", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série B", search: "sport", club: "Sport", coach: "Tite" });
  await openWindowDay(page);
  await openTheCheckbook(page);
  await barOf(page).getByRole("link", { name: "Busca" }).click();
  await pickOption(page.getByRole("combobox", { name: "Situação" }), "Para empréstimo");
  await page.getByRole("switch", { name: "Só quem toparia vir" }).check();
  const name = await pickFirstPlayer(page);
  await page.getByRole("region", { name }).getByRole("button", { name: "Pedir empréstimo" }).click();
  const desk = page.getByRole("list", { name: "Pedidos à diretoria" });
  await expect(desk).toContainText(`Empréstimo de ${name}`);

  await playDay(page);
  await expect(desk).toContainText(`Empréstimo de ${name}: aprovado`);
  await barOf(page).getByRole("link", { name: "Times" }).click();
  await expect(page.getByRole("table", { name: "Elenco do Sport" }).getByText(name, { exact: true })).toBeVisible();
});

test("a player in his contract's last six months signs a pre-contract and is marked as signed", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await endAContractInJune(page);
  await barOf(page).getByRole("link", { name: "Busca" }).click();
  await pickOption(page.getByRole("combobox", { name: "Situação" }), "Fim de contrato");
  const name = await pickFirstPlayer(page);
  await page.getByRole("region", { name }).getByRole("button", { name: "Pré-contrato" }).click();
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}`);

  await playDay(page);
  await expect(page.getByRole("list", { name: "Pedidos à diretoria" })).toContainText(`Contratação de ${name}: aprovada`);
  await pickOption(page.getByRole("combobox", { name: "Situação" }), "Todas");
  await page.getByRole("searchbox", { name: "Nome" }).fill(name);
  await expect(page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ hasText: name }).first()).toContainText("Pré-contrato assinado");
});

test("paying a release clause takes the player whatever his club thinks", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await openWindowDay(page);
  await openTheCheckbook(page);
  await barOf(page).getByRole("link", { name: "Busca" }).click();
  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Série D");
  await page.getByRole("switch", { name: "Só quem toparia vir" }).check();
  // A player his club sells has a fee, and a clause to pay: neither on loan nor signed elsewhere.
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").first().textContent()) ?? "";
  await priced.getByRole("button").first().click();
  const chosen = page.getByRole("region", { name });
  await expect(chosen).toContainText("Multa");
  await chosen.getByRole("button", { name: /^Pagar a multa: R\$/ }).click();
  const desk = page.getByRole("list", { name: "Pedidos à diretoria" });
  await expect(desk).toContainText(`Multa rescisória de ${name}`);

  await playDay(page);
  await expect(desk).toContainText(`Multa rescisória de ${name}: aprovada`);
  await barOf(page).getByRole("link", { name: "Times" }).click();
  await expect(page.getByRole("table", { name: "Elenco do Flamengo" }).getByText(name, { exact: true })).toBeVisible();
});
