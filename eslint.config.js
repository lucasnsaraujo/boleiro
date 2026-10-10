import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "data", "pipeline", ".venv", ".claude", "dist", "src-tauri/target", "src-tauri/gen", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react-dom/*", "react-router"], message: "The sim core in src/ stays UI-free." },
            { group: ["@tauri-apps/*"], message: "The sim core in src/ must not depend on Tauri." },
            { group: ["**/ui", "**/ui/**"], message: "The sim core in src/ must not import UI code." },
          ],
        },
      ],
    },
  },
  {
    files: ["ui/**"],
    ignores: ["ui/engine/createEngineSession.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/src/sim/advanceDay*"], message: "Only the engine worker runs advanceDay; go through EngineClient." }] },
      ],
    },
  },
);
