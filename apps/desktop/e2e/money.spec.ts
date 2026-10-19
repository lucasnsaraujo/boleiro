import { expect, test } from "@playwright/test";
import { bar as barOf, news, startAtClub } from "./flows.js";

test("the hub shows the board and fan meters, and on the finances screen the coach takes a bank loan and plays a friendly for its fee", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  const meters = page.getByRole("region", { name: "Caixa, diretoria e torcida" });
  for (const name of ["Diretoria", "Torcida"]) {
    await expect(meters.getByRole("meter", { name })).toHaveAttribute("aria-valuenow", /^\d{1,3}$/);
  }
  const cashBefore = (await meters.getByText(/^R\$/).textContent()) ?? "";

  await page.getByRole("link", { name: "Finanças" }).click();
  await expect(page.getByRole("meter", { name: "Diretoria" })).toBeVisible();
  const bank = page.getByRole("region", { name: "Empréstimo do banco" });
  await bank.getByRole("button", { name: "Ver condições" }).click();
  await bank.getByRole("radio", { name: "24x" }).click();
  await bank.getByRole("button", { name: "Pegar empréstimo" }).click();
  await expect(bank).toContainText(/24 parcelas de R\$ [\d,]+ mi/);
  await expect(bank).toContainText("a pagar");
  await expect(bank.getByRole("button", { name: "Quitar" })).toBeEnabled();
  await expect(page.getByText(/^Caixa do Flamengo$/).locator("xpath=following-sibling::b")).not.toHaveText(cashBefore);

  const friendlies = page.getByRole("region", { name: "Amistosos" });
  const invitation = friendlies.getByRole("button", { name: "Aceitar amistoso" });
  await expect(invitation).toBeVisible();
  const fee = (await friendlies.locator(".of.hi .v").textContent())?.replace("cachê", "").trim() ?? "";
  await invitation.click();
  const booked = friendlies.getByRole("list", { name: "Amistosos marcados" });
  await expect(booked).toContainText(`+${fee}`);

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Times" }).click();
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(page.getByRole("button", { name: "Começar a rodada" }).or(page.getByRole("button", { name: "Jogar rodada", disabled: false })).first()).toBeVisible({ timeout: 60_000 });
  const inbox = await news(page);
  await expect(inbox).toContainText(new RegExp(`Amistoso: .+ \\d+ x \\d+ .+, cachê de ${fee.replace("$", "\\$")}`));

  await page.getByRole("link", { name: "Finanças" }).click();
  await expect(booked.getByRole("listitem").first()).toContainText(/\d+ x \d+/);
  await page.getByRole("tab", { name: /Temporada/ }).click();
  await expect(page.getByRole("region", { name: /^Temporada/ })).toContainText("Amistosos");
});
