import type { EngineSession } from "./createEngineSession.js";
import type { EnginePort, EngineRequest, EngineResponse } from "./engineMessages.js";

function run(session: EngineSession, request: EngineRequest): unknown {
  switch (request.method) {
    case "newGame":
      return session.newGame(...request.args);
    case "advance":
      return session.advance(...request.args);
    case "playToMatchDay":
      return session.playToMatchDay();
    case "inbox":
      return session.inbox();
    case "ask":
      return session.ask(...request.args);
    case "withdraw":
      return session.withdraw(...request.args);
    case "desk":
      return session.desk();
    case "save":
      return session.save();
    case "load":
      return session.load(...request.args);
    case "read":
      return session.read(...request.args);
  }
}

export function serveEngine(port: EnginePort, session: EngineSession): void {
  port.onmessage = (event: MessageEvent<EngineRequest>) => {
    const request = event.data;
    let response: EngineResponse;
    try {
      response = { id: request.id, ok: true, result: run(session, request) };
    } catch (error) {
      response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    port.postMessage(response);
  };
}
