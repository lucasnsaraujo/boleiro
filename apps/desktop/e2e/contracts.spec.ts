import { expect, test, type Page } from "@playwright/test";
import { bar as barOf, barDate, hubLoaded, news, passMoments, startAtClub } from "./flows.js";

type Save = {
  game: {
    coachClubId: string;
    players: Record<string, { id: string; name: string; clubId: string; age: number; contractUntil: string; strength: number }>;
    finances: Record<string, { wageCap: number; transferBudget: number }>;
  };
};

/** Gives the coach's board room for any wage, through a save the worker loads back. */
async function openTheCheckbook(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const save: Save = JSON.parse(await engine.save());
    const finance = save.game.finances[save.game.coachClubId];
    if (!finance) throw new Error("the coach's club has no finances");
    finance.wageCap = 1e10;
    await engine.apply({ type: "load", save: JSON.stringify(save) });
  });
}

/** Back to the hub from another screen, so it reads the game again, past any career moment waiting there. */
async function reopenHub(page: Page): Promise<void> {
  const bar = barOf(page);
  await bar.getByRole("link", { name: "Agenda" }).click();
  await bar.getByRole("link", { name: "Times" }).click();
  await passMoments(page, hubLoaded(page));
}

test("a player renewed for two years at his ask from the renewal screen gets the new contract the next day", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  await openTheCheckbook(page);
  await reopenHub(page);

  await page.getByRole("tab", { name: /Contratos/ }).click();
  const contracts = page.getByRole("table", { name: "Contratos no último ano" });
  const renew = contracts.getByRole("button", { name: /^Renovar com / }).first();
  const name = ((await renew.getAttribute("aria-label")) ?? "").replace("Renovar com ", "");
  await renew.click();
  const dialog = page.getByRole("dialog", { name: `Renovar com ${name}` });
  const two = dialog.getByRole("radio", { name: /^2 anos: / });
  await two.click();
  await expect(two).toBeChecked();
  const ask = /^2 anos: (R\$ [\d,]+(?: mi| mil)?) por mês/.exec((await two.getAttribute("aria-label")) ?? "")?.[1] ?? "";
  expect(ask).not.toBe("");
  await dialog.getByRole("button", { name: "Renovar por 2 anos" }).click();
  await expect(dialog).toContainText(`Renovação de ${name} na mesa, 2 anos a ${ask}. A diretoria responde amanhã.`);
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(contracts.getByRole("row").filter({ hasText: name })).toContainText("Na mesa");

  const before = (await barDate(page).textContent()) ?? "";
  await page.getByRole("button", { name: "Jogar rodada" }).click();
  await expect(barDate(page)).not.toHaveText(before);
  await expect(await news(page)).toContainText(`Diretoria aprova a renovação de ${name}`);
  const renewed = await page.evaluate(async (who) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { players, coachClubId } = await engine.read(["players", "coachClubId"]);
    return Object.values(players).find((p) => p.name === who && p.clubId === coachClubId)?.contractUntil;
  }, name);
  expect(renewed).toBe("2028-12-31");
  await page.getByRole("tab", { name: /Contratos/ }).click();
  await expect(page.getByRole("table", { name: "Contratos no último ano" }).getByRole("row").filter({ hasText: name })).toHaveCount(0);
});

test("on the season's last day the assistant renews a player worth keeping and says so in the paper", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Tite" });
  const name = await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { date } = await engine.read(["date"]);
    const days = Math.round((Date.parse("2026-12-30") - Date.parse(date)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
    // His contract now runs out at the season's end, and the board has room for any wage.
    const save: Save = JSON.parse(await engine.save());
    const { coachClubId, players, finances } = save.game;
    const [best] = Object.values(players)
      .filter((p) => p.clubId === coachClubId)
      .sort((a, b) => b.strength - a.strength);
    const finance = finances[coachClubId];
    if (!best || !finance) throw new Error("the coach has no club");
    best.contractUntil = "2026-12-31";
    best.age = 27;
    finance.wageCap = 1e10;
    await engine.apply({ type: "load", save: JSON.stringify(save) });
    return best.name;
  });
  await reopenHub(page);
  await page.getByRole("tab", { name: /Contratos/ }).click();
  await expect(page.getByRole("table", { name: "Contratos no último ano" }).getByRole("row").filter({ hasText: name })).toContainText("Renova em 31 dez, 2 anos");

  await page.evaluate(async () => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    await engine.apply({ type: "advance", days: [{}] });
  });
  await reopenHub(page);
  await expect(await news(page)).toContainText(new RegExp(`O auxiliar renovou (com ${name} até dez 2028|\\d+ contratos: .*${name})`));
  const until = await page.evaluate(async (who) => {
    const engine = window.boleiroEngine;
    if (!engine) throw new Error("the build has no engine hook; build with VITE_E2E=1");
    const { players, coachClubId } = await engine.read(["players", "coachClubId"]);
    return Object.values(players).find((p) => p.name === who && p.clubId === coachClubId)?.contractUntil;
  }, name);
  expect(until).toBe("2028-12-31");
});
