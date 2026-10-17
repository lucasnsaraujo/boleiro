import type { GameState } from "@boleiro/engine/sim/gameState";
import type { CommandResults, CommandType, EngineSession, GameCommand } from "./createEngineSession.js";
import type { EngineCall, EngineMethod, EnginePort, EngineResponse } from "./engineMessages.js";

type Async<F> = F extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;

/**
 * The engine as the main thread sees it: the session's methods, answered by the worker. The game
 * changes only through `apply`, which hands the worker a command; the other methods read it.
 */
export type EngineClient = { [M in Exclude<EngineMethod, "read" | "apply">]: Async<EngineSession[M]> } & {
  apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
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

  // TypeScript can't widen a command of a generic type to the union the message carries; the plain signature below does.
  function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
  function apply(command: GameCommand): Promise<unknown> {
    return send({ method: "apply", args: [command] });
  }

  return {
    apply,
    matchDayPlan: (...args) => send({ method: "matchDayPlan", args }),
    liveRound: () => send({ method: "liveRound", args: [] }),
    chemistry: () => send({ method: "chemistry", args: [] }),
    assistant: () => send({ method: "assistant", args: [] }),
    sponsors: () => send({ method: "sponsors", args: [] }),
    betSticker: () => send({ method: "betSticker", args: [] }),
    awards: () => send({ method: "awards", args: [] }),
    coaches: (...args) => send({ method: "coaches", args }),
    coachProfile: (...args) => send({ method: "coachProfile", args }),
    matchPage: (...args) => send({ method: "matchPage", args }),
    turningPoint: () => send({ method: "turningPoint", args: [] }),
    inbox: () => send({ method: "inbox", args: [] }),
    desk: () => send({ method: "desk", args: [] }),
    hotSeat: () => send({ method: "hotSeat", args: [] }),
    marketClock: () => send({ method: "marketClock", args: [] }),
    scouting: () => send({ method: "scouting", args: [] }),
    pendingEvent: () => send({ method: "pendingEvent", args: [] }),
    eggAlbum: () => send({ method: "eggAlbum", args: [] }),
    newspaper: (...args) => send({ method: "newspaper", args }),
    newspaperEditions: () => send({ method: "newspaperEditions", args: [] }),
    save: () => send({ method: "save", args: [] }),
    saveShards: () => send({ method: "saveShards", args: [] }),
    read: (keys) => send({ method: "read", args: [keys] }),
  };
}
