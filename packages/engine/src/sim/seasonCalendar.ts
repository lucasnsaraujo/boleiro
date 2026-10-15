import type { Division } from "@boleiro/data/players";
import type { IsoDate, SeasonCalendar } from "./gameState.js";
import { addDays, daysBetween } from "./dates.js";

// Date-bases of the CBF 2026 calendar (Trivela, https://trivela.com.br/brasil/calendario-do-futebol-brasileiro-2026/):
// state championships 11 Jan–8 Mar with 11 dates, Série A 28 Jan–2 Dec, B 21 Mar–28 Nov,
// C 5 Apr–25 Oct, D 5 Apr–13 Sep. Later seasons reuse them on the same weekday.
const LEAGUE_WINDOWS: Record<Division, [IsoDate, IsoDate]> = {
  A: ["2026-01-28", "2026-12-02"],
  B: ["2026-03-21", "2026-11-28"],
  C: ["2026-04-05", "2026-10-25"],
  D: ["2026-04-05", "2026-09-13"],
};

// Every Sunday from 11 Jan to 8 Mar is a real date-base; the two Wednesdays that make 11 dates are a guess.
const STATE_CHAMPIONSHIP_DATES: IsoDate[] = [
  "2026-01-11", "2026-01-14", "2026-01-18", "2026-01-21", "2026-01-25",
  "2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22", "2026-03-01", "2026-03-08",
];

// Copa do Brasil 2026: phases 1–4 single leg, phase 5 to semi-finals two legs, single-leg final on 6 Dec
// (Band, https://www.band.com.br/esportes/conheca-o-novo-formato-da-copa-do-brasil-a-partir-de-2026-202510011208).
// Phase 1 on 18 Feb (Band), phases 3 and 4 on 11 and 18 Mar (BNews), round of 16 on 2 and 8 Aug and
// quarter-finals on 26 Aug and 2 Sep (Netflu).
const COPA_DO_BRASIL_ROUNDS: { name: string; dates: IsoDate[] }[] = [
  { name: "phase-1", dates: ["2026-02-18"] },
  { name: "phase-2", dates: ["2026-02-25"] }, // guess: the week between the sourced phases 1 and 3
  { name: "phase-3", dates: ["2026-03-11"] },
  { name: "phase-4", dates: ["2026-03-18"] },
  { name: "phase-5", dates: ["2026-04-22", "2026-05-13"] }, // guess: no published date found
  { name: "round-of-16", dates: ["2026-08-02", "2026-08-08"] },
  { name: "quarter-finals", dates: ["2026-08-26", "2026-09-02"] },
  { name: "semi-finals", dates: ["2026-10-28", "2026-11-04"] }, // guess: reported 1 and 13 Nov fall on a Sunday and a Friday
  { name: "final", dates: ["2026-12-06"] },
];

const LEAGUE_WEEKDAYS = new Set([0, 3, 6]); // guess: Sunday, Wednesday and Saturday, the usual Brasileirão match days
const MIN_DAYS_BETWEEN_GAMES = 3; // guess: two full rest days, the shortest gap CBF schedules in practice

/** A 2026 date moved to `season`, on the same weekday within three days. */
export function inSeason(date2026: IsoDate, season: number): IsoDate {
  const shifted = `${season}${date2026.slice(4)}`;
  const shift = (new Date(date2026).getUTCDay() - new Date(shifted).getUTCDay() + 7) % 7;
  return addDays(shifted, shift > 3 ? shift - 7 : shift);
}

function pickDates(division: Division, count: number, season: number, reserved: readonly IsoDate[]): IsoDate[] {
  const [start, end] = LEAGUE_WINDOWS[division].map((date) => inSeason(date, season)) as [IsoDate, IsoDate];
  const span = daysBetween(start, end);
  const candidates: IsoDate[] = [];
  for (let day = 0; day <= span; day++) {
    const date = addDays(start, day);
    const restsFromReserved = reserved.every((other) => Math.abs(daysBetween(date, other)) >= MIN_DAYS_BETWEEN_GAMES);
    if (LEAGUE_WEEKDAYS.has(new Date(date).getUTCDay()) && restsFromReserved) candidates.push(date);
  }
  const picked: IsoDate[] = [];
  let next = 0;
  for (let i = 0; i < count; i++) {
    const target = count > 1 ? Math.floor((i * span) / (count - 1)) : 0;
    const last = picked.at(-1);
    while (next < candidates.length) {
      const date = candidates[next] as IsoDate;
      const offset = daysBetween(start, date);
      if (offset >= target || candidates.length - next <= count - i) {
        if (!last || daysBetween(last, date) >= MIN_DAYS_BETWEEN_GAMES) break;
      }
      next++;
    }
    const date = candidates[next++];
    if (!date) throw new Error(`Série ${division} ${season}: ${count} dates do not fit between ${start} and ${end}`);
    picked.push(date);
  }
  return picked;
}

export function seasonCalendar(season: number, dateCounts: Record<Division, number>): SeasonCalendar {
  const stateChampionshipDates = STATE_CHAMPIONSHIP_DATES.map((date) => inSeason(date, season));
  const copaDoBrasilRounds = COPA_DO_BRASIL_ROUNDS.map(({ name, dates }) => ({ name, dates: dates.map((date) => inSeason(date, season)) }));
  const reserved = [...stateChampionshipDates, ...copaDoBrasilRounds.flatMap((round) => round.dates)];
  const leagueDates = {
    A: pickDates("A", dateCounts.A, season, reserved),
    B: pickDates("B", dateCounts.B, season, reserved),
    C: pickDates("C", dateCounts.C, season, reserved),
    D: pickDates("D", dateCounts.D, season, reserved),
  };
  return { season, stateChampionshipDates, copaDoBrasilRounds, leagueDates };
}
