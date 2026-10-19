import { expect, test, type Page } from "@playwright/test";
import { bar, hubLoaded, passMoments, startAtClub } from "./flows.js";

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

/** Back to the hub through another screen, so it reads the game as the worker left it. */
async function backToHub(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
}

test("the tables' tabs show each competition's logo on a wide window: the Série A's real one, the Baiano's drawn in Bahia's colours", async ({ page }) => {
  // Up to 1365 px the tabs drop their logos to fit a FIFA cup year's twelve on one line.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "bahia", club: "Bahia", coach: "Rogério" });
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  const tabs = page.getByRole("tablist", { name: "Competições" });
  await expect(tabs.getByRole("tab", { name: "Série A" }).locator("img.comp-logo[data-logo='real']")).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Baiano" }).locator("img.comp-logo[data-logo='drawn']")).toBeVisible();
  await tabs.getByRole("tab", { name: "Baiano" }).click();
  await expect(tabs.getByRole("tab", { name: "Baiano" })).toHaveAttribute("aria-selected", "true");
});

test("the national team screen lists the coming tournaments' hosts, a future one under a logo the game drew for its hosts", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  await backToHub(page);
  await page.getByRole("link", { name: "Seleção", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Brasil" })).toBeVisible();
  await page.getByRole("tab", { name: "Jogos e tabelas" }).click();
  const hosts = page.getByRole("region", { name: "Próximas sedes" });
  const copa2030 = hosts.getByRole("listitem", { name: "Copa do Mundo 2030" });
  await expect(copa2030).toContainText("Espanha · Portugal · Marrocos");
  await expect(copa2030).toContainText(/Final: (Camp Nou, Barcelona|Estadio Santiago Bernabéu, Madri)/);
  await expect(copa2030.locator("img.comp-logo")).toHaveAttribute("data-logo", "drawn");
  await expect(hosts.getByRole("listitem", { name: "Copa do Mundo 2034" })).toContainText("Final: King Salman International Stadium, Riad");
  const copaAmerica = hosts.getByRole("listitem", { name: "Copa América 2028" });
  await expect(copaAmerica).toContainText("Equador");
  await expect(copaAmerica.locator("img.comp-logo")).toHaveAttribute("data-logo", "drawn");
});

test("the Libertadores final is played at its host's ground, which its match page names with the city", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "palmeiras", club: "Palmeiras", coach: "Tite" });
  // CONMEBOL plays the 2026 final in Montevideo (24 Nov in the game); the worker plays every day up to the day after.
  await fastForward(page, "2026-11-25");
  await backToHub(page);
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Libertadores" }).click();
  await page.getByRole("group", { name: "Fases" }).getByRole("button", { name: "Final", exact: true }).click();
  const bracket = page.getByRole("group", { name: "Libertadores, mata-mata" });
  await bracket.getByRole("button", { name: /^Ficha do jogo: / }).last().click();
  const file = page.getByRole("dialog", { name: "Ficha do jogo" });
  await expect(file).toContainText("Estadio Centenario, Montevidéu");
  await expect(file.locator("img.comp-logo").first()).toHaveAttribute("data-logo", "real");
});
