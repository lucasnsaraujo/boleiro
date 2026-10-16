import { expect, test, type Page } from "@playwright/test";
import { leaveIncident, playLiveRound } from "./flows.js";

// Seeds to try for a first match where VAR changes a call in the coach's match.
const MAX_SEEDS = 40;

/** A one-coach game at Flamengo, kicked off on a match day where VAR changes a call in Flamengo's match; that check's minute and decision. */
async function kickOffBeforeVarCheck(page: Page): Promise<{ minute: number; decision: string }> {
  await page.goto("/");
  await page.waitForFunction(() => window.boleiroEngine !== undefined);
  const check = await page.evaluate(async (maxSeeds) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (let seed = 1; seed <= maxSeeds; seed++) {
      await engine.apply({ type: "newGame", seed, choices: { coachClubId: "flamengo-rj" } });
      await engine.apply({ type: "playToMatchDay" });
      const round = await engine.apply({ type: "startRound" });
      const mine = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
      const found = mine?.events.find((e) => e.type === "varCheck" && e.decision !== "goalStands" && e.minute > 5 && e.minute < 88);
      if (found?.type === "varCheck") return { minute: found.minute, decision: found.decision };
    }
    throw new Error("no seed gives Flamengo's first match a VAR check");
  }, MAX_SEEDS);
  await page.evaluate(() => (location.hash = "#/round"));
  return check;
}

test("a live round stands still while VAR checks the coach's match, stamps the decision and plays on; the cover and the ficha name the referee", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const check = await kickOffBeforeVarCheck(page);
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  await expect(band.getByText(/^Árbitro /)).toBeVisible();
  await expect(band.locator(".live-ref em")).toHaveText("VAR");

  const sticker = band.getByRole("status").filter({ hasText: "VAR checando" });
  const minute = band.getByLabel("Minuto");
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  await page.getByRole("button", { name: "4x" }).click();
  // Goals against the coach and red cards stop the round on the way; it goes on at 4x after each.
  await expect(async () => {
    if (await paused.isVisible()) {
      if (!(await leaveIncident(page))) await page.getByRole("button", { name: "4x" }).click();
    }
    await expect(sticker).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 60_000 });

  await expect(minute).toHaveText("VAR");
  await expect(band.getByText("Revisão do VAR")).toBeVisible();
  await expect(sticker).toContainText(`${check.minute}'`);
  const stamps: Record<string, RegExp> = {
    goalRuledOut: /Gol anulado/i,
    goalAwarded: /Gol validado/i,
    penaltyAwarded: /Pênalti!/i,
    penaltyCancelled: /Pênalti desmarcado/i,
    redCardGiven: /Vermelho!/i,
    redCardCancelled: /Vermelho retirado/i,
  };
  await expect(sticker.getByText(stamps[check.decision] ?? /./)).toBeVisible({ timeout: 6_000 });
  await expect(sticker).toBeHidden({ timeout: 6_000 });
  await expect.poll(async () => Number((await minute.textContent())?.replace("'", "")), { timeout: 10_000 }).toBeGreaterThan(check.minute);

  const own = page.getByRole("button", { name: /^Ficha do jogo: .*Flamengo/ }).first();
  await own.click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByText(/^Árbitro .+ · VAR$/)).toBeVisible();
  await panel.getByRole("button", { name: "Fechar a ficha" }).click();
  await expect(panel).toBeHidden();

  await playLiveRound(page);
});
