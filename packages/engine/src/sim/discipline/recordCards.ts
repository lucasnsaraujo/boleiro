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

type Records = Record<string, PlayerDiscipline>;
type Draft = { records: Records; banned: Set<string> };

/**
 * One played match's effect on card records in its competition: the two clubs' banned players
 * serve a match, then this match's cards add yellows and bans. Yellows from a match that ended
 * in a red do not count toward the three (RGC CBF art. 97). `records` is edited in place and
 * `banned` (players with bans to serve) kept in step with it.
 */
function recordCards(
  { records, banned }: Draft,
  competition: Competition,
  fixture: Fixture,
  bookings: readonly Booking[],
  clubOf: (playerId: string) => string | undefined,
  random: () => number,
): DisciplineEvent[] {
  const playing = [fixture.homeId, fixture.awayId];
  const setRecord = (id: string, record: PlayerDiscipline) => {
    records[id] = record;
    if (record.bans > 0) banned.add(id);
    else banned.delete(id);
  };
  for (const id of [...banned]) {
    const record = records[id];
    const clubId = clubOf(id);
    if (record && clubId && playing.includes(clubId)) setRecord(id, { ...record, bans: record.bans - 1 });
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
      const isBanned = yellows === YELLOWS_PER_BAN;
      setRecord(booking.playerId, { ...record, yellows: isBanned ? 0 : yellows, bans: record.bans + (isBanned ? 1 : 0) });
      if (isBanned) events.push({ type: "playerSuspended", ...about(booking), matches: 1 });
      continue;
    }
    const secondYellow = booking.card === "secondYellow";
    const matches = secondYellow || random() >= STRAIGHT_RED_EXTRA_BAN_CHANCE ? 1 : 2;
    events.push({ type: "playerSentOff", ...about(booking), minute: booking.minute, secondYellow });
    events.push({ type: "playerSuspended", ...about(booking), matches });
    setRecord(booking.playerId, { ...record, bans: record.bans + matches });
  }
  return events;
}

export type DisciplineDay = {
  /** Players who must sit out their club's next match in this competition. */
  suspended: (competitionId: string) => ReadonlySet<string>;
  /** Records one played match's cards; see recordCards. */
  record: (
    competition: Competition,
    fixture: Fixture,
    bookings: readonly Booking[],
    clubOf: (playerId: string) => string | undefined,
    random: () => number,
  ) => DisciplineEvent[];
  /** The card records after the day's matches; the `discipline` it was opened on is left unchanged. */
  discipline: () => Discipline;
};

/** A day of card records: each competition's records are copied once, at its first match of the day. */
export function openDisciplineDay(discipline: Discipline): DisciplineDay {
  const drafts = new Map<string, Draft>();
  const recorded: string[] = [];
  const draftOf = (competitionId: string): Draft => {
    const known = drafts.get(competitionId);
    if (known) return known;
    const records: Records = { ...discipline[competitionId] };
    const draft = { records, banned: new Set(Object.keys(records).filter((id) => (records[id]?.bans ?? 0) > 0)) };
    drafts.set(competitionId, draft);
    return draft;
  };
  return {
    suspended: (competitionId) => new Set(draftOf(competitionId).banned),
    record: (competition, fixture, bookings, clubOf, random) => {
      if (!recorded.includes(competition.id)) recorded.push(competition.id);
      return recordCards(draftOf(competition.id), competition, fixture, bookings, clubOf, random);
    },
    discipline: () => {
      if (!recorded.length) return discipline;
      const next = { ...discipline };
      for (const id of recorded) next[id] = draftOf(id).records;
      return next;
    },
  };
}
