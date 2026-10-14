import type { Club } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { Coach, JobOffer } from "@boleiro/engine/sim/coach/coach";
import type { IsoDate } from "@boleiro/engine/sim/gameState";

export type OfferRow = JobOffer & { division: Division | null; /** Days the club still waits, today included. */ daysLeft: number };

const DAY_MS = 86_400_000;
const rankOf = (division: Division | null) => (division ? "ABCD".indexOf(division) : 4);

/** The offers on the table, biggest division first, then the best paid. */
export function offerRows({ date, coach, clubs }: { date: IsoDate; coach: Pick<Coach, "offers">; clubs: Readonly<Record<string, Pick<Club, "division">>> }): OfferRow[] {
  return coach.offers
    .map((offer) => ({
      ...offer,
      division: clubs[offer.clubId]?.division ?? null,
      daysLeft: Math.round((Date.parse(offer.expiresOn) - Date.parse(date)) / DAY_MS) + 1,
    }))
    .sort((a, b) => rankOf(a.division) - rankOf(b.division) || b.salary - a.salary);
}
