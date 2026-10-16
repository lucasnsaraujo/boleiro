import type { RoundClub } from "@boleiro/game-client/round/liveRoundOf";
import { Crest } from "../clubs/Crest.js";
import "./hotSeat.css";

/** Crest, short name and score of both sides on one slim line. */
export function MiniScore({ home, away, score }: { home: RoundClub; away: RoundClub; score: { home: number; away: number } }) {
  return (
    <span className="seat-duel">
      <Crest club={home} size={18} />
      <b>{home.shortName}</b>
      <span className="seat-sc">
        <MiniDigit value={score.home} />
        <i>×</i>
        <MiniDigit value={score.away} />
      </span>
      <b>{away.shortName}</b>
      <Crest club={away} size={18} />
    </span>
  );
}

function MiniDigit({ value }: { value: number }) {
  return (
    <span className="digit">
      <span key={value} className="roll">
        {value}
      </span>
    </span>
  );
}
