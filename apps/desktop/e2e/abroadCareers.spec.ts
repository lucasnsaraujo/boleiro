import { expect, test, type Page } from "@playwright/test";
import { bar, pickOption, playLiveRound } from "./flows.js";

const MAX_PRESSES = 12;

/** Plays every day before `date` in the worker with no decisions, through the e2e build's engine hook. */
async function playDaysBefore(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

/** From the start menu, a solo career at Arsenal on the new game's default, Realista. */
async function startAtArsenal(page: Page) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Premier League · Inglaterra");
  await page.getByRole("list", { name: "Clubes" }).getByRole("button", { name: "Arsenal FC" }).click();
  await expect(page.getByRole("radio", { name: "Realista" })).toBeChecked();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Mikel");
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
}

// A game seed whose board keeps Arsenal's coach through 2026/27 and into the 2027/28 opener, with no decisions taken.
const ARSENAL_KEEPS_ITS_COACH = 1;

/** Starts the coach's game over from `seed`'s world at his club, through the e2e build's engine hook. */
async function startOverFrom(page: Page, seed: number) {
  await page.evaluate(async (from) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { coachClubId } = await engine.read(["coachClubId"]);
    await engine.apply({ type: "newGame", seed: from, choices: { coachClubId } });
  }, seed);
}

/** The first date of the coach's games in the competitions whose ids start with `prefix`, from `from` on. */
async function firstGameOf(page: Page, prefix: string, from = "0000"): Promise<string> {
  return page.evaluate(
    async ({ prefix, from }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      const { fixtures, coachClubId } = await engine.read(["fixtures", "coachClubId"]);
      const own = fixtures.filter((f) => f.competitionId.startsWith(prefix) && f.date >= from && (f.homeId === coachClubId || f.awayId === coachClubId));
      const first = own.map((f) => f.date).sort()[0];
      if (!first) throw new Error(`no game of ${prefix} for ${coachClubId ?? "nobody"}`);
      return first;
    },
    { prefix, from },
  );
}

/** Leaves the screen Brazil's turn of the year opens on the hub: its review, the board's verdict, then the new year. */
async function startNextYear(page: Page, year: number) {
  const seasonEnd = page.getByRole("heading", { name: `Fim da temporada ${year - 1}` });
  const agenda = bar(page).getByRole("link", { name: "Agenda" });
  // The hub shows the season's end once it reads the game again: by itself, or when it opens after another screen.
  await expect(seasonEnd.or(agenda)).toBeVisible();
  if (!(await seasonEnd.isVisible())) {
    await agenda.click();
    await bar(page).getByRole("link", { name: "Times" }).click();
  }
  await expect(seasonEnd).toBeVisible({ timeout: 60_000 });
  const board = page.getByRole("button", { name: "Ver a diretoria" });
  if (await board.isVisible()) await board.click();
  await page.getByRole("button", { name: `Começar ${year}` }).click();
  await expect(page).toHaveURL(/#\/hub$/);
}

/** Presses "Jogar rodada" until the lineup sheet opens, then starts the live round. */
async function startRound(page: Page) {
  await bar(page).getByRole("link", { name: "Times" }).click();
  const play = page.getByRole("button", { name: "Jogar rodada" });
  const sheet = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.locator("#hub-paper");
  for (let press = 0; press < MAX_PRESSES && !(await sheet.isVisible()); press++) {
    // A day with news opens the hub's paper over the play button; the dock's paper button shuts it.
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await play.click();
    await expect(sheet.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await sheet.getByRole("button", { name: "Começar a rodada" }).click();
}

test("a Realista career at Arsenal plays England's 2026/27 into Brazil's 2027, turns it on 1 July and opens 2027/28 live", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtArsenal(page);
  await startOverFrom(page, ARSENAL_KEEPS_ITS_COACH);
  const firstGame = await firstGameOf(page, "gb-eng-1-2026");
  expect(firstGame >= "2026-08-15").toBe(true);

  await playDaysBefore(page, "2027-02-01");
  await startNextYear(page, 2027);
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  const premierLeague = page.getByRole("table", { name: "Premier League" });
  // In Brazil's 2027 the Premier League's season is past its half, still its first tab.
  await expect(page.getByRole("tab", { name: "Premier League" })).toHaveAttribute("aria-selected", "true");
  await expect(premierLeague.getByRole("row")).toHaveCount(21);
  expect(Number(await premierLeague.getByRole("row").nth(1).getByRole("cell").nth(3).textContent())).toBeGreaterThan(19);

  await playDaysBefore(page, "2027-07-03");
  await bar(page).getByRole("link", { name: "Times" }).click();
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  // On 1 July England filed 2026/27 and drew 2027/28: no game played yet, the promoted clubs in.
  await expect(premierLeague.getByRole("row")).toHaveCount(21);
  await expect(premierLeague.getByRole("row").nth(1).getByRole("cell").nth(3)).toHaveText("0");

  const opening = await firstGameOf(page, "gb-eng-1-2027");
  expect(opening >= "2027-08-15").toBe(true);
  await playDaysBefore(page, opening);
  await startRound(page);
  const ownMatch = page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /Premier League/ }) }).locator(".live-r.human");
  await expect(ownMatch).toBeVisible();
  await playLiveRound(page);
});

