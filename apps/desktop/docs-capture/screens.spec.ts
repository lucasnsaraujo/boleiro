import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { backToStart, bar, hubLoaded, leaveIncident, momentScene, passMoments, pauseClock, pickOption, playSeasonThroughScreens, startAtClub, startNextSeason } from "../e2e/flows.js";

const THEME = process.env.SHOT_THEME === "dark" ? "dark" : "light";
const OUT = process.env.SHOTS_DIR ?? "/tmp/boleiro-shots";
const DIR = `${OUT}/${THEME}`;
const FOUR_X_MINUTE_MS = 110;
const SETTLE_MS = 450;
const FLA = "flamengo-rj";
const LOSING_RUN = ["palmeiras-sp", "vasco-rj", "botafogo-rj", "fluminense-rj", "corinthians-sp", "gremio-rs", "santos-sp", "bahia-ba", "cruzeiro-mg", "internacional-rs"];

const taken: string[] = [];
const skipped: { slug: string; reason: string }[] = [];

async function shot(page: Page, slug: string) {
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: `${DIR}/${slug}.png` });
  taken.push(slug);
}

/** Runs one capture; a screen that can't be reached is listed as skipped instead of ending the run, and any dialog it left open is closed. */
async function attempt(page: Page, slug: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    skipped.push({ slug, reason: String(error).split("\n").slice(0, 4).join(" ") });
    for (let press = 0; press < 3; press++) await page.keyboard.press("Escape");
  }
}

const go = (page: Page, hash: string) => page.evaluate((to) => (location.hash = to), `#${hash}`);

async function fastForward(page: Page, date: string) {
  await page.evaluate(async (until) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date: today } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }, date);
}

/** Back to the hub so it reads the game as the engine left it. */
async function reopenHub(page: Page) {
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
}

async function openLineup(page: Page) {
  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const paper = page.getByRole("dialog", { name: "Jornal" });
  for (let press = 0; press < 12 && !(await lineup.isVisible()); press++) {
    if (await paper.isVisible()) await page.getByRole("button", { name: /^Jornal/ }).click();
    await page.getByRole("button", { name: "Jogar rodada" }).click();
    await expect(page.getByRole("button", { name: "Jogar rodada" }).or(lineup)).toBeVisible({ timeout: 60_000 });
  }
  await expect(lineup).toBeVisible();
  return lineup;
}

async function stepMinute(page: Page) {
  const band = page.getByRole("region", { name: "Seu jogo" });
  const minute = band.getByLabel("Minuto");
  const before = await minute.textContent();
  await page.clock.runFor(FOUR_X_MINUTE_MS);
  // A VAR check stands the clock still for a few seconds of its own; the steps run it down.
  const varCheck = band.getByRole("status").filter({ hasText: "VAR checando" });
  const stopped = page.getByRole("button", { name: "Pausar", pressed: true }).or(page.getByRole("button", { name: /Voltar ao clube|Encerrando/ })).or(varCheck);
  await expect.poll(async () => (await minute.textContent()) !== before || (await stopped.count()) > 0, { intervals: [0, 20, 50, 100] }).toBe(true);
}

/** Plays the paused live round at 4x a minute at a time until the clock reads at least `target`. */
async function playUntilMinute(page: Page, target: number) {
  const minute = page.getByRole("region", { name: "Seu jogo" }).getByLabel("Minuto");
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  for (let guard = 0; guard < 200; guard++) {
    const now = Number.parseInt((await minute.textContent()) ?? "0", 10);
    if (now >= target) return;
    await stepMinute(page);
    if (await paused.isVisible()) {
      if (!(await leaveIncident(page))) await page.getByRole("button", { name: "4x" }).click();
    }
  }
}

async function finishRound(page: Page) {
  const back = page.getByRole("button", { name: "Voltar ao clube" });
  const finishing = page.getByRole("button", { name: "Encerrando…" });
  const paused = page.getByRole("button", { name: "Pausar", pressed: true, disabled: false });
  while (!(await finishing.or(back).first().isVisible())) {
    await stepMinute(page);
    if (await paused.isVisible()) {
      if (!(await leaveIncident(page))) await page.getByRole("button", { name: "4x" }).click();
    }
  }
  await page.clock.resume();
  await expect(back).toBeVisible();
}

