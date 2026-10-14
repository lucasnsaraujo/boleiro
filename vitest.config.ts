import { configDefaults, defineConfig } from "vitest/config";
import { gunzipImports } from "./packages/data/src/gunzipImports.ts";

export default defineConfig({
  plugins: [gunzipImports()],
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
    projects: [
      { extends: true, test: { name: "data", include: ["packages/data/src/**/*.test.ts"] } },
      { extends: true, test: { name: "engine", include: ["packages/engine/src/**/*.test.ts"] } },
      { extends: true, test: { name: "game-client", include: ["packages/game-client/src/**/*.test.ts"], environment: "jsdom" } },
      { extends: true, test: { name: "desktop", include: ["apps/desktop/ui/**/*.test.{ts,tsx}"], environment: "jsdom" } },
    ],
  },
});
