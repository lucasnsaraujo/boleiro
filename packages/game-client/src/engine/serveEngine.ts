import type { EngineSession } from "./createEngineSession.js";
import type { EnginePort, EngineRequest, EngineResponse } from "./engineMessages.js";

function run(session: EngineSession, request: EngineRequest): unknown {
  switch (request.method) {
    case "apply":
      return session.apply(...request.args);
    case "matchDayPlan":
      return session.matchDayPlan(...request.args);
    case "liveRound":
      return session.liveRound();
    case "chemistry":
      return session.chemistry();
    case "assistant":
      return session.assistant();
    case "sponsors":
      return session.sponsors();
    case "betSticker":
      return session.betSticker();
    case "awards":
      return session.awards();
    case "coaches":
      return session.coaches(...request.args);
    case "coachProfile":
      return session.coachProfile(...request.args);
    case "matchPage":
      return session.matchPage(...request.args);
    case "turningPoint":
      return session.turningPoint();
    case "inbox":
      return session.inbox();
    case "desk":
      return session.desk();
    case "hotSeat":
      return session.hotSeat();
    case "marketClock":
      return session.marketClock();
    case "scouting":
      return session.scouting();
    case "pendingEvent":
      return session.pendingEvent();
    case "newspaper":
      return session.newspaper(...request.args);
    case "newspaperEditions":
      return session.newspaperEditions();
    case "save":
      return session.save();
    case "saveShards":
      return session.saveShards();
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