async function playUntilEvent(page: Page, look: "card" | "press") {
  const found = await page.evaluate(async (wanted) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (let step = 0; step < 400; step++) {
      const pending = await engine.pendingEvent();
      if (pending?.look === wanted) return true;
      if (pending) await engine.apply({ type: "answerEvent", choice: null });
      const { coachClubId, coach } = await engine.read(["coachClubId", "coach"]);
      if (!coachClubId && coach.offers[0]) await engine.apply({ type: "advance", days: [{ acceptOffer: coach.offers[0].clubId }] });
      const { stop, daysPlayed } = await engine.apply({ type: "playToMatchDay" });
      if (stop === "matchDay" && daysPlayed === 0) {
        await engine.apply({ type: "startRound" });
        await engine.apply({ type: "finishRound" });
      }
      for (let point = await engine.turningPoint(); point; point = await engine.turningPoint()) await engine.apply({ type: "closeTurningPoint" });
    }
    return false;
  }, look);
  expect(found, `an event of look ${look} waits for the coach`).toBe(true);
  await reopenHub(page);
}

/** Rewrites the coach's record in the save as `change` says, then plays the day that finds the career moment. */
async function playFixture(page: Page, change: { trophy?: boolean; firing?: boolean }) {
  await page.evaluate(
    async ({ fx, clubId, run }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      await engine.apply({ type: "advance", days: [{}] });
      const save = JSON.parse(await engine.save());
      const game = save.game;
      const coach = game.history.coach;
      if (fx.trophy) coach.trophies = [...coach.trophies, { season: game.season, competition: "serie-a", clubId }];
      if (fx.firing) {
        coach.stints = [{ clubId, from: "2026-01-01", until: "2026-01-02", left: "fired" }];
        coach.firings = [...coach.firings, { clubId, date: game.date, position: 17, targetPosition: 1 }];
        game.coach.contract = null;
        game.coachClubId = null;
        coach.moments.pressure = run.map((opponentId, index) => ({ opponentId, goalsFor: index % 3 === 0 ? 1 : 0, goalsAgainst: 2, board: 60 - index * 5, fans: 80 - index * 2, date: game.date, isHome: index % 2 === 0 }));
      }
      await engine.apply({ type: "load", save: JSON.stringify(save) });
      await engine.apply({ type: "advance", days: [{}] });
    },
    { fx: change, clubId: FLA, run: LOSING_RUN },
  );
}

test.describe.configure({ mode: "serial" });

