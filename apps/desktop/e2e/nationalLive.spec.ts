import { expect, test, type Page } from "@playwright/test";
import { bar, hubLoaded, passMoments, pauseClock, playLiveRound, startAtClub } from "./flows.js";

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

/** Starts a new game in `season` from world `seed` with the coach at `clubId`, and has the CBF offer him Brazil's job, through a save the worker loads back. */
async function startWithCbfOffer(page: Page, season: number, seed: number, clubId: string) {
  await page.evaluate(
    async ([first, world, coachClubId]) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      await engine.apply({ type: "newGame", seed: world, choices: { coachClubId, season: first } });
      const save: { game: { date: string; nations: { offer?: { teamId: string; expiresOn: string } } } } = JSON.parse(await engine.save());
      save.game.nations.offer = { teamId: "brazil", expiresOn: `${first}-12-31` };
      await engine.apply({ type: "load", save: JSON.stringify(save) });
    },
    [season, seed, clubId] as const,
  );
}

async function openNationalTeam(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
  await page.getByRole("link", { name: "Seleção", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Brasil" })).toBeVisible();
}

test("a CBF coach plays a South American qualifier live from Brazil's call-up and opens its match page", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  // CONMEBOL's 2030 qualifiers open in 2027 and start in its September window; world 2 keeps Bahia's coach in the job until then.
  await startWithCbfOffer(page, 2027, 2, "bahia-ba");
  await openNationalTeam(page);
  const offer = page.getByRole("region", { name: "Proposta: Brasil" });
  await offer.getByRole("button", { name: "Aceitar" }).click();
  await expect(offer).toBeHidden();

  // The eve of the window's first match day: the hub's play button stops on Brazil's qualifier, Série A resting.
  await fastForward(page, "2027-09-23");
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const play = page.getByRole("button", { name: "Jogar rodada" });
  for (let press = 0; press < 3 && !(await lineup.isVisible()); press++) {
    await play.click();
    await expect(lineup.or(play)).toBeVisible({ timeout: 60_000 });
  }
  await expect(lineup).toContainText("Eliminatórias Sul-Americanas 2030");
  await expect(lineup).toContainText("Brasil");
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  // The round shows Brazil as the coach's side, with the round's other qualifiers on the board.
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  // The round stands still while the board is read, so a slow machine can't play on into a window that stops it.
  await pauseClock(page);
  await expect(band).toContainText("Brasil");
  expect(await page.getByRole("button", { name: /^Ficha do jogo: / }).count()).toBeGreaterThanOrEqual(5);
  await playLiveRound(page);

  await openNationalTeam(page);
  const own = page.getByRole("button", { name: /^Ficha do jogo: .*Brasil/ }).first();
  await own.click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Eliminatórias Sul-Americanas 2030");
  await expect(panel.getByLabel(/^.+ \d+ x \d+ .+$/)).toBeVisible();
});

test("a World Cup match played result-only opens its page told again, with its real score", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  // Brazil–Morocco, Brazil's World Cup opener, is on 13 June 2026.
  await fastForward(page, "2026-06-14");
  await openNationalTeam(page);
  await page.getByRole("tab", { name: "Jogos e tabelas" }).click();
  const games = page.getByRole("list", { name: "Jogos do Brasil, Copa do Mundo 2026" });
  const opener = games.getByRole("listitem").first();
  const score = (await opener.locator("b").textContent()) ?? "";
  const [home, away] = score.split(" × ");
  await opener.getByRole("button", { name: "Ficha do jogo: Brasil x Marrocos" }).click();
  const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(panel.getByLabel(new RegExp(`^Brasil ${home} x ${away} Marrocos$`))).toBeVisible();
  await expect(panel).toContainText("Copa do Mundo 2026 · Grupo C");
});
