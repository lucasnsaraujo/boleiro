import { expect, test } from "@playwright/test";

test("from a new game, a signing asked in the market is answered when the window opens, and the player screen renews", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Série A" }).click();
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("bahia");
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Bahia" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Bahia" }).click();
  await page.getByRole("button", { name: "Assumir o clube" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();

  const bar = page.getByRole("navigation", { name: "Telas" });
  await bar.getByRole("link", { name: "Mercado" }).click();
  await expect(page.getByText("Janela fechada · abre 5 jan")).toBeVisible();
  await page.getByRole("combobox", { name: "Divisão" }).selectOption("Série B");
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
  await bar.getByRole("link", { name: "Mercado" }).click();
  await expect(desk).toContainText(`Contratação de ${name}`);

  await bar.getByRole("link", { name: "Finanças" }).click();
  await expect(page.getByText("O primeiro fechamento sai em 1 fev.")).toBeVisible();
  await expect(desk).toContainText(`Contratação de ${name}`);

  await bar.getByRole("link", { name: "Clube" }).click();
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  const inbox = page.getByRole("list", { name: "Notícias" });
  await expect(inbox).toContainText(new RegExp(`Diretoria (aprova|recusa) a contratação de ${name}`));
  await expect(page.getByText("5 de janeiro de 2026")).toBeVisible();

  await bar.getByRole("link", { name: "Finanças" }).click();
  await expect(desk).toContainText(new RegExp(`Contratação de ${name}: (aprovada|recusada)`));

  await bar.getByRole("link", { name: "Elenco" }).click();
  const player = page.getByRole("table").getByRole("link").first();
  const own = (await player.textContent()) ?? "";
  await player.click();
  await page.getByRole("combobox", { name: "Anos" }).selectOption("3");
  await page.getByRole("button", { name: "Renovar" }).click();
  await expect(page.getByText(`Renovação de ${own} na mesa. A diretoria responde amanhã.`)).toBeVisible();
});
