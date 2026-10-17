import type { CoachHired } from "./acceptOffer.js";
import type { AssistantLeft } from "./assistant.js";
import type { CoachFired } from "./judgeCoaches.js";
import type { CoachAppointed } from "./moveAiCoaches.js";
import type { JobOffered } from "./offerJobs.js";
import type { CoachSeasonEvent } from "./startCoachSeason.js";

/** Everything the coach career reports: hirings, an assistant left behind, firings, offers, season reviews, board targets and the AI clubs' new coaches. */
export type CoachEvent = CoachHired | AssistantLeft | CoachFired | JobOffered | CoachSeasonEvent | CoachAppointed;
