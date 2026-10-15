import { expect, test } from "@playwright/test";
import { bar as barOf, startAtClub } from "./flows.js";

test("on the youth screen the coach picks a kid, promotes him, and finds him in the squad table", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe" });

  const bar = barOf(page);
  await bar.getByRole("link", { name: "Base" }).click();
  await expect(page.getByRole("heading", { name: "Base" })).toBeVisible();
  const kids = page.getByRole("table", { name: "Garotos da base" }).getByRole("row");
  await expect(kids.nth(1)).toBeVisible();
  const before = await kids.count();

  // The second best kid, picked by a click on his row.
  const row = kids.nth(2);
  const name = (await row.getByRole("cell").nth(1).textContent()) ?? "";
  await row.click();
  const card = page.getByRole("complementary", { name: `Garoto: ${name}` });
  await expect(card).toBeVisible();
  await expect(card.getByRole("img", { name: /^Potencial de / })).toBeVisible();

  await card.getByRole("button", { name: "Promover ao profissional" }).click();
  await expect(page.getByRole("status")).toHaveText(`${name} subiu ao profissional.`);
  await expect(kids).toHaveCount(before - 1);

  await bar.getByRole("link", { name: "Times" }).click();
  const squad = page.getByRole("table", { name: "Elenco do Flamengo" });
  await expect(squad.getByRole("link", { name, exact: true })).toBeVisible();
});
