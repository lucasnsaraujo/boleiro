import type { EventArea, PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import type { IsoDate } from "@boleiro/engine/sim/gameState";
import { expiryText } from "./eventView.js";

const AREA_WORDS: Record<EventArea, string> = { players: "Jogador", squad: "Elenco", board: "Diretoria", fans: "Torcida", press: "Imprensa" };

/** The note pinned in the hub while an event waits for the coach: what it is, until when, and the way in. */
export function EventNote({ event, today, onOpen }: { event: PendingEvent; today: IsoDate; onOpen: () => void }) {
  const isPress = event.look === "press";
  return (
    <section className="note hub-event" aria-label="Assunto esperando resposta">
      <span className="lbl">
        <i className={isPress ? "ph-bold ph-microphone" : "ph-bold ph-push-pin"} aria-hidden="true" />
        {isPress ? "Coletiva" : AREA_WORDS[event.area]} · esperando você
      </span>
      <h2>{event.headline}</h2>
      <p>{expiryText(event, today)}</p>
      <button className="btn y sm" onClick={onOpen}>
        <i className={isPress ? "ph-bold ph-microphone" : "ph-bold ph-chat-circle-text"} aria-hidden="true" />
        {isPress ? "Ir à coletiva" : "Responder"}
      </button>
    </section>
  );
}
