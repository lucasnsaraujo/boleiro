import { expect, test } from "@playwright/test";
import { bar as barOf, startAtClub } from "./flows.js";

test("the assistant's screen: hand the ticket price back and forth and see the stadium follow, call a better assistant, and follow a signing he suggests", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  const bar = barOf(page);

  await page.getByRole("link", { name: "Auxiliar" }).click();
  const level = page.getByRole("meter", { name: "Nível do auxiliar" });
  await expect(level).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByText("Sem custo")).toBeVisible();

  // Off here, the stadium's switch is off too; back on, the stadium shows it on again.
  const tickets = page.getByRole("checkbox", { name: "Preço do ingresso" });
  await expect(tickets).toBeChecked();
  await tickets.click();
  await expect(tickets).not.toBeChecked();
  await bar.getByRole("link", { name: "Estádio" }).click();
  const stadiumSwitch = page.getByRole("switch", { name: /Auxiliar define o preço/ });
  await expect(stadiumSwitch).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Subir o preço" })).toBeEnabled();
  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Auxiliar" }).click();
  await page.getByRole("checkbox", { name: "Preço do ingresso" }).click();
  await expect(page.getByRole("checkbox", { name: "Preço do ingresso" })).toBeChecked();
  await bar.getByRole("link", { name: "Estádio" }).click();
  await expect(stadiumSwitch).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Subir o preço" })).toBeDisabled();

  // The lineup switch changes what he says he does on match day.
  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Auxiliar" }).click();
  await page.getByRole("checkbox", { name: "Escalação" }).click();
  await expect(page.getByText("o seu último time")).toBeVisible();
  await page.getByRole("checkbox", { name: "Escalação" }).click();
  await expect(page.getByText("o melhor time")).toBeVisible();

  // The cheapest better assistant the board pays for takes the job.
  const candidates = page.getByRole("list", { name: "Auxiliares para chamar" });
  const first = candidates.getByRole("listitem").first();
  const name = (await first.locator("b").first().textContent()) ?? "";
  await first.getByRole("button", { name: `Chamar ${name}` }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(level).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByText("por mês").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Dispensar e voltar ao auxiliar do clube" })).toBeVisible();

  // His first suggestion opens on the market, and the offer goes to the board.
  const suggestions = page.getByRole("list", { name: "Indicações do auxiliar" });
  const offer = suggestions.getByRole("link", { name: /^Fazer proposta por / }).first();
  const signing = ((await offer.getAttribute("aria-label")) ?? "").replace("Fazer proposta por ", "");
  await offer.click();
  await expect(page).toHaveURL(/#\/market\?jogador=/);
  await expect(page.getByRole("group", { name: "O auxiliar indica" })).toContainText(signing);
  await page.getByRole("region", { name: signing }).getByRole("button", { name: "Comprar" }).click();
  const desk = page.getByRole("list", { name: "Pedidos à diretoria" });
  await expect(desk).toContainText(`Contratação de ${signing}`);
});
