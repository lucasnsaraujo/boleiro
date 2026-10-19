import { expect, test, type Page } from "@playwright/test";
import { bar, hubLoaded, news, passMoments, pickOption, startAtClub } from "./flows.js";

// Days for an offer made on 1 January to reach the other coach's desk: the transfer window opens on the 5th.
const MAX_WINDOW_DAYS = 30;

test("a club abroad finds its UEFA places and its relegation beside its league table", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Premier League · Inglaterra", search: "arsenal", club: "Arsenal FC", coach: "Mikel" });
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("tab", { name: "Premier League" }).click();
  const zones = page.getByRole("region", { name: "Vagas" });
  await expect(zones).toContainText("Champions League");
  await expect(zones).toContainText("Europa League");
  await expect(zones).toContainText("Rebaixamento");
  await expect(page.locator(".zn.zone-championsLeague")).toHaveCount(6);
});

test("a UEFA final is played at its own ground: the Super Cup of the Champions League winner in Salzburg", async ({ page }) => {
  await page.goto("/");
  // Paris Saint-Germain won the 2025/26 Champions League, so it opens 2026/27 in the Super Cup.
  await startAtClub(page, { division: "Ligue 1 · França", search: "paris", club: "Paris Saint-Germain", coach: "Luis" });
  const date = await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { fixtures } = await engine.read(["fixtures"]);
    return fixtures.find((f) => f.competitionId.startsWith("uefa-super-cup"))?.date ?? "";
  });
  expect(date).not.toBe("");
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  await page.getByRole("group", { name: "Meses" }).getByRole("button", { name: new RegExp(`^${month}`, "i") }).click();
  await expect(page.getByRole("region", { name: /^Supercopa da UEFA/ })).toContainText("Red Bull Arena");
});

/** From the start menu, a hot-seat game of Ana at Flamengo and Bruno at Palmeiras. */
async function startTwoCoaches(page: Page) {
  await page.getByRole("link", { name: "Novo jogo" }).click();
  await page.getByRole("button", { name: "Mais um técnico" }).click();
  const clubs = page.getByRole("list", { name: "Clubes" });
  await pickOption(page.getByRole("combobox", { name: "Divisão" }), "Série A");
  await expect(clubs.getByRole("button", { name: "Flamengo" })).not.toContainText("…");
  await page.getByRole("textbox", { name: "Nome do técnico 1" }).fill("Ana");
  await clubs.getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("textbox", { name: "Nome do técnico 2" }).fill("Bruno");
  await clubs.getByRole("button", { name: "Palmeiras" }).click();
  await page.getByRole("button", { name: "Começar jogo" }).click();
  await expect(page).toHaveURL(/#\/hub$/);
}

test("in hot-seat the buyer reads on his next turn that the other coach turned his offer down", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.goto("/");
  await startTwoCoaches(page);
  // Through the e2e build's engine hook: Ana offers for Bruno's cheapest player (the next one when hers won't come),
  // the days run until her board sends it to Bruno's desk, Bruno turns it down on his turn and plays on.
  const player = await page.evaluate(async (maxDays) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { players } = await engine.read(["players"]);
    const targets = Object.values(players)
      .filter((p) => p.clubId === "palmeiras-sp")
      .sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id, "en"));
    let at = 0;
    const ask = async () => {
      const target = targets[at];
      if (!target) throw new Error("no Palmeiras player would come");
      await engine.apply({ type: "ask", request: { kind: "sign", playerId: target.id } });
      return target;
    };
    let target = await ask();
    for (let day = 0; day < maxDays; day++) {
      // On Ana's turn: a player who won't come is refused, and she asks for the next one.
      if ((await engine.desk()).answers.some((answer) => answer.request.playerId === target.id && !answer.approved)) {
        at++;
        target = await ask();
      }
      await engine.apply({ type: "passTurn" });
      const { market } = await engine.read(["market"]);
      if (market.coach?.bids[target.id]?.buyerId === "flamengo-rj") {
        await engine.apply({ type: "answerBid", playerId: target.id, answer: { kind: "decline" } });
        if ((await engine.apply({ type: "playToMatchDay" })).daysPlayed === 0) {
          await engine.apply({ type: "startRound" });
          await engine.apply({ type: "finishRound" });
        }
        return target.name;
      }
      await engine.apply({ type: "advance", days: [{}] });
    }
    throw new Error("Ana's offer never reached Bruno's desk");
  }, MAX_WINDOW_DAYS);
  await bar(page).getByRole("link", { name: "Agenda" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  const handOff = page.getByRole("heading", { name: "Vez de Ana" });
  await expect(handOff.or(hubLoaded(page))).toBeVisible({ timeout: 30_000 });
  if (await handOff.isVisible()) await page.getByRole("button", { name: "Começar minha vez" }).click();
  await passMoments(page, hubLoaded(page));
  await expect(page.getByRole("heading", { name: "Flamengo" })).toBeVisible();
  await expect(await news(page)).toContainText(`Palmeiras recusou a proposta por ${player}`);
});
