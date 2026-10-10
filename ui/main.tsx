import "./styles/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import { routes } from "./app/routes.js";
import { ServicesContext, type Services } from "./app/ServicesContext.js";
import { connectEngine, type EngineClient } from "./engine/connectEngine.js";
import type { CurrentGameRef } from "./saves/currentGame.js";
import { slotStore } from "./saves/slotStore.js";
import { withAutosave } from "./saves/withAutosave.js";
import { createSoundEngine } from "./sound/soundEngine.js";
import { SoundProvider } from "./sound/SoundProvider.js";

declare global {
  interface Window {
    /** Only in e2e builds (VITE_E2E=1): lets a test play days on without going through the screens. */
    boleiroEngine?: EngineClient;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

const slots = slotStore();
const game: CurrentGameRef = { current: null };
const services: Services = {
  engine: withAutosave(connectEngine(new Worker(new URL("./engine/engine.worker.ts", import.meta.url), { type: "module" })), slots, game),
  slots,
  game,
};

if (import.meta.env.VITE_E2E === "1") window.boleiroEngine = services.engine;

const sound = createSoundEngine({
  createContext: () => new AudioContext(),
  fetchBytes: (url) => fetch(url).then((response) => response.arrayBuffer()),
});

createRoot(root).render(
  <StrictMode>
    <ServicesContext value={services}>
      <SoundProvider engine={sound} store={localStorage}>
        <RouterProvider router={createHashRouter(routes)} />
      </SoundProvider>
    </ServicesContext>
  </StrictMode>,
);
