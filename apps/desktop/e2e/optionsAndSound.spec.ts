import { expect, test } from "@playwright/test";

test("the first click starts the menu music, and the sound settings survive a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const theme = page.waitForResponse((response) => response.url().includes("menu-theme") && response.ok());
  await page.getByRole("link", { name: "Opções" }).click();
  await theme;
  expect(await page.evaluate(() => typeof AudioContext)).toBe("function");

  await expect(page.getByRole("heading", { name: "Opções" })).toBeVisible();
  await page.getByRole("slider", { name: "Música" }).fill("25");
  await page.getByRole("checkbox", { name: "Sem som" }).check();
  await expect(page.getByRole("list", { name: "Créditos" }).getByRole("listitem")).toHaveCount(10);

  await page.reload();
  await expect(page.getByRole("slider", { name: "Música" })).toHaveValue("25");
  await expect(page.getByRole("checkbox", { name: "Sem som" })).toBeChecked();
  expect(errors).toEqual([]);
});
