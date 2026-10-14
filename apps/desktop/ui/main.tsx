import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import { routes } from "./app/routes.js";
import { ServicesContext, type Services } from "./app/ServicesContext.js";
import { withScreenTransitions } from "./app/withScreenTransitions.js";
import { connectEngine, type EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { startEngineWorker } from "@boleiro/game-client/engine/startEngineWorker";
import type { CurrentGameRef } from "@boleiro/game-client/saves/currentGame";
import { slotStore } from "@boleiro/game-client/saves/slotStore";
import { withAutosave } from "@boleiro/game-client/saves/withAutosave";
import { createSoundEngine } from "./sound/soundEngine.js";
import { SoundProvider } from "./sound/SoundProvider.js";
import { ThemeProvider } from "./theme/ThemeProvider.js";

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
  engine: withAutosave(connectEngine(startEngineWorker()), slots, game),
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
      <ThemeProvider store={localStorage}>
        <SoundProvider engine={sound} store={localStorage}>
          <RouterProvider router={withScreenTransitions(createHashRouter(routes))} />
        </SoundProvider>
      </ThemeProvider>
    </ServicesContext>
  </StrictMode>,
);
