import { expect, test, type Page } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

const FLA = "flamengo-rj";

/** What a fixture changes in the coach's record before the day that finds the moment. */
type Fixture = {
  coachClubId?: string | null;
  stints?: { clubId: string; from: string; until: string | null; left: string | null }[];
  trophies?: { season: number; competition: string; clubId: string }[];
  /** Filed seasons whose Série A table puts these clubs second, as near misses with the coach. */
  runnerUps?: { season: number; clubId: string }[];
  firing?: { position: number; targetPosition: number };
  pressure?: { opponentId: string; goalsFor: number; goalsAgainst: number; board: number; fans: number }[];
};

/**
 * Plays a day so the moments engine watches the coach, rewrites his record in the save as `fixture` says (a title,
 * a firing), loads it back and plays the next day, which finds the moment. Through the e2e build's engine hook.
 */
async function playFixture(page: Page, fixture: Fixture) {
  await page.evaluate(async (fx) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    await engine.apply({ type: "advance", days: [{}] });
    const save = JSON.parse(await engine.save());
    const game = save.game;
    const coach = game.history.coach;
    if (fx.stints) coach.stints = fx.stints;
    if (fx.trophies) coach.trophies = [...coach.trophies, ...fx.trophies];
    if (fx.runnerUps) {
      const empty = { A: [], B: [], C: [], D: [] };
      game.history.seasons = fx.runnerUps.map(({ season, clubId }) => ({ season, champions: { "serie-a": "palmeiras-sp" }, topScorers: {}, promoted: empty, relegated: empty, tables: { ...empty, A: ["palmeiras-sp", clubId] } }));
    }
    if (fx.firing) {
      coach.firings = [...coach.firings, { clubId: coach.stints.at(-1).clubId, date: game.date, ...fx.firing }];
      game.coach.contract = null;
    }
    if (fx.coachClubId !== undefined) game.coachClubId = fx.coachClubId;
    if (fx.pressure) coach.moments.pressure = fx.pressure.map((mark, index) => ({ ...mark, date: game.date, isHome: index % 2 === 0 }));
    await engine.apply({ type: "load", save: JSON.stringify(save) });
    await engine.apply({ type: "advance", days: [{}] });
  }, fixture);
}

/** Back to the club's screen from another one, so the hub reads the game the fixture left. */
async function openHub(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
}

test.describe("career moments", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await startAtClub(page, { division: "Série A", search: "Flamengo", club: "Flamengo", coach: "Rui Tavares" });
  });

  test("a title in the coach's first season gets the quick party, then the hub comes back", async ({ page }) => {
    await playFixture(page, { trophies: [{ season: 2026, competition: "serie-a", clubId: FLA }] });
    await openHub(page);
    const scene = page.getByRole("region", { name: "Campeão brasileiro: Série A" });
    await expect(scene).toBeVisible();
    await expect(scene).toHaveClass(/is-short/);
    await expect(scene.getByText("Seu primeiro título")).toBeVisible();
    // The quick party ends by itself in about two seconds and offers the way on.
    await expect(scene).toHaveAttribute("data-state", "ended", { timeout: 6_000 });
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/#\/hub$/);
    await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  });

  test("a title after seven seasons and two second places gets the long party: the drought, the near misses, Finalmente", async ({ page }) => {
    await playFixture(page, {
      stints: [{ clubId: FLA, from: "2019-01-01", until: null, left: null }],
      runnerUps: [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((season) => ({ season, clubId: season >= 2024 ? FLA : "gremio-rs" })),
      trophies: [{ season: 2026, competition: "serie-a", clubId: FLA }],
    });
    await openHub(page);
    const scene = page.getByRole("region", { name: "Campeão brasileiro: Série A" });
    await expect(scene).toHaveClass(/is-long/);
    await expect(scene.getByText("Vice da liga com você")).toHaveCount(2);
    // Still playing after the short party's whole length: the long one takes its time.
    await page.waitForTimeout(2_500);
    await expect(scene).toHaveAttribute("data-state", "playing");
    await page.keyboard.press("Escape");
    await expect(scene).toHaveAttribute("data-state", "ended");
    await expect(scene.getByRole("heading", { name: "Finalmente" })).toBeVisible();
  });

  test("a sacking after a losing run plays the night: the run, the clippings, the phone at night and the morning paper", async ({ page }) => {
    const run = ["palmeiras-sp", "vasco-rj", "botafogo-rj", "fluminense-rj", "corinthians-sp", "gremio-rs", "santos-sp", "bahia-ba", "cruzeiro-mg", "internacional-rs"];
    await playFixture(page, {
      coachClubId: null,
      stints: [{ clubId: FLA, from: "2026-01-01", until: "2026-01-02", left: "fired" }],
      firing: { position: 17, targetPosition: 1 },
      pressure: run.map((opponentId, index) => ({ opponentId, goalsFor: index % 3 === 0 ? 1 : 0, goalsAgainst: 2, board: 60 - index * 5, fans: 80 - index * 2 })),
    });
    await openHub(page);
    const scene = page.getByRole("region", { name: "Demitido: Flamengo" });
    await expect(scene).toBeVisible();
    await expect(scene.getByRole("heading", { name: "Nove jogos sem vencer" })).toBeVisible();
    await expect(scene.getByText("Nota oficial")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(scene).toHaveAttribute("data-state", "ended");
    await expect(scene.getByRole("heading", { name: "Demitido na madrugada" })).toBeVisible();
    await page.getByRole("button", { name: "Ver propostas" }).click();
    await expect(page).toHaveURL(/#\/offers$/);
  });

  test("the coach retires from Técnicos: the farewell replays the career as the album, then the trajectory keeps it", async ({ page }) => {
    await bar(page).getByRole("link", { name: "Técnicos" }).click();
    await page.getByRole("button", { name: "Encerrar carreira" }).click();
    await page.getByRole("alertdialog", { name: "Encerrar a carreira?" }).getByRole("button", { name: "Encerrar carreira" }).click();
    const farewell = page.getByRole("region", { name: "Aposentadoria: Rui Tavares" });
    await expect(farewell).toBeVisible();
    await expect(farewell).toHaveAttribute("data-state", "playing");
    await page.keyboard.press("Escape");
    await expect(farewell).toHaveAttribute("data-state", "ended");
    await expect(farewell.getByRole("heading", { name: "Rui Tavares", level: 1 })).toBeVisible();
    await expect(farewell.getByText("Homenagens")).toBeVisible();
    await page.getByRole("button", { name: "Ver a trajetória" }).click();

    await expect(page).toHaveURL(/#\/trajectory$/);
    const line = page.getByRole("region", { name: "Linha do tempo" });
    await expect(line.getByTitle(/^Flamengo · 2026 a 2026/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sua carreira" })).toBeVisible();
    await expect(page.getByText("Encerrar carreira")).toHaveCount(0);
  });
});
