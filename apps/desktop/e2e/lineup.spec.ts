import { expect, test } from "@playwright/test";
import { leaveIncident, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// Half-time and every goal against, red card or injury of the coach's side stop the clock.
const MAX_STOPS = 30;

test("open the lineup, put a forward at centre-back and see what it costs, let the assistant pick the team, and play the round", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }
  const pitch = lineup.getByRole("group", { name: "Titulares" });
  await expect(pitch.getByRole("button")).toHaveCount(11);
  await expect(pitch).not.toContainText("Improvisado");
  const strength = lineup.getByText("Força do time").locator("..");
  const before = await strength.textContent();

  await pitch.getByRole("button").filter({ has: page.locator(".pos.Z") }).first().click();
  await lineup.getByRole("list", { name: "Banco" }).locator("button:enabled", { has: page.locator(".pos.A") }).first().click();
  await expect(pitch).toContainText(/Improvisado (na zaga|na lateral) −15%/);
  await expect(strength).toContainText("vs auxiliar");
  expect(await strength.textContent()).not.toBe(before);

  await lineup.getByRole("button", { name: "Escalar time" }).click();
  await expect(pitch).not.toContainText("Improvisado");
  await expect(strength).not.toContainText("vs auxiliar");

  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  for (let stop = 0; stop < MAX_STOPS && !(await back.isVisible()); stop++) {
    if (!(await leaveIncident(page))) await page.getByRole("button", { name: "4x" }).click();
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(back)).toBeVisible({ timeout: 20_000 });
  }
  await expect(band).toContainText("Fim de jogo");
  await back.click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();
});
