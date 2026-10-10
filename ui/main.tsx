import "./styles/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import { routes } from "./app/routes.js";
import { ServicesContext, type Services } from "./app/ServicesContext.js";
import { connectEngine } from "./engine/connectEngine.js";
import { slotStore } from "./saves/slotStore.js";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

const services: Services = {
  engine: connectEngine(new Worker(new URL("./engine/engine.worker.ts", import.meta.url), { type: "module" })),
  slots: slotStore(),
};

createRoot(root).render(
  <StrictMode>
    <ServicesContext value={services}>
      <RouterProvider router={createHashRouter(routes)} />
    </ServicesContext>
  </StrictMode>,
);
