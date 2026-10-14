import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";
import { serveEngine } from "./serveEngine.js";

serveEngine(self, createEngineSession(bundledGameFiles));