test(`every screen of the game in the ${THEME} theme`, async ({ page }) => {
  test.setTimeout(40 * 60_000);
  mkdirSync(DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/");

  await attempt(page, "start-menu", async () => {
    await expect(page.getByRole("link", { name: "Novo jogo" })).toBeVisible();
    await shot(page, "01-start-menu");
  });

  await attempt(page, "new-game", async () => {
    await page.getByRole("link", { name: "Novo jogo" }).click();
    await expect(page.getByRole("button", { name: "Começar carreira" })).toBeVisible();
    await shot(page, "02-new-game");
    await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série A");
    await page.getByRole("searchbox", { name: "Buscar clube" }).fill("flamengo");
    const clubs = page.getByRole("list", { name: "Clubes" });
    await expect(clubs.getByRole("button", { name: "Flamengo" })).not.toContainText("…");
    await clubs.getByRole("button", { name: "Flamengo" }).click();
    await shot(page, "03-new-game-club-picked");
    await page.locator("label").filter({ hasText: "Personalizar" }).click();
    await shot(page, "04-new-game-formats");
    await page.locator("label").filter({ hasText: "Realista" }).click();
    await page.getByRole("button", { name: "Mais um técnico" }).click();
    await shot(page, "05-new-game-hot-seat");
    await page.getByRole("button", { name: "Menos um técnico" }).click();
  });

  await page.getByRole("textbox", { name: "Nome do técnico" }).fill("Rui Tavares");
  await page.getByRole("button", { name: "Começar carreira" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
  await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  await passMoments(page, hubLoaded(page));

  await attempt(page, "hub", async () => {
    await shot(page, "10-hub");
    const paper = page.getByRole("dialog", { name: "Jornal" });
    if (!(await paper.isVisible())) await page.getByRole("button", { name: /^Jornal/ }).click();
    await expect(paper).toBeVisible();
    await shot(page, "11-hub-paper");
  });

  await fastForward(page, "2026-01-08");
  await reopenHub(page);

  await attempt(page, "market-buy", async () => {
    await bar(page).getByRole("link", { name: "Busca" }).click();
    await shot(page, "20-market-search");
    await pickOption(page.getByRole("combobox", { name: "Liga" }), "Série B");
    const priced = page.getByRole("table", { name: "Jogadores" }).getByRole("row").filter({ has: page.getByRole("cell", { name: /^R\$/ }) }).first();
    const name = (await priced.getByRole("button").textContent()) ?? "";
    await priced.getByRole("button").click();
    await expect(page.getByRole("region", { name })).toBeVisible();
    await shot(page, "21-market-buy");
    await page.getByRole("region", { name }).getByRole("button", { name: "Comprar" }).click();
  });

  await attempt(page, "market-sell", async () => {
    await page.getByRole("tab", { name: /^Propostas/ }).click();
    const sale = page.getByRole("combobox", { name: "Jogador para vender" });
    await pickOption(sale, { index: 1 });
    await page.getByRole("button", { name: "Pôr à venda" }).click();
    await shot(page, "22-market-sell");
    await pickOption(sale, { index: 2 });
    await page.getByRole("button", { name: "Leiloar" }).click();
    await shot(page, "23-market-auction");
  });

  for (const [slug, hash] of [
    ["30-finances", "/finances"],
    ["31-stadium", "/stadium"],
    ["32-youth", "/youth"],
    ["33-sponsors", "/sponsors"],
    ["34-chemistry", "/chemistry"],
    ["35-assistant", "/assistant"],
    ["36-national-team", "/national-team"],
    ["37-newspaper", "/newspaper"],
    ["38-calendar", "/calendar"],
  ] as const) {
    await attempt(page, slug, async () => {
      await go(page, hash);
      await page.waitForTimeout(600);
      await shot(page, slug);
    });
  }

  await attempt(page, "squad", async () => {
    await go(page, "/hub");
    const squad = page.getByRole("table", { name: "Elenco do Flamengo" });
    await expect(squad).toBeVisible();
    await shot(page, "40-squad");
    await squad.getByRole("link").first().click();
    await expect(page.getByRole("button", { name: "Renovar" })).toBeVisible();
    await shot(page, "41-player");
    await page.getByRole("button", { name: "Voltar" }).click();
  });

  await attempt(page, "tables", async () => {
    await bar(page).getByRole("link", { name: "Tabelas" }).click();
    await expect(page.getByRole("heading", { name: "Tabelas" })).toBeVisible();
    await shot(page, "50-tables-state");
    await page.getByRole("tab", { name: "Série A" }).click();
    await shot(page, "51-tables-serie-a");
    await page.getByRole("tab", { name: "Copa do Brasil" }).click();
    await shot(page, "52-tables-cup-bracket");
    const tabs = await page.getByRole("tab").allTextContents();
    for (const [slug, name] of [
      ["53-tables-libertadores", /Libertadores/],
      ["54-tables-mundial", /Mundial|Intercontinental/],
    ] as const) {
      const tab = tabs.find((text) => name.test(text));
      if (!tab) continue;
      await page.getByRole("tab", { name: tab }).click();
      await shot(page, slug);
    }
    await page.getByRole("tab", { name: "Outras" }).click();
    await shot(page, "55-tables-others");
  });

  await attempt(page, "coaches", async () => {
    await bar(page).getByRole("link", { name: "Técnicos" }).click();
    await shot(page, "60-coaches");
    for (const [slug, name] of [
      ["61-coaches-cbf", "Ranking CBF"],
      ["62-coaches-world", "Ranking mundial"],
      ["63-coaches-places", "Vagas"],
    ] as const) {
      await page.getByRole("tab", { name }).click();
      await shot(page, slug);
    }
  });

  await attempt(page, "options", async () => {
    await bar(page).getByRole("link", { name: "Opções" }).click();
    await expect(page.getByRole("heading", { name: "Opções" })).toBeVisible();
    await shot(page, "70-options");
    await page.getByRole("list", { name: "Créditos" }).scrollIntoViewIfNeeded();
    await shot(page, "71-options-credits");
    await page.getByRole("link", { name: "Abrir" }).click();
    await page.getByRole("button", { name: "Salvar agora" }).click();
    await shot(page, "72-saves");
  });

  // The match day: lineup, tactics, plan, the live round and the match page.
  await bar(page).getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
  const lineup = await openLineup(page);
  await attempt(page, "lineup", async () => {
    await shot(page, "80-lineup");
    await lineup.getByRole("button", { name: /^Tática/ }).click();
    const tactics = page.getByRole("dialog", { name: "Tática" });
    await expect(tactics).toBeVisible();
    await shot(page, "81-tactics");
    await tactics.getByRole("button", { name: "Escalação" }).click();
    await lineup.getByRole("button", { name: /^Plano de jogo/ }).click();
    const plan = page.getByRole("dialog", { name: "Plano de jogo" });
    await expect(plan).toBeVisible();
    await shot(page, "82-match-plan");
    await plan.getByRole("button", { name: "Escalação" }).click();
  });
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();
  const band = page.getByRole("region", { name: "Seu jogo" });
  await expect(band).toBeVisible();
  await pauseClock(page);
  await page.getByRole("button", { name: "4x" }).click();
  await attempt(page, "live-round", async () => {
    await playUntilMinute(page, 30);
    await pauseClock(page);
    await shot(page, "90-live-round");
  });
  await attempt(page, "match-page", async () => {
    await pauseClock(page);
    const rows = page.getByRole("button", { name: /^Ficha do jogo: / });
    await rows.nth(1).click();
    const panel = page.getByRole("dialog", { name: "Ficha do jogo" });
    await expect(panel).toBeVisible();
    await shot(page, "92-match-panel");
    await panel.getByRole("button", { name: /Ver ficha completa/ }).click();
    const sheet = page.getByRole("dialog", { name: "Ficha completa" });
    await expect(sheet).toBeVisible();
    await shot(page, "93-match-page-summary");
    for (const [slug, tab] of [
      ["94-match-page-lineups", "Escalações"],
      ["95-match-page-stats", "Estatísticas"],
      ["96-match-page-head-to-head", "Confronto"],
    ] as const) {
      await sheet.getByRole("tab", { name: tab }).click();
      await shot(page, slug);
    }
    await sheet.getByRole("button", { name: "Fechar a ficha" }).click();
    await page.clock.runFor(1000);
    await expect(sheet).toBeHidden();
  });
  await attempt(page, "live-end", async () => {
    await page.getByRole("button", { name: "4x" }).click();
    await finishRound(page);
    await shot(page, "97-live-round-end");
    await page.getByRole("button", { name: "Voltar ao clube" }).click();
  });

  await attempt(page, "events", async () => {
    await playUntilEvent(page, "card");
    await shot(page, "100-hub-event");
  });
  await attempt(page, "moments", async () => {
    await playFixture(page, { trophy: true });
    await bar(page).getByRole("link", { name: "Agenda" }).click();
    await bar(page).getByRole("link", { name: "Times" }).click();
    await expect(momentScene(page)).toBeVisible();
    await shot(page, "110-moment-title");
    await page.keyboard.press("Escape");
    await momentScene(page).locator(".btn.go").click();
  });
});

test("a press conference, in the " + THEME + " theme", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Rui Tavares" });
  await passMoments(page, hubLoaded(page));
  await attempt(page, "press", async () => {
    await playUntilEvent(page, "press");
    await page.getByRole("region", { name: "Assunto esperando resposta" }).getByRole("button", { name: "Ir à coletiva" }).click();
    await expect(page.getByRole("dialog")).toContainText("Jornal do Boleiro");
    await shot(page, "101-press-conference");
    await page.keyboard.press("Escape");
  });
});

test("a sacking, in the " + THEME + " theme", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  mkdirSync(DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Rui Tavares" });
  await passMoments(page, hubLoaded(page));
  await attempt(page, "sacked", async () => {
    await playFixture(page, { firing: true });
    await bar(page).getByRole("link", { name: "Agenda" }).click();
    await bar(page).getByRole("link", { name: "Times" }).click();
    const scene = page.getByRole("region", { name: "Demitido: Flamengo" });
    await expect(scene).toBeVisible();
    await shot(page, "111-moment-sacked");
    await page.keyboard.press("Escape");
    await expect(scene).toHaveAttribute("data-state", "ended");
    await shot(page, "112-moment-sacked-end");
    await page.getByRole("button", { name: "Ver propostas" }).click();
    await expect(page).toHaveURL(/#\/offers$/);
    await shot(page, "113-offers");
  });
});

test("the end of a season, its album and the history, in the " + THEME + " theme", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  mkdirSync(DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Rui Tavares" });
  await passMoments(page, hubLoaded(page));
  await fastForward(page, "2026-11-28");
  await reopenHub(page);
  const played = await playSeasonThroughScreens(page, 2026);
  await attempt(page, "season-end", async () => {
    await shot(page, "120-season-end");
    expect(played.rounds).toBeGreaterThanOrEqual(0);
  });
  await startNextSeason(page, 2027);
  await attempt(page, "trajectory", async () => {
    await go(page, "/trajectory");
    await page.waitForTimeout(800);
    await shot(page, "121-trajectory");
  });
  await attempt(page, "awards", async () => {
    await go(page, "/awards");
    await page.waitForTimeout(800);
    await shot(page, "122-awards");
  });
  await attempt(page, "history", async () => {
    await bar(page).getByRole("link", { name: "Histórico" }).click();
    await shot(page, "123-history-club");
    const years = page.getByRole("navigation", { name: "Temporadas" });
    if (await years.isVisible()) await years.getByRole("button", { name: /^2026/ }).click();
    await shot(page, "124-album-season-page");
    for (const [slug, name] of [
      ["125-history-trophies", "Títulos"],
      ["126-history-records", "Recordes"],
      ["127-history-champions", "Campeões"],
      ["128-history-scorers", "Artilheiros"],
      ["129-history-career", "Carreira"],
      ["130-history-rarities", "Raridades"],
    ] as const) {
      await page.getByRole("tab", { name }).click();
      await shot(page, slug);
    }
  });
  await attempt(page, "saves-start", async () => {
    await backToStart(page);
    await shot(page, "140-start-menu-with-save");
    await page.getByRole("button", { name: "Carregar jogo" }).click();
    await expect(page.getByRole("dialog", { name: "Jogos salvos" })).toBeVisible();
    await shot(page, "141-saved-games");
    await page.getByRole("button", { name: "Fechar" }).click();
  });
});

test("a hot-seat game's turn screen, in the " + THEME + " theme", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  mkdirSync(DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await attempt(page, "hot-seat", async () => {
    await page.getByRole("link", { name: "Novo jogo" }).click();
    await page.getByRole("button", { name: "Mais um técnico" }).click();
    const clubs = page.getByRole("list", { name: "Clubes" });
    await page.getByRole("textbox", { name: "Nome do técnico 1" }).fill("Ana");
    await clubs.getByRole("button", { name: "Flamengo" }).click();
    await page.getByRole("textbox", { name: "Nome do técnico 2" }).fill("Bruno");
    await page.getByRole("searchbox", { name: "Buscar clube" }).fill("Goiás");
    await clubs.getByRole("button", { name: "Goiás", exact: true }).click();
    await page.getByRole("button", { name: "Começar jogo" }).click();
    await expect(page).toHaveURL(/#\/hub$/);
    await shot(page, "150-hot-seat-hub");
    await page.getByRole("button", { name: /passar a vez/i }).click();
    await expect(page.getByRole("heading", { name: /^Vez de / })).toBeVisible();
    await shot(page, "151-hot-seat-turn");
  });
});

test.afterAll(() => {
  writeFileSync(`${DIR}/shots.json`, JSON.stringify({ taken, skipped }, null, 2));
});
