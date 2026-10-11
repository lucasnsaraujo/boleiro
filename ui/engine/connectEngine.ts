import type { GameState } from "../../src/sim/gameState.js";
import type { EngineSession } from "./createEngineSession.js";
import type { EngineCall, EngineMethod, EnginePort, EngineResponse } from "./engineMessages.js";

type Async<F> = F extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;

/** The engine as the main thread sees it: the session's methods, answered by the worker. */
export type EngineClient = { [M in Exclude<EngineMethod, "read">]: Async<EngineSession[M]> } & {
  read<K extends keyof GameState>(keys: readonly K[]): Promise<Pick<GameState, K>>;
};

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/** The engine's end as the main thread holds it: a Worker, or a MessagePort in tests. */
export type EngineWorker = EnginePort & {
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
};

export function connectEngine(port: EngineWorker): EngineClient {
  const pending = new Map<number, Pending>();
  let nextId = 0;

  // A worker that fails to load or throws outside a call never answers; fail what waits on it rather than hang.
  function failAll(reason: string) {
    const error = new Error(`the engine stopped: ${reason}`);
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
  }
  port.onerror = (event) => failAll(event.message || "the worker failed");
  port.onmessageerror = () => failAll("a reply could not be read");

  port.onmessage = (event: MessageEvent<EngineResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.result);
    else waiting.reject(new Error(response.error));
  };

  function send<R>(call: EngineCall): Promise<R> {
    const id = nextId++;
    return new Promise<R>((resolve, reject) => {
      // The worker answers each method with that method's return type; the message itself is untyped.
      pending.set(id, { resolve: (result) => resolve(result as R), reject });
      port.postMessage({ ...call, id });
    });
  }

  return {
    newGame: (...args) => send({ method: "newGame", args }),
    advance: (...args) => send({ method: "advance", args }),
    playToMatchDay: () => send({ method: "playToMatchDay", args: [] }),
    matchDayPlan: () => send({ method: "matchDayPlan", args: [] }),
    startRound: (...args) => send({ method: "startRound", args }),
    liveRound: () => send({ method: "liveRound", args: [] }),
    seeMinute: (...args) => send({ method: "seeMinute", args }),
    changeLive: (...args) => send({ method: "changeLive", args }),
    finishRound: () => send({ method: "finishRound", args: [] }),
    turningPoint: () => send({ method: "turningPoint", args: [] }),
    closeTurningPoint: () => send({ method: "closeTurningPoint", args: [] }),
    declineOffer: (...args) => send({ method: "declineOffer", args }),
    inbox: () => send({ method: "inbox", args: [] }),
    ask: (...args) => send({ method: "ask", args }),
    withdraw: (...args) => send({ method: "withdraw", args }),
    desk: () => send({ method: "desk", args: [] }),
    save: () => send({ method: "save", args: [] }),
    load: (...args) => send({ method: "load", args }),
    read: (keys) => send({ method: "read", args: [keys] }),
  };
}
