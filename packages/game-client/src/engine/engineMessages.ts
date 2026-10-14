import type { EngineSession } from "./createEngineSession.js";

export type EngineMethod = keyof EngineSession;

export type EngineCall = {
  [M in EngineMethod]: { method: M; args: Parameters<EngineSession[M]> };
}[EngineMethod];

export type EngineRequest = EngineCall & { id: number };

export type EngineResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/** A Worker, the worker's own global scope, or one end of a MessageChannel. */
export type EnginePort = {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
