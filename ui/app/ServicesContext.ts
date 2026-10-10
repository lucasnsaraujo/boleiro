import { createContext, useContext } from "react";
import type { EngineClient } from "../engine/connectEngine.js";
import type { CurrentGameRef } from "../saves/currentGame.js";
import type { SlotStore } from "../saves/slotStore.js";

export type Services = { engine: EngineClient; slots: SlotStore; game: CurrentGameRef };

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices needs a ServicesContext provider");
  return services;
}
