import { defineConfig, devices } from "@playwright/test";
import { E2E_SEED_KEY } from "./ui/newGame/worldSeed.js";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const WORLD_SEED = process.env.E2E_WORLD_SEED ?? "53";
const THEME = process.env.SHOT_THEME === "dark" ? "dark" : "light";

/** The docs' captures: every screen in one theme, and the video of a live round. Run by `pnpm docs:screens` and `pnpm docs:video`, never by `pnpm e2e`. */
export default defineConfig({
  testDir: "docs-capture",
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 20_000,
    baseURL: `http://localhost:${PORT}`,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [
            { name: E2E_SEED_KEY, value: WORLD_SEED },
            { name: "boleiro.theme", value: THEME },
          ],
        },
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `VITE_E2E=1 pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
