import { keyedStream } from "../../engine/random.js";
import { missedShotsOf, type MatchPlay } from "../live/matchPlay.js";
import type { MatchEvent } from "../live/matchTimeline.js";

type WoodworkShot = { clubId: string; playerId: string; minute: number };

// The woodwork draws from a stream of its own per match, so telling it never moves a match's other draws.
const WOODWORK_SALT = 0x7a3e5;
// Opta counted 222 shots off the post or the bar that stayed out in the 2023/24 Premier League up to
// 19 April 2024 (theanalyst.com/articles/what-if-every-shot-hit-post-crossbar-actually-went-in); guess:
// about 320 matches had been played, so a side hits the frame about 0.35 times a match. A side here
// misses about 8.6 shots off target a match (matchPlay's per-90 rates), so one in 25 comes off the frame.
const WOODWORK_SHARE = 0.04;

/** The shots off target of a match that came back off the post or the bar, in minute order; presentation only. */
export function woodworkOf(seed: number, fixtureId: string, play: MatchPlay, events: readonly MatchEvent[]): WoodworkShot[] {
  const random = keyedStream(seed ^ WOODWORK_SALT, fixtureId);
  return missedShotsOf(play, events)
    .filter((shot) => !shot.isOnTarget && random() < WOODWORK_SHARE)
    .map(({ clubId, playerId, minute }) => ({ clubId, playerId, minute }));
}
