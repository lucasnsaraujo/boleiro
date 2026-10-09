import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "data", "pipeline", ".venv"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
);
