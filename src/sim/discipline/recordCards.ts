import type { Competition, Fixture } from "../gameState.js";
import type { Discipline, DisciplineEvent, PlayerDiscipline } from "./discipline.js";
import type { Booking } from "./drawCards.js";
import { yellowPhase } from "./yellowPhase.js";

const YELLOWS_PER_BAN = 3;
// A red card bans the player from the competition's next match whatever the court decides (RGC CBF
// art. 60, as quoted by FPF-PE, https://www.fpf-pe.com.br/assets/uploads/170837049013.pdf). A second
// yellow ends there. guess: the sports court (STJD) adds one more match for half of straight reds;
// CBJD arts. 250, 254 and 254-A range from one to twelve matches by offence.
const STRAIGHT_RED_EXTRA_BAN_CHANCE = 0.5;

const EMPTY: PlayerDiscipline = { yellows: 0, phase: 0, bans: 0 };

/**
 * One played match's effect on card records in its competition: the two clubs' banned players
 * serve a match, then this match's cards add yellows and bans. Yellows from a match that ended
 * in a red do not count toward the three (RGC CBF art. 97).
 */
export function recordCards(
  discipline: Discipline,
  competition: Competition,
  fixture: Fixture,
  bookings: readonly Booking[],
  clubOf: (playerId: string) => string | undefined,
  random: () => number,
): { discipline: Discipline; events: DisciplineEvent[] } {
  const records = { ...discipline[competition.id] };
  const playing = [fixture.homeId, fixture.awayId];
  for (const [id, record] of Object.entries(records)) {
    const clubId = clubOf(id);
    if (record.bans > 0 && clubId && playing.includes(clubId)) records[id] = { ...record, bans: record.bans - 1 };
  }

  const events: DisciplineEvent[] = [];
  const phase = yellowPhase(competition, fixture.stage);
  const about = (booking: Booking) => ({
    playerId: booking.playerId, clubId: booking.clubId, competitionId: competition.id, fixtureId: fixture.id, date: fixture.date,
  });
  const sentOff = new Set(bookings.filter((b) => b.card !== "yellow").map((b) => b.playerId));
  for (const booking of bookings) {
    const current = records[booking.playerId] ?? EMPTY;
    const record = current.phase < phase ? { ...current, yellows: 0, phase } : current;
    if (booking.card === "yellow") {
      events.push({ type: "playerBooked", ...about(booking), minute: booking.minute });
      if (sentOff.has(booking.playerId)) continue;
      const yellows = record.yellows + 1;
      const banned = yellows === YELLOWS_PER_BAN;
      records[booking.playerId] = { ...record, yellows: banned ? 0 : yellows, bans: record.bans + (banned ? 1 : 0) };
      if (banned) events.push({ type: "playerSuspended", ...about(booking), matches: 1 });
      continue;
    }
    const secondYellow = booking.card === "secondYellow";
    const matches = secondYellow || random() >= STRAIGHT_RED_EXTRA_BAN_CHANCE ? 1 : 2;
    events.push({ type: "playerSentOff", ...about(booking), minute: booking.minute, secondYellow });
    events.push({ type: "playerSuspended", ...about(booking), matches });
    records[booking.playerId] = { ...record, bans: record.bans + matches };
  }
  return { discipline: { ...discipline, [competition.id]: records }, events };
}
