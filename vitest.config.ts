import { configDefaults, defineConfig } from "vitest/config";
import { gunzipImports } from "./packages/data/src/gunzipImports.ts";

export default defineConfig({
  plugins: [gunzipImports()],
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Many tests play whole seasons through the engine and the UI. Their slowest take about 3 s on a dev machine and
    // about 3x that on CI's 2-core runner, past the 5 s default; a hung test still fails, just later.
    testTimeout: 30_000,
    projects: [
      { extends: true, test: { name: "data", include: ["packages/data/src/**/*.test.ts"] } },
      { extends: true, test: { name: "engine", include: ["packages/engine/src/**/*.test.ts"] } },
      { extends: true, test: { name: "game-client", include: ["packages/game-client/src/**/*.test.ts"], environment: "jsdom" } },
      { extends: true, test: { name: "desktop", include: ["apps/desktop/ui/**/*.test.{ts,tsx}"], environment: "jsdom" } },
    ],
  },
});
