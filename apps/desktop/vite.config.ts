import { gunzipImports } from "@boleiro/data/gunzipImports";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri loads the dev server on a fixed port and the built files from dist/.
// The worker builds new games, so it needs the gunzipped data pack as much as the screens do.
// Pack images stay files: inlined as base64, hundreds of small crests would bloat the main script.
export default defineConfig({
  root: "ui",
  plugins: [gunzipImports(), react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  worker: { format: "es", plugins: () => [gunzipImports()] },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "safari16",
    assetsInlineLimit: (file) => (file.includes("/data/pack/assets/") ? false : undefined),
  },
});