test("Arsenal plays its Champions League match live, its result in the league phase's table", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtArsenal(page);
  const matchday = await firstGameOf(page, "champions-league-2026");
  expect(matchday).toBe("2026-09-08");
  await playDaysBefore(page, matchday);
  await startRound(page);
  const ownMatch = page.locator(".live-list").locator(".live-group", { has: page.getByRole("heading", { name: /Champions League/ }) }).locator(".live-r.human");
  await expect(ownMatch).toBeVisible();
  await playLiveRound(page);

  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Outras ligas" }).click();
  await pickOption(page.getByRole("combobox", { name: "Liga" }), "Champions League");
  const phase = page.getByRole("tabpanel", { name: "Champions League" }).getByRole("table", { name: "Fase de liga" });
  await expect(phase.getByRole("row").filter({ hasText: "Arsenal" }).getByRole("cell").nth(3)).toHaveText("1");
});

test("a Brazilian coach with a name hears from a club abroad and takes the job, its league joining the full tier", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("searchbox", { name: "Buscar clube" }).fill("flamengo");
  await page.getByRole("list", { name: "Clubes" }).getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Filipe");
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);

  // Two seasons behind him and a big name, through a save the worker loads back; then the days until a club abroad calls.
  const offered = await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const save: { game: { coach: { reputation: number }; history: { coach: { seasons: unknown[] } } } } = JSON.parse(await engine.save());
    save.game.history.coach.seasons = [2024, 2025].map((season) => ({ season, clubId: "flamengo-rj", position: 1, targetPosition: 4 }));
    save.game.coach.reputation = 100;
    await engine.apply({ type: "load", save: JSON.stringify(save) });
    for (let day = 0; day < 400; day++) {
      const { coach, clubs } = await engine.read(["coach", "clubs"]);
      const abroad = coach.offers.find((offer) => !(offer.clubId in clubs));
      if (abroad) return abroad.clubId;
      await engine.apply({ type: "advance", days: [{}] });
    }
    return null;
  });
  expect(offered).not.toBeNull();

  await page.evaluate(() => {
    window.location.hash = "#/offers";
  });
  const offers = page.getByRole("list", { name: "Propostas" });
  const line = offers.getByRole("button").filter({ hasText: /·/ });
  await expect(line).toHaveCount(1);
  await line.click();
  await page.getByRole("button", { name: /^Assinar com / }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  const { coachClubId, isFullTier, name } = await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { coachClubId, clubs, world } = await engine.read(["coachClubId", "clubs", "world"]);
    const club = coachClubId ? clubs[coachClubId] : undefined;
    const country = club?.abroad?.country;
    return { coachClubId, isFullTier: country ? world?.[country]?.isFullTier === true : false, name: club?.shortName ?? "" };
  });
  expect(coachClubId).toBe(offered);
  expect(isFullTier).toBe(true);
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
