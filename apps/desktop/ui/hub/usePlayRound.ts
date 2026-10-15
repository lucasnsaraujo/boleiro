import { useState } from "react";
import { useNavigate } from "react-router";
import { useServices } from "../app/ServicesContext.js";
import type { PlayResult } from "@boleiro/game-client/engine/createEngineSession";

export type PlayRound = { play: () => Promise<void>; isPlaying: boolean; hasFailed: boolean };

/** The play button's words: a coach without a club has no round to play, only offers to wait for. */
export function playRoundLabel(isPlaying: boolean, hasClub: boolean): string {
  if (isPlaying) return "Jogando…";
  return hasClub ? "Jogar rodada" : "Esperar propostas";
}

/**
 * "Jogar rodada": plays on in the worker, then opens the live round on the coach's match day.
 * When a day stops it early, `onStopped` decides where the coach reads why. In a hot-seat game a
 * coach before the last one sets his eleven on his match day or passes his turn instead, and days
 * played hand the seat back to the first coach; both go behind the hand-off screen.
 */
export function usePlayRound(onStopped: (result: PlayResult) => void): PlayRound {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [isPlaying, setPlaying] = useState(false);
  const [hasFailed, setFailed] = useState(false);

  async function play() {
    setPlaying(true);
    setFailed(false);
    try {
      const seats = await engine.hotSeat();
      if (seats && !seats.isLastTurn) {
        if (seats.coaches[seats.seated]?.playsToday) navigate("/round");
        else {
          await engine.apply({ type: "passTurn" });
          navigate("/turn");
        }
        return;
      }
      const result = await engine.apply({ type: "playToMatchDay" });
      if (seats && result.daysPlayed > 0) navigate("/turn");
      else if (result.stop === "matchDay") navigate("/round");
      else onStopped(result);
    } catch {
      setFailed(true);
    } finally {
      setPlaying(false);
    }
  }

  return { play, isPlaying, hasFailed };
}
