import { bundledGameFiles } from "./bundledGameFiles.js";
import { connectEngine, type EngineClient } from "./connectEngine.js";
import { createEngineSession } from "./createEngineSession.js";
import { serveEngine } from "./serveEngine.js";

/** The engine over a MessageChannel instead of a Worker, for tests that run without one. */
export function inMemoryEngine(): { engine: EngineClient; close: () => void } {
  const channel = new MessageChannel();
  serveEngine(channel.port1, createEngineSession(bundledGameFiles));
  return {
    engine: connectEngine(channel.port2),
    close: () => {
      channel.port1.close();
      channel.port2.close();
    },
  };
}
