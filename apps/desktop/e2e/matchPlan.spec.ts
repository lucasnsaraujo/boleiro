import { expect, test, type Page } from "@playwright/test";
import { leaveIncident, pickOption, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
// Rounds played until one has a red card or an injury of the coach's side for the plan to answer.
const MAX_ROUNDS = 8;
// The round's 4x clock: 110 ms per match minute (MS_PER_MINUTE in ui/screens/Round.tsx).
const FOUR_X_MINUTE_MS = 110;

async function openLineup(page: Page) {
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
  }
  await expect(lineup).toBeVisible();
  return lineup;
}

/** Sets a key on the plan page by clicking its key cap and pressing it. */
async function setKey(page: Page, name: string, key: string) {
  const plan = page.getByRole("dialog", { name: "Plano de jogo" });
  await plan.getByRole("button", { name: new RegExp(`^${name}:`) }).click();
  await page.keyboard.press(key);
  await expect(plan.getByRole("button", { name: `${name}: ${key.toUpperCase()}` })).toBeVisible();
}

/** Runs the paused page clock one 4x match minute. */
async function stepMinute(page: Page) {
  const minute = page.getByRole("region", { name: "Seu jogo" }).getByLabel("Minuto");
  const before = await minute.textContent();
  await page.clock.runFor(FOUR_X_MINUTE_MS);
  const stopped = page.getByRole("button", { name: "Pausar", pressed: true }).or(page.getByRole("button", { name: /Voltar ao clube|Encerrando/ }));
  await expect.poll(async () => (await minute.textContent()) !== before || (await stopped.count()) > 0, { intervals: [0, 20, 50, 100] }).toBe(true);
}

test("a match plan answers a red card or injury without a window, the tactics key cycles saved tactics, and the time-out key stops the round", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Tite" });

  const lineup = await openLineup(page);
  await lineup.getByRole("button", { name: "4-3-3" }).click();
  await lineup.getByRole("button", { name: /^Plano de jogo/ }).click();
  const plan = page.getByRole("dialog", { name: "Plano de jogo" });
  await plan.getByRole("group", { name: "Expulsão e lesão" }).getByRole("button", { name: "Manter o desenho" }).click();
  await plan.getByRole("button", { name: /Guardar a de agora: 4-3-3/ }).click();
  await setKey(page, "Trocar tática", "q");
  await setKey(page, "Tempo técnico", "p");
  await plan.getByRole("button", { name: "Escalação" }).click();
  await lineup.getByRole("button", { name: "4-4-2" }).click();
  await lineup.getByRole("button", { name: /^Plano de jogo/ }).click();
  await plan.getByRole("button", { name: /Guardar a de agora: 4-4-2/ }).click();
  await expect(plan.getByRole("list", { name: "Táticas salvas" }).getByRole("listitem")).toHaveCount(2);
  await plan.getByRole("button", { name: "Escalação" }).click();

  const band = page.getByRole("region", { name: "Seu jogo" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const subsLeft = page.getByRole("button", { name: /^Escalação/ });
  const window = page.getByRole("dialog", { name: /^(Expulso|Machucou):/ });
  const planChip = page.getByRole("listitem").filter({ hasText: "Plano" });
  let hasCycled = false;
  let isAnswered = false;
  for (let round = 0; round < MAX_ROUNDS && !isAnswered; round++) {
    if (round > 0) await openLineup(page);
    await page.clock.install();
    await lineup.getByRole("button", { name: "Começar a rodada" }).click();
    await expect(band).toBeVisible();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200);
    await page.getByRole("button", { name: "4x" }).click();

    if (!hasCycled) {
      await stepMinute(page);
      // Kicked off in the second saved tactics, the key goes to the first, then the second, then the first again.
      for (const [place, formation] of [
        [1, "4-3-3"],
        [2, "4-4-2"],
        [1, "4-3-3"],
      ] as const) {
        await page.keyboard.press("q");
        await expect(page.getByRole("status").filter({ hasText: `Tática ${place}` })).toContainText(formation);
      }
      await page.keyboard.press("p");
      await expect(lineup).toContainText(/· 4-3-3 · /);
      await expect(page.getByRole("button", { name: "Pausar" })).toHaveAttribute("aria-pressed", "true");
      await lineup.getByRole("button", { name: "Voltar ao jogo" }).click();
      await expect(lineup).toBeHidden();
      hasCycled = true;
    }

    while (!(await finishing.or(back).first().isVisible())) {
      await stepMinute(page);
      if (await planChip.isVisible()) {
        // The plan made its substitution at the incident's minute: no window, the clock still running, one substitution fewer.
        await expect(window).toBeHidden();
        await expect(subsLeft).toContainText(/[0-4] trocas?/);
        isAnswered = true;
      }
      if (await page.getByRole("button", { name: "Pausar", pressed: true }).isVisible()) {
        await leaveIncident(page);
        if (!(await finishing.or(back).first().isVisible())) await page.getByRole("button", { name: "4x" }).click();
      }
    }
    await page.clock.resume();
    await expect(back).toBeVisible();
    await back.click();
    await expect(page.getByRole("button", { name: "Jogar rodada" })).toBeVisible();
  }
  expect(hasCycled).toBe(true);
  expect(isAnswered).toBe(true);
});

test("under the house rule a coach can't change his side in a match that isn't a final: the band leaves it to his plan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série A");
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("bahia");
  const clubs = page.getByRole("list", { name: "Clubes" });
  await expect(clubs.getByRole("button", { name: "Bahia" })).not.toContainText("…");
  await clubs.getByRole("button", { name: "Bahia" }).click();
  await page.getByRole("button", { name: "Mudanças só nas finais" }).click();
  await expect(page.getByRole("button", { name: "Mudanças só nas finais" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Tite");
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page.getByRole("heading", { name: "Bahia" })).toBeVisible();

  const lineup = await openLineup(page);
  await lineup.getByRole("button", { name: /^Plano de jogo/ }).click();
  const plan = page.getByRole("dialog", { name: "Plano de jogo" });
  await expect(plan).toContainText("Regra da casa: fora das finais ninguém mexe no time durante o jogo.");
  await setKey(page, "Tempo técnico", "p");
  await plan.getByRole("button", { name: "Escalação" }).click();
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Escalação/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Só o plano/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Regra da casa" })).toContainText(/mudanças só nas finais/i);
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog", { name: "Escalação" })).toHaveCount(0);
});
