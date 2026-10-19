import { defineConfig, devices } from "@playwright/test";
import { E2E_SEED_KEY } from "./ui/newGame/worldSeed.js";

const PORT = Number(process.env.E2E_PORT ?? 4173);
// Every new game starts from this world, so a run never draws one that sacks the coach before the spec's point.
const WORLD_SEED = process.env.E2E_WORLD_SEED ?? "53";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: E2E_SEED_KEY, value: WORLD_SEED }] }] },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    // The macOS app runs in WebKit, so its engine must play the same game as Chromium's (Windows' WebView2) and Node's.
    { name: "webkit", testMatch: "crossEngine.spec.ts", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `VITE_E2E=1 pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
