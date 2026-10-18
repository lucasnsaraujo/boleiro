import { expect, test, type Page } from "@playwright/test";
import { hubLoaded, news, passMoments, playLiveRoundUntil, startAtClub } from "./flows.js";

// About two seasons of play-ons; a press conference with follow-ups asks the coach every month or two.
const MAX_STEPS = 400;
// The sections the paper gained with the bank of 155 events, beside the old "Bastidores".
const NEW_SECTIONS = ["Departamento médico", "Vida pessoal", "Disciplina", "Comissão técnica", "Patrocínio", "Rivalidade", "Vestiário", "Elenco", "Diretoria", "Torcida", "Coletiva"];

/** Plays on in the worker until a press conference with follow-up questions waits for the coach; other events go to the assistant. */
async function playUntilConference(page: Page) {
  const found = await page.evaluate(async (maxSteps) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    for (let step = 0; step < maxSteps; step++) {
      const pending = await engine.pendingEvent();
      if (pending?.look === "press" && (pending.questions?.length ?? 0) >= 2) return true;
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
  }, MAX_STEPS);
  expect(found, `a press conference with follow-ups asks the coach within ${MAX_STEPS} play-ons`).toBe(true);
  // The hub reads the game when it opens, after the career moments the play-ons left waiting.
  await page.getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
}

test("a press conference is answered one question at a time and its outcome reaches the paper", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  await playUntilConference(page);

  await page.getByRole("region", { name: "Assunto esperando resposta" }).getByRole("button", { name: "Ir à coletiva" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Jornal do Boleiro");
  const total = Number((/Pergunta 1 de (\d)/.exec((await dialog.textContent()) ?? "") ?? [])[1]);
  expect(total).toBeGreaterThanOrEqual(2);
  const next = dialog.getByRole("button", { name: "Próxima pergunta" });
  for (let question = 1; question <= total; question++) {
    await expect(dialog).toContainText(`Pergunta ${question} de ${total}`);
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    await dialog.getByRole("radio").first().click();
    await dialog.getByRole("button", { name: "Responder", exact: true }).click();
    await expect(dialog.getByRole("status")).toBeVisible();
    if (question < total) {
      await expect(dialog.getByRole("status")).toContainText(/Falta|Faltam/);
      await next.click();
    }
  }
  await expect(next).toBeHidden();
  const outcome = (await dialog.getByRole("status").locator("b").textContent()) ?? "";
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await expect(await news(page)).toContainText(outcome);
});

test("the coach talks to his side before kick-off and at half-time, and the round plays on", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.clock.install();
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  const lineup = page.getByRole("dialog", { name: "Escalação" });
  const play = page.getByRole("button", { name: "Jogar rodada" });
  for (let press = 0; press < 5 && !(await lineup.isVisible()); press++) {
    await play.click();
    await expect(lineup.or(play)).toBeVisible({ timeout: 60_000 });
  }
  const preMatch = lineup.getByRole("radiogroup", { name: "Preleção" });
  await preMatch.getByRole("radio", { name: /^Confiança/ }).click();
  await expect(preMatch.getByRole("radio", { name: /^Confiança/ })).toHaveAttribute("aria-checked", "true");
  await lineup.getByRole("button", { name: "Começar a rodada" }).click();

  await playLiveRoundUntil(page, "45'");
  const card = page.getByRole("region", { name: /^Intervalo: vestiário do Flamengo/ });
  await expect(card).toBeVisible();
  await expect(card.getByText("Auxiliar sugere")).toBeVisible();
  await card.getByRole("button", { name: /^Cobrança/ }).click();
  await expect(card.getByRole("status")).toContainText(/Cobrança/i);
  await expect(card.getByRole("status")).toContainText(/Moral/);

  await playLiveRoundUntil(page, null);
  await expect(card).toBeHidden();
  await expect(page.getByRole("region", { name: "Seu jogo" })).toContainText("Fim de jogo");
});

test("the round's newspaper prints the events of the new bank under their own sections", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });
  const section = await page.evaluate(
    async ({ sections, maxSteps }) => {
      const engine = window.boleiroEngine;
      if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
      for (let step = 0; step < maxSteps; step++) {
        const edition = await engine.newspaper();
        const { coachClubId } = await engine.read(["coachClubId"]);
        // The side column prints the first four stories about other clubs (Newspaper.tsx); the coach's own run in the lead's columns.
        const column = (edition?.side ?? []).filter((item) => !(item.kind === "event" && item.clubIds[0] === coachClubId)).slice(0, 4);
        const story = column.find((item) => item.kind === "event" && item.topic && sections.includes(item.kicker));
        if (story && edition?.match) return story.kicker;
        if (await engine.pendingEvent()) await engine.apply({ type: "answerEvent", choice: null });
        const { stop, daysPlayed } = await engine.apply({ type: "playToMatchDay" });
        if (stop === "matchDay" && daysPlayed === 0) {
          await engine.apply({ type: "startRound" });
          await engine.apply({ type: "finishRound" });
        }
        for (let point = await engine.turningPoint(); point; point = await engine.turningPoint()) await engine.apply({ type: "closeTurningPoint" });
      }
      return null;
    },
    { sections: NEW_SECTIONS, maxSteps: MAX_STEPS },
  );
  expect(section, "an edition prints an event under one of the new sections").not.toBeNull();
  await page.getByRole("link", { name: "Tabelas" }).click();
  await page.getByRole("link", { name: "Times" }).click();
  await (await news(page)).isVisible();
  await page.getByRole("link", { name: "Jornal da rodada" }).click();
  const sheet = page.getByRole("article", { name: /^Jornal do Boleiro/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".paper-kick.section", { hasText: section ?? "" }).first()).toBeVisible();
});
