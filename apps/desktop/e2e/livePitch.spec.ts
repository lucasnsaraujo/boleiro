import { expect, test, type Page } from "@playwright/test";

const ANA = { name: "Ana", clubId: "flamengo-rj" };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };
// Seeds to try for a first match whose first goal is the coach's own, early enough to wait for at 1x.
const MAX_SEEDS = 40;
const EARLIEST_GOAL = 4;
const LATEST_GOAL = 30;
// Turns and match days to go through until both coaches play on the same day.
const MAX_STEPS = 200;

/** Waits for the e2e build's engine hook. */
async function openGame(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => window.boleiroEngine !== undefined);
}

/** A one-coach game at Bahia, kicked off on a match day where Bahia scores first; the minute of that goal. */
async function kickOffBeforeOwnGoal(page: Page): Promise<number> {
  await openGame(page);
  const minute = await page.evaluate(
    async ({ maxSeeds, earliest, latest }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      for (let seed = 18; seed <= maxSeeds; seed++) {
        await engine.apply({ type: "newGame", seed, choices: { coachClubId: "bahia-ba" } });
        await engine.apply({ type: "playToMatchDay" });
        const round = await engine.apply({ type: "startRound" });
        const mine = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
        const first = mine?.events.find((e) => e.type === "goal" || e.type === "card" || e.type === "injury" || e.type === "penaltyMiss");
        if (first?.type === "goal" && first.clubId === round.coachClubId && first.minute >= earliest && first.minute <= latest) return first.minute;
      }
      throw new Error("no seed gives Bahia an early first goal");
    },
    { maxSeeds: MAX_SEEDS, earliest: EARLIEST_GOAL, latest: LATEST_GOAL },
  );
  await page.evaluate(() => (location.hash = "#/round"));
  return minute;
}

/** A two-coach game of Ana at Flamengo and Bruno at Palmeiras, kicked off on the first day both play. */
async function kickOffTwoCoaches(page: Page) {
  await openGame(page);
  await page.evaluate(
    async ({ ana, bruno, maxSteps }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      await engine.apply({ type: "newGame", seed: 3, choices: { coachClubId: ana.clubId, hotSeat: { coachName: ana.name, otherCoaches: [bruno] } } });
      for (let step = 0; step < maxSteps; step++) {
        if (!(await engine.hotSeat())?.isLastTurn) {
          await engine.apply({ type: "passTurn" });
          continue;
        }
        if ((await engine.apply({ type: "playToMatchDay" })).daysPlayed > 0) continue;
        const round = await engine.apply({ type: "startRound" });
        if (new Set(round.humanSides?.map((side) => side.fixtureId)).size === 2) return;
        await engine.apply({ type: "finishRound" });
      }
      throw new Error("both coaches play on some day");
    },
    { ana: ANA, bruno: BRUNO, maxSteps: MAX_STEPS },
  );
  await page.evaluate(() => (location.hash = "#/round"));
}

test("a live round plays the coach's match on the board; in play the score stickers lift off it, and a goal drops them back", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const goalMinute = await kickOffBeforeOwnGoal(page);
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  const board = band.locator(".live-pitch .lp");
  await expect(board).toBeVisible();
  await expect(board.locator(".lp-tok")).toHaveCount(22);

  const stickers = band.locator(".live-mid");
  const minute = band.getByLabel("Minuto");
  const minuteNow = async () => Number((await minute.textContent())?.replace("'", ""));
  await page.getByRole("button", { name: "1x" }).click();
  await expect.poll(minuteNow).toBeGreaterThanOrEqual(2);
  await expect(stickers).toHaveClass(/is-lifted/);
  await expect(band.locator(".live-duel")).toHaveCSS("opacity", "0");

  await expect.poll(minuteNow, { timeout: 60_000 }).toBeGreaterThanOrEqual(goalMinute);
  await expect(stickers).not.toHaveClass(/is-lifted/);
  await expect(band.locator(".live-duel")).toHaveCSS("opacity", "1");
  await expect(band.getByLabel(/ 0 x 1 | 1 x 0 /)).toBeVisible();
  // A moment later, with the ball back in play, they lift again.
  await expect(stickers).toHaveClass(/is-lifted/, { timeout: 6_000 });
});

test("in a two-coach round the boards stand side by side at 1600 px, and at 1024 px one is in focus with arrows to the other", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await kickOffTwoCoaches(page);
  const band = page.getByRole("region", { name: "Seu jogo" });
  const board = (coach: string) => band.getByRole("region", { name: new RegExp(`^${coach}: `) });
  await expect(board(ANA.name)).toBeVisible();
  await expect(board(BRUNO.name)).toBeVisible();
  const [ana, bruno] = [await board(ANA.name).boundingBox(), await board(BRUNO.name).boundingBox()];
  expect(ana && bruno && bruno.x >= ana.x + ana.width).toBe(true);
  expect(ana && ana.width >= 360).toBe(true);
  await expect(band.getByRole("button", { name: "Próximo técnico" })).toHaveCount(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  const next = band.getByRole("button", { name: "Próximo técnico" });
  await expect(next).toBeVisible();
  await expect(board(ANA.name)).toHaveAttribute("aria-current", "true");
  await next.click();
  await expect(board(BRUNO.name)).toHaveAttribute("aria-current", "true");
  await expect(board(ANA.name)).not.toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(board(ANA.name)).toHaveAttribute("aria-current", "true");
});
