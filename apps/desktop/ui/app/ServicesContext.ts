import { createContext, useContext } from "react";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CurrentGameRef } from "@boleiro/game-client/saves/currentGame";
import type { SlotStore } from "@boleiro/game-client/saves/slotStore";

export type Services = { engine: EngineClient; slots: SlotStore; game: CurrentGameRef };

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices needs a ServicesContext provider");
  return services;
}
