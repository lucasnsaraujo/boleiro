import { expect, test, type Page } from "@playwright/test";
import { playLiveRoundUntil, startAtClub } from "./flows.js";

const MAX_PRESSES = 5;
const MAX_ROUNDS = 4;

test("the first click starts the menu music, and the sound settings survive a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const theme = page.waitForResponse((response) => response.url().includes("menu-theme") && response.ok());
  await page.getByRole("link", { name: "Opções" }).click();
  await theme;
  expect(await page.evaluate(() => typeof AudioContext)).toBe("function");

  await expect(page.getByRole("heading", { name: "Opções" })).toBeVisible();
  await page.getByRole("slider", { name: "Música" }).fill("25");
  await page.getByRole("checkbox", { name: "Sem som" }).check();
  await expect(page.getByRole("list", { name: "Créditos" }).getByRole("listitem")).toHaveCount(10);

  await page.reload();
  await expect(page.getByRole("slider", { name: "Música" })).toHaveValue("25");
  await expect(page.getByRole("checkbox", { name: "Sem som" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("the crowd and the clicks keep their own volumes after a reload, and M mutes and unmutes from any screen", async ({ page }) => {
  await page.goto("/#/options");
  await page.getByRole("slider", { name: "Torcida" }).fill("85");
  await page.getByRole("slider", { name: "Cliques" }).fill("10");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Torcida" })).toHaveValue("85");
  await expect(page.getByRole("slider", { name: "Cliques" })).toHaveValue("10");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Opções" })).toBeVisible();
  await page.keyboard.press("m");
  await page.reload();
  await page.getByRole("link", { name: "Opções" }).click();
  await expect(page.getByRole("checkbox", { name: "Sem som" })).toBeChecked();
  await expect(page.getByRole("slider", { name: "Torcida" })).toBeDisabled();
  await page.keyboard.press("m");
  await expect(page.getByRole("checkbox", { name: "Sem som" })).not.toBeChecked();
});

/** The goals the coach's side scores in the round on screen, read from its timeline at kick-off. */
function ownGoals(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const round = await window.boleiroEngine?.liveRound();
    const ours = round?.matches.find((match) => match.fixtureId === round.coach?.fixtureId);
    return ours?.events.filter((event) => event.type === "goal" && event.clubId === round?.coachClubId).length ?? 0;
  });
}

test("a goal of the coach's side roars from its end and plays the goal stinger", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await page.clock.install();
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe Luís" });
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const back = page.getByRole("button", { name: "Voltar ao clube" });

  let goals = 0;
  for (let round = 0; round < MAX_ROUNDS && goals === 0; round++) {
    await page.evaluate(() => window.boleiroCues?.splice(0));
    for (let press = 0; press < MAX_PRESSES && !(await lineup.isVisible()); press++) {
      await page.getByRole("button", { name: "Jogar rodada" }).click();
      await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible();
    }
    await lineup.getByRole("button", { name: "Começar a rodada" }).click();
    await expect(page.getByRole("region", { name: "Seu jogo" })).toBeVisible();
    goals = await ownGoals(page);
    await playLiveRoundUntil(page, null);
    const cues = await page.evaluate(() => window.boleiroCues ?? []);
    expect(cues.includes("goalStinger")).toBe(goals > 0);
    if (goals > 0) expect(cues.some((cue) => cue === "coachGoal" || cue === "coachGoalAway" || cue === "comeback")).toBe(true);
    await page.clock.resume();
    await back.click();
    await expect(page.getByRole("region", { name: "Seu jogo" })).toBeHidden();
  }
  expect(goals).toBeGreaterThan(0);
});
