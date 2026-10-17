import { expect, test, type Page } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

// Boards start judging their coaches with the league games in April; by the end of June one has fired his.
const MAX_WAIT_DAYS = 200;
// A job the AI fills two weeks after it opened; the coach applies while a few days are left.
const FRESH_DAYS = 3;

/**
 * Plays one day at a time in the worker until an AI club has a job open since at most FRESH_DAYS days ago
 * that would take the coach; answers its name. An employed coach hears from no club smaller than his,
 * so the job has no offer on his table yet.
 */
async function waitForOpenJob(page: Page): Promise<string> {
  const clubId = await page.evaluate(
    async ({ maxDays, freshDays }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      for (let day = 0; day < maxDays; day++) {
        const [{ jobs }, { date, coach }] = await Promise.all([engine.coaches(), engine.read(["date", "coach"])]);
        const offered = new Set(coach.offers.map((offer) => offer.clubId));
        const fresh = jobs.find((job) => job.openedOn !== null && job.wouldHire && !offered.has(job.clubId) && Date.parse(date) - Date.parse(job.openedOn) <= freshDays * 86_400_000);
        if (fresh) return fresh.clubId;
        await engine.apply({ type: "advance", days: [{}] });
      }
      throw new Error(`no job opened in ${maxDays} days`);
    },
    { maxDays: MAX_WAIT_DAYS, freshDays: FRESH_DAYS },
  );
  return page.evaluate(async (id) => (await window.boleiroEngine?.read(["clubs"]))?.clubs[id]?.shortName ?? id, clubId);
}

/** Plays every day to the next season's second day in the worker and closes the season's turning points. */
async function playSeason(page: Page) {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { season } = await engine.read(["season"]);
    for (;;) {
      const { date } = await engine.read(["date"]);
      if (date >= `${season + 1}-01-02`) break;
      await engine.apply({ type: "advance", days: [{}] });
    }
    while (await engine.turningPoint()) await engine.apply({ type: "closeTurningPoint" });
  });
}

test("a coach resigns, applies for an open job from the job centre and is hired by that club", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "Bahia", club: "Bahia", coach: "Lucas" });
  const club = await waitForOpenJob(page);

  await bar(page).getByRole("link", { name: "Técnicos" }).click();
  await page.getByRole("button", { name: "Pedir demissão" }).click();
  const question = page.getByRole("alertdialog", { name: "Pedir demissão?" });
  await expect(question).toContainText("Bahia não contrata você de novo até o fim de 2028");
  await question.getByRole("button", { name: "Pedir demissão" }).click();

  const jobs = page.getByRole("list", { name: "Vagas" });
  await expect(jobs).toBeVisible();
  await expect(page.getByText("Sem clube.")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Perfil de Lucas" })).toContainText("pediu demissão");
  await jobs.getByRole("button", { name: `Candidatar-se: ${club}` }).click();
  await expect(page.getByRole("status").filter({ hasText: `${club} fez uma proposta` })).toBeVisible();

  await jobs.getByRole("link", { name: "Proposta na mesa" }).click();
  const offers = page.getByRole("list", { name: "Propostas" });
  await offers.getByRole("button", { name: new RegExp(club) }).click();
  await page.getByRole("button", { name: `Assinar com ${club}` }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: club })).toBeVisible();
});

test("after a season the coaches screen ranks the coaches with the player among them, and the clubs the CBF's way and the world's", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "Bahia", club: "Bahia", coach: "Lucas" });
  await bar(page).getByRole("link", { name: "Técnicos" }).click();
  await expect(page.getByText("Ninguém no ranking ainda.")).toBeVisible();

  await playSeason(page);
  await bar(page).getByRole("link", { name: "Times" }).click();
  await bar(page).getByRole("link", { name: "Técnicos" }).click();
  await expect(page.getByText("Ranking ao fim de 2026")).toBeVisible();
  const coaches = page.getByRole("tabpanel", { name: "Técnicos" }).getByRole("row");
  await expect(coaches.nth(10)).toBeVisible();
  await expect(coaches.filter({ hasText: "você" })).toContainText("Lucas");

  await coaches.nth(1).getByRole("button").click();
  await expect(page.getByRole("complementary")).toContainText("1º");

  await page.getByRole("tab", { name: "Ranking CBF" }).click();
  await expect(page.getByRole("tabpanel", { name: "Ranking CBF" }).getByRole("row").nth(10)).toBeVisible();
  await page.getByRole("tab", { name: "Ranking mundial" }).click();
  await expect(page.getByRole("tabpanel", { name: "Ranking mundial" }).getByRole("row").nth(10)).toBeVisible();
});
