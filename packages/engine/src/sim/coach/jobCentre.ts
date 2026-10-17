import type { GameState, IsoDate } from "../gameState.js";
import { coachesByClub } from "./aiCoaches.js";
import { refusalOf, type Refusal } from "./applyForJob.js";
import { clubStatures } from "./clubStatures.js";
import { isHumanClub } from "./humanCoaches.js";
import { isOnTheBrink } from "./judgeCoaches.js";

/**
 * A job the coach in the seat could go for: an open one since `openedOn`, or (`openedOn` null) a club
 * whose board is close to firing its coach, `coachName`. `wouldHire` says whether the club would take him
 * today, `refusal` why not.
 */
export type OpenJob = { clubId: string; openedOn: IsoDate | null; coachName: string | null; stature: number; wouldHire: boolean; refusal: Refusal | null };

/** The open jobs at clubs a human coach can take, then the clubs about to sack their coach; biggest clubs first. */
export function jobCentre(state: GameState): OpenJob[] {
  const statures = clubStatures(state);
  const openJobs = state.coaches?.openJobs ?? {};
  const byClub = coachesByClub(state.coaches ?? { coaches: {} });
  const jobs: OpenJob[] = [];
  for (const clubId of Object.keys(state.boards)) {
    if (isHumanClub(state, clubId)) continue;
    const opened = openJobs[clubId];
    const stature = statures.get(clubId) ?? 0;
    const refusal = refusalOf(state, clubId, stature);
    const verdict = { stature, wouldHire: refusal === null, refusal };
    if (opened) jobs.push({ clubId, openedOn: opened, coachName: null, ...verdict });
    else if (isOnTheBrink(state, clubId)) jobs.push({ clubId, openedOn: null, coachName: byClub.get(clubId)?.name ?? null, ...verdict });
  }
  return jobs.sort((a, b) => Number(a.openedOn === null) - Number(b.openedOn === null) || b.stature - a.stature || a.clubId.localeCompare(b.clubId));
}
