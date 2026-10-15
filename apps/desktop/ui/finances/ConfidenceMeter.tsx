import type { ReactNode } from "react";
import "./confidenceMeter.css";

type Props = {
  /** "Diretoria" or "Torcida"; also the meter's accessible name. */
  label: string;
  /** From 0 to 100. */
  value: number;
  /** A word after the label, like the coach's job security. */
  detail?: string;
  /** A line under the meter saying what moves it. */
  note?: ReactNode;
};

// The meter turns yellow, then red, as it nears the line where the board starts firing (about 10).
const LOW = 25;
const MID = 45;

/** One of the club's two confidence meters, 0 to 100, as the hub and the finances screen draw them. */
export function ConfidenceMeter({ label, value, detail, note }: Props) {
  const tone = value < LOW ? "meter low" : value < MID ? "meter mid" : "meter";
  return (
    <div className="conf-meter">
      <div className="conf-top">
        <span className="lbl">
          {label}
          {detail && (
            <>
              {" · "}
              <span className="conf-detail">{detail}</span>
            </>
          )}
        </span>
        <b>{value}%</b>
      </div>
      <div className={tone} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <i style={{ width: `${value}%` }} />
      </div>
      {note && <p className="conf-note">{note}</p>}
    </div>
  );
}
