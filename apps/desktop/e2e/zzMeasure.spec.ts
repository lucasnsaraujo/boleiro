import { test } from "@playwright/test";
import { bar, startAtClub } from "./flows.js";

test("measure", async ({ page }) => {
  await page.goto("/");
  await startAtClub(page, { division: "Série A", search: "flamengo", club: "Flamengo", coach: "Filipe Luís" });
  await bar(page).getByRole("link", { name: "Tabelas" }).click();
  await bar(page).getByRole("link", { name: "Times" }).click();
  for (const size of [{ width: 1024, height: 680 }, { width: 1024, height: 760 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(800);
    const boxes = await page.evaluate(() => {
      const slot = document.querySelector(".hub-slot");
      const panel = slot?.parentElement;
      return [...(panel?.children ?? [])].map((el) => `${el.className} ${Math.round(el.getBoundingClientRect().y)} h${Math.round(el.getBoundingClientRect().height)}`).join("\n") + `\npaper ${document.querySelector(".hub-paper")?.getBoundingClientRect().height}`;
    });
    console.log(size.width, "\n" + boxes);
    await page.screenshot({ path: `/tmp/s12fix/hub-${size.width}x${size.height}.png`, clip: { x: 0, y: 70, width: 330, height: size.height - 70 } });
  }
});
