import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri loads the dev server on a fixed port and the built files from dist/.
export default defineConfig({
  root: "ui",
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  worker: { format: "es" },
  build: { outDir: "../dist", emptyOutDir: true, target: "safari16" },
});
