import type { VarCheck, VarDecision } from "@boleiro/engine/sim/referees/refereeCalls";
import "./varSticker.css";

/** Where a VAR check stands on the board: under review, with its decision stamped on, or peeling off as play restarts. */
export type VarPhase = "checking" | "decided" | "leaving";

// What the check looks at while it runs, as the sticker's title and the call on the pitch it reviews; nothing gives the decision away.
const UNDER_REVIEW: Record<VarDecision, { title: string; call: string }> = {
  goalStands: { title: "VAR checando o gol", call: "Possível impedimento no lance." },
  goalRuledOut: { title: "VAR checando o gol", call: "Possível impedimento no lance." },
  goalAwarded: { title: "VAR checando o gol", call: "O bandeira marcou impedimento." },
  penaltyAwarded: { title: "VAR checando o lance", call: "Possível pênalti na área." },
  penaltyCancelled: { title: "VAR checando o pênalti", call: "Pênalti marcado em campo." },
  redCardGiven: { title: "VAR checando o lance", call: "Possível falta para vermelho." },
  redCardCancelled: { title: "VAR checando a expulsão", call: "Vermelho mostrado em campo." },
};

// The stamp the decision slaps on; "against" when it takes away what the pitch gave.
const STAMPS: Record<VarDecision, { text: string; isAgainst: boolean }> = {
  goalStands: { text: "Gol confirmado", isAgainst: false },
  goalRuledOut: { text: "Gol anulado", isAgainst: true },
  goalAwarded: { text: "Gol validado", isAgainst: false },
  penaltyAwarded: { text: "Pênalti!", isAgainst: false },
  penaltyCancelled: { text: "Pênalti desmarcado", isAgainst: true },
  redCardGiven: { text: "Vermelho!", isAgainst: false },
  redCardCancelled: { text: "Vermelho retirado", isAgainst: true },
};

/** "1 min 40 s", "48 s": how long the check stopped the match. */
function reviewLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`;
}

/** The yellow sticker slapped on the cover while VAR reviews a human coach's match: what it checks, then the decision stamped across it. */
export function VarSticker({ check, phase, name, club }: { check: VarCheck; phase: VarPhase; name: string; club: string }) {
  const review = UNDER_REVIEW[check.decision];
  const stamp = STAMPS[check.decision];
  const isDecided = phase !== "checking";
  return (
    <div className={`varstk is-${phase}`} role="status" aria-live="assertive">
      <div className="varstk-disc" aria-hidden="true">
        <i className="ph-fill ph-monitor-play" />
        <span className="varstk-scan" />
      </div>
      <div className="varstk-copy">
        <h2>
          {review.title}
          <span className="varstk-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </h2>
        <p>
          {name} ({club}), {check.minute}'. {review.call}
        </p>
      </div>
      {isDecided && (
        <div className={`varstk-stamp${stamp.isAgainst ? " against" : ""}`}>
          <b>{stamp.text}</b>
          <small>{reviewLength(check.seconds)} de revisão</small>
        </div>
      )}
    </div>
  );
}
