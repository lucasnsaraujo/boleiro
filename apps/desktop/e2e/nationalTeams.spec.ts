import { expect, test, type Page } from "@playwright/test";
import { bar, news, startAtClub } from "./flows.js";

/** Plays every day up to `date` in the worker with no decisions, through the e2e build's engine hook. */
async function fastForward(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

/** Starts a new game in `season` from world `seed` with the coach at `clubId`, through the e2e build's engine hook. */
async function startOverIn(page: Page, season: number, seed: number, clubId: string) {
  await page.evaluate(async ([first, world, coachClubId]) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    await engine.apply({ type: "newGame", seed: world, choices: { coachClubId, season: first } });
  }, [season, seed, clubId] as const);
}

async function openNationalTeam(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  await page.getByRole("link", { name: "Seleção", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Brasil" })).toBeVisible();
}

test("the March FIFA window takes a called-up player from the coach's club and gives him back, and the national-team screen shows the call-up and a group table", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  // The national coaches call up on the eve of the window (23–31 Mar 2026).
  await fastForward(page, "2026-03-23");
  await openNationalTeam(page);
  const leaving = page.getByRole("region", { name: "Saem do Flamengo" });
  const away = leaving.getByRole("listitem").first().locator("b");
  await expect(away).toBeVisible();
  const name = (await away.textContent()) ?? "";
  expect(name).not.toBe("");
  await expect(page.getByRole("region", { name: "Data Fifa" })).toContainText("23 a 31 mar");

  // Brazil's call-up has its places by position, Flamengo's men marked as the coach's.
  await expect(page.getByRole("group", { name: "Goleiros" }).getByRole("listitem", { name: /força/ })).toHaveCount(3);
  await expect(page.getByRole("tabpanel", { name: "Convocação" }).getByRole("listitem", { name: /, seu clube$/ }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Jogos e tabelas" }).click();
  const group = page.getByRole("table", { name: "Copa do Mundo 2026, grupo C" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("row", { name: /Brasil/ })).toBeVisible();
  await page.getByRole("tab", { name: "Ranking Fifa" }).click();
  await expect(page.getByRole("tabpanel", { name: "Ranking Fifa" })).toContainText("Espanha");

  // The day after the window he is back at the club; the box turns to a preview of the next window.
  await fastForward(page, "2026-04-01");
  await bar(page).getByRole("link", { name: "Times" }).click();
  await expect(await news(page)).toContainText("volta da seleção");
  await openNationalTeam(page);
  await expect(page.getByRole("region", { name: "Saem do Flamengo" })).toContainText("Prévia pelas listas prováveis.");
});

test("Brazil's screen shows the South American qualifiers' table with the two matches the September 2027 window has played", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  // The app starts every game in 2026; CONMEBOL's 2030 qualifiers open in 2027 and start in its September window.
  // World 1 keeps Bahia's coach in the job until then (the e2e world's 2027 sacks him in June).
  await startOverIn(page, 2027, 1, "bahia-ba");
  await fastForward(page, "2027-09-28");
  await openNationalTeam(page);
  await page.getByRole("tab", { name: "Jogos e tabelas" }).click();
  const table = page.getByRole("table", { name: "Eliminatórias Sul-Americanas 2030, classificação" });
  await expect(table.getByRole("row")).toHaveCount(11);
  const brazil = table.getByRole("row", { name: /Brasil/ });
  await expect(brazil.getByRole("cell").first()).toHaveText("2");
});
