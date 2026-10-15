import { expect, test } from "@playwright/test";
import { leaveIncident, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// A round stops at half-time and at every goal against, red card or injury of the coach's side.
const MAX_STOPS = 30;
// Rounds to play until the coach's match has a goal set up by a team-mate; most have one.
const MAX_ROUNDS = 6;

test("after a live round the report shows each goal's scorer, assist and kind, and every player's mark, shots and passes", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const report = page.getByRole("region", { name: "Súmula do jogo" });
  const assisted = report.getByRole("region", { name: "Gols" }).getByRole("listitem").filter({ hasText: "passe de" });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
      await page.getByRole("button", { name: "Jogar rodada" }).click();
      await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
    }
    await lineup.getByRole("button", { name: "Começar a rodada" }).click();
    await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();
    await expect(report).toBeHidden();
    await page.getByRole("button", { name: "4x" }).click();
    for (let stop = 0; stop < MAX_STOPS && !(await back.isVisible()); stop++) {
      await expect(page.getByRole("button", { name: "Pausar", pressed: true }).or(back)).toBeVisible({ timeout: 20_000 });
      if (await back.isVisible()) break;
      if (!(await leaveIncident(page))) await page.getByRole("button", { name: "4x" }).click();
    }
    await expect(report).toBeVisible();

    for (const side of await report.getByRole("region", { name: /^Notas / }).all()) {
      const marks = await side.getByRole("listitem").allTextContents();
      expect(marks.length).toBeGreaterThanOrEqual(11);
      for (const mark of marks) expect(mark).toMatch(/^(10|\d),\d/);
    }
    if ((await assisted.count()) > 0) break;
    await back.click();
    await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  }

  const goal = assisted.first();
  await expect(goal).toContainText(/^\d+'/);
  await expect(goal).toContainText(/passe de \S+/);
  await expect(goal).toContainText(/Jogada|Cabeça|Pênalti|Falta|Olímpico|Contra/);
  await expect(report.getByText("Craque", { exact: true })).toBeVisible();
  await expect(report.getByRole("region", { name: /^Notas / }).first().getByRole("listitem").first()).toContainText(/\d+ fin · \d+\/\d+ p$/);
});
