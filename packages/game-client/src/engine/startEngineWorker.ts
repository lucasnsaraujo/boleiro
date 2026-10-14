/** Starts the engine in a Web Worker. The URL sits next to the worker file so the bundler finds it. */
export function startEngineWorker(): Worker {
  return new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
}
