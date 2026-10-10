import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
    projects: [
      { extends: true, test: { name: "sim", include: ["src/**/*.test.ts"] } },
      { extends: true, test: { name: "ui", include: ["ui/**/*.test.{ts,tsx}"], environment: "jsdom" } },
    ],
  },
});
