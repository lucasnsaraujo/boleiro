import { expect, test } from "@playwright/test";
import { bar as barOf, news, pickOption, startAtClub } from "./flows.js";

test("from a new game, a signing asked in the market is answered when the window opens, and the player screen renews", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(page.getByText("Janela fechada · abre 5 jan")).toBeVisible();
  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Série B");
  // A player with a fee: under contract past this season, neither on loan nor in his last six months.
  const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
  const name = (await priced.getByRole("button").textContent()) ?? "";
  await priced.getByRole("button").click();
  await page.getByRole("region", { name }).getByRole("button", { name: "Comprar" }).click();
  const desk = page.getByRole("list", { name: "Pedidos à diretoria" });
  await expect(desk).toContainText(`Contratação de ${name}`);
  await expect(desk).toContainText("Fica na mesa até a janela abrir, em 5 jan.");

  await page.reload();
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
  await bar.getByRole("link", { name: "Busca" }).click();
  await expect(desk).toContainText(`Contratação de ${name}`);

  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Finanças" }).click();
  await expect(page.getByText("O primeiro fechamento sai em 1 fev.")).toBeVisible();
  await expect(desk).toContainText(`Contratação de ${name}`);

  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  const inbox = await news(page);
  await expect(inbox).toContainText(new RegExp(`Diretoria (aprova|recusa) a contratação de ${name}`));
  await expect(bar).toContainText("Seg, 5 jan");

  await page.getByRole("link", { name: "Finanças" }).click();
  await expect(desk).toContainText(new RegExp(`Contratação de ${name}: (aprovada|recusada)`));

  await bar.getByRole("link", { name: "Times" }).click();
  const player = page.getByRole("table", { name: "Elenco do Bahia" }).getByRole("link").first();
  const own = (await player.textContent()) ?? "";
  await player.click();
  await pickOption(page.getByRole("combobox", { name: "Anos" }), "3");
  await page.getByRole("button", { name: "Renovar" }).click();
  await expect(page.getByText(`Renovação de ${own} na mesa. A diretoria responde amanhã.`)).toBeVisible();
});
