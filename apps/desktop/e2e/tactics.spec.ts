import { expect, test } from "@playwright/test";
import { leaveIncident, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// Half-time and every goal against, red card or injury of the coach's side stop the clock.
const MAX_STOPS = 30;

test("set the four dials from the lineup, follow the assistant, play the round and change posture mid-match", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }

  await lineup.getByRole("button", { name: /^Tática/ }).click();
  const tactics = page.getByRole("dialog", { name: "Tática" });
  await expect(tactics).toBeVisible();
  await tactics.getByRole("group", { name: "Postura" }).getByRole("button", { name: "Contra-ataque" }).click();
  await expect(tactics).toContainText("Chances suas");
  await tactics.getByRole("group", { name: "Marcação" }).getByRole("button", { name: "Muito pesada" }).click();
  await tactics.getByRole("group", { name: "Jogada" }).getByRole("button", { name: "Pelas pontas" }).click();
  await expect(tactics).toContainText("Suas pontas");
  await expect(tactics).toContainText(/o auxiliar mudaria \d de 4/);

  await tactics.getByRole("button", { name: "Seguir o auxiliar em tudo" }).click();
  await expect(tactics).toContainText("tudo como o auxiliar");
  await expect(tactics.getByRole("button", { name: "Seguir o auxiliar em tudo" })).toBeDisabled();
  await expect(tactics.getByText("Igual ao auxiliar")).toHaveCount(4);
  const posture = await tactics.getByRole("group", { name: "Postura" }).locator("[aria-pressed=true]").innerText();

  await tactics.getByRole("button", { name: "Escalação" }).click();
  await expect(tactics).toBeHidden();
  await expect(lineup).toContainText(`· ${posture.toLowerCase()}`);
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  await page.getByRole("button", { name: "4x" }).click();

  const back = page.getByRole("button", { name: "Voltar ao clube" });
  let hasChanged = false;
  for (let stop = 0; stop < MAX_STOPS && !(await back.isVisible()); stop++) {
    await expect(page.getByRole("button", { name: "Pausar" }).and(page.locator("[aria-pressed=true]")).or(back)).toBeVisible({ timeout: 20_000 });
    if (await back.isVisible()) break;
    await leaveIncident(page);
    if (!hasChanged) {
      await page.getByRole("button", { name: /^Escalação/ }).click();
      await lineup.getByRole("button", { name: /^Tática/ }).click();
      await expect(tactics).toContainText(/\d+' · (vencendo|perdendo|empatado)/);
      const next = posture === "Retranca" ? "Ofensiva" : "Retranca";
      await tactics.getByRole("group", { name: "Postura" }).getByRole("button", { name: next }).click();
      await expect(tactics).toContainText("Vale a partir do próximo minuto.");
      await tactics.getByRole("button", { name: "Escalação" }).click();
      await expect(lineup).toContainText(`· ${next.toLowerCase()}`);
      await lineup.getByRole("button", { name: "Voltar ao jogo" }).click();
      await expect(lineup).toBeHidden();
      await page.getByRole("button", { name: /^Escalação/ }).click();
      await expect(lineup).toContainText(`· ${next.toLowerCase()}`);
      await lineup.getByRole("button", { name: "Voltar ao jogo" }).click();
      hasChanged = true;
    }
    await page.getByRole("button", { name: "4x" }).click();
  }
  expect(hasChanged).toBe(true);
  await expect(band).toContainText("Fim de jogo");
});
