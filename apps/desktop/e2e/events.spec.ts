import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, news, startAtClub } from "./flows.js";

// About two seasons of play-ons; an event asks the coach every week or two, a press conference far less often.
const MAX_STEPS = 400;

/**
 * Plays on in the worker, through the e2e build's engine hook, until an event of the look asked for waits
 * for the coach with an answer that moves the fans or the board; any other event is left to the assistant.
 * Returns the index of that answer, the one that moves them the most.
 */
async function playUntilEvent(page: Page, look: "card" | "press"): Promise<number> {
  const choice = await page.evaluate(
    async ({ wanted, maxSteps }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      for (let step = 0; step < maxSteps; step++) {
        const pending = await engine.pendingEvent();
        const weights = (pending?.choices ?? []).map((c) => Math.abs(c.effects.fans ?? 0) + Math.abs(c.effects.board ?? 0));
        if (pending?.look === wanted && Math.max(...weights) > 0) return weights.indexOf(Math.max(...weights));
        if (pending) await engine.apply({ type: "answerEvent", choice: null });
        // A sacked coach takes his first offer, so the events keep coming.
        const { coachClubId, coach } = await engine.read(["coachClubId", "coach"]);
        if (!coachClubId && coach.offers[0]) await engine.apply({ type: "advance", days: [{ acceptOffer: coach.offers[0].clubId }] });
        const { stop, daysPlayed } = await engine.apply({ type: "playToMatchDay" });
        if (stop === "matchDay" && daysPlayed === 0) {
          await engine.apply({ type: "startRound" });
          await engine.apply({ type: "finishRound" });
        }
        for (let point = await engine.turningPoint(); point; point = await engine.turningPoint()) await engine.apply({ type: "closeTurningPoint" });
      }
      return -1;
    },
    { wanted: look, maxSteps: MAX_STEPS },
  );
  expect(choice, `an event of look ${look} asks the coach within ${MAX_STEPS} play-ons`).toBeGreaterThanOrEqual(0);
  // The hub reads the game when it opens.
  await barOf(page).getByRole("link", { name: "Tabelas" }).click();
  await barOf(page).getByRole("link", { name: "Times" }).click();
  return choice;
}

async function meterValues(page: Page) {
  const meters = page.getByRole("region", { name: "Caixa, diretoria e torcida" });
  const value = async (name: string) => Number(await meters.getByRole("meter", { name }).getAttribute("aria-valuenow"));
  return { board: await value("Diretoria"), fans: await value("Torcida") };
}

test("an event pinned in the hub opens, the coach's answer moves the club's meters, and the round's newspaper prints real headlines", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  const choice = await playUntilEvent(page, "card");

  const note = page.getByRole("region", { name: "Assunto esperando resposta" });
  await expect(note).toBeVisible();
  const headline = (await note.getByRole("heading").textContent()) ?? "";
  await note.getByRole("button", { name: "Responder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: headline });
  await expect(dialog).toBeVisible();
  const before = await meterValues(page);
  const answer = dialog.getByRole("radio").nth(choice);
  await answer.click();
  await expect(answer).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Responder", exact: true }).click();
  const outcome = dialog.getByRole("status");
  await expect(outcome).toBeVisible();
  const outcomeHeadline = (await outcome.locator("b").textContent()) ?? "";
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toBeHidden();
  await expect.poll(async () => JSON.stringify(await meterValues(page))).not.toBe(JSON.stringify(before));
  await expect(await news(page)).toContainText(outcomeHeadline);

  // The paper leads with the coach's match from his first one on; the archive needs a second.
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const hasTwoMatchEditions = async () => {
      const [, older] = await engine.newspaperEditions();
      return !!older && !!(await engine.newspaper())?.match && !!(await engine.newspaper(older.date))?.match;
    };
    while (!(await hasTwoMatchEditions())) {
      const { stop, daysPlayed } = await engine.apply({ type: "playToMatchDay" });
      if (stop === "matchDay" && daysPlayed === 0) {
        await engine.apply({ type: "startRound" });
        await engine.apply({ type: "finishRound" });
      }
    }
  });
  await (await news(page)).isVisible();
  await page.getByRole("link", { name: "Jornal da rodada" }).click();
  const sheet = page.getByRole("article", { name: /^Jornal do Boleiro/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(/Flamengo/);
  await expect(sheet).toContainText(/Resultados/);
  const editions = page.getByRole("complementary", { name: "Edições" });
  const older = editions.getByRole("button").nth(1);
  const olderHeadline = (await older.locator("b").textContent()) ?? "";
  await older.click();
  await expect(older).toHaveAttribute("aria-current", "page");
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(olderHeadline);
});

test("at a press conference the coach's answer moves the fans or the board", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  const choice = await playUntilEvent(page, "press");

  const note = page.getByRole("region", { name: "Assunto esperando resposta" });
  await note.getByRole("button", { name: "Ir à coletiva" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Jornal do Boleiro");
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  const before = await meterValues(page);
  await dialog.getByRole("radio").nth(choice).click();
  await dialog.getByRole("button", { name: "Responder", exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect.poll(async () => JSON.stringify(await meterValues(page))).not.toBe(JSON.stringify(before));
});
