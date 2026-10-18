import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules",
      "data",
      "pipeline",
      ".venv",
      ".claude",
      "design/mocks",
      "apps/desktop/dist",
      "apps/desktop/src-tauri/target",
      "apps/desktop/src-tauri/gen",
      "apps/desktop/playwright-report",
      "apps/desktop/test-results",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["packages/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react-dom/*", "react-router"], message: "The engine stays UI-free." },
            { group: ["@tauri-apps/*"], message: "The engine must not depend on Tauri." },
            {
              group: ["@boleiro/game-client", "@boleiro/game-client/*", "@boleiro/desktop", "@boleiro/desktop/*", "**/game-client/**", "**/desktop/**"],
              message: "The engine must not import UI code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine/**", "packages/game-client/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='localeCompare'][arguments.length<2]",
          message: "A bare localeCompare sorts by the computer's language, so one seed plays differently in another locale; use compareText or pass a locale.",
        },
      ],
    },
  },
  {
    files: ["packages/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react-dom/*", "react-router"], message: "The data package stays UI-free." },
            { group: ["@tauri-apps/*"], message: "The data package must not depend on Tauri." },
            {
              group: ["@boleiro/*", "**/engine/src/**", "**/game-client/**", "**/desktop/**"],
              message: "The data package depends on no other Boleiro package; the engine depends on it.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/game-client/**"],
    ignores: ["packages/game-client/src/engine/createEngineSession.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react-dom/*", "react-router"], message: "game-client is shared with a future mobile app; React stays in apps/." },
            { group: ["@boleiro/desktop", "@boleiro/desktop/*"], message: "game-client must not import an app." },
            { group: ["@boleiro/engine/sim/advanceDay*"], message: "Only the engine worker runs advanceDay; go through EngineClient." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/desktop/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@boleiro/engine/sim/advanceDay*"], message: "Only the engine worker runs advanceDay; go through EngineClient." }] },
      ],
    },
  },
);
