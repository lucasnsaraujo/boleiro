import type { Formation } from "../../engine/formations.js";
import type { Posture } from "../../engine/match.js";

/** How the coach sets his side up. With no penalty taker, or one not on the pitch, the best forward takes them. */
export type Tactics = { formation: Formation; posture: Posture; penaltyTakerId: string | null };

export const DEFAULT_TACTICS: Tactics = { formation: "4-4-2", posture: "balanced", penaltyTakerId: null };
