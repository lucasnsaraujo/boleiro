import { groupDates, type Formats } from "../formats.js";
import type { IsoDate } from "../gameState.js";
import { inSeason } from "../seasonCalendar.js";
import { conmebolDates, CUP_STAGES, stageDatesIn } from "./conmebolCups.js";

export type UefaCalendar = { leaguePhase: IsoDate[]; knockout: Record<string, IsoDate[]>; superCup: IsoDate };

const realDates = (cup: keyof typeof CUP_STAGES, name: string): IsoDate[] => [...(CUP_STAGES[cup].find((stage) => stage.name === name)?.dates ?? [])];

/**
 * UEFA's cups on the unified calendar, 2026 dates: the Champions League on the Libertadores' Tuesdays
 * and the Europa League on the Sul-Americana's Thursdays, round for round. guess: a league phase's
 * eight days are the six group days plus a Tuesday or Thursday in late March and late April; the
 * Champions League play-offs take the Tuesdays of the Sul-Americana's play-off weeks; the Super Cup
 * the Recopa's first Thursday.
 */
const UNIFIED: Record<"champions-league" | "europa-league", UefaCalendar> = {
  "champions-league": {
    leaguePhase: ["2026-03-24", "2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28", "2026-05-05", "2026-05-19", "2026-05-26"],
    knockout: {
      playoffs: ["2026-07-14", "2026-07-21"],
      "round-of-16": realDates("libertadores", "round-of-16"),
      "quarter-finals": realDates("libertadores", "quarter-finals"),
      "semi-finals": realDates("libertadores", "semi-finals"),
      final: realDates("libertadores", "final"),
    },
    superCup: "2026-02-19",
  },
  "europa-league": {
    leaguePhase: ["2026-03-26", "2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30", "2026-05-07", "2026-05-21", "2026-05-28"],
    knockout: {
      playoffs: realDates("sul-americana", "playoffs"),
      "round-of-16": realDates("sul-americana", "round-of-16"),
      "quarter-finals": realDates("sul-americana", "quarter-finals"),
      "semi-finals": realDates("sul-americana", "semi-finals"),
      final: realDates("sul-americana", "final"),
    },
    superCup: "2026-02-19",
  },
};

const PAIRED = { "champions-league": "libertadores", "europa-league": "sul-americana" } as const;

/**
 * A UEFA cup's 2026 dates on the unified calendar under `formats`: its first phase on its CONMEBOL
 * pair's group days (all eight days for a league phase), each knockout round with the legs it plays.
 */
export function unifiedUefaCalendar(cup: keyof typeof UNIFIED, formats: Formats): UefaCalendar {
  const { leaguePhase, knockout, superCup } = UNIFIED[cup];
  const firstPhase = formats.continentalGroups === "league-phase" ? leaguePhase : groupDates(realDates(PAIRED[cup], "groups"), formats);
  return { leaguePhase: firstPhase, knockout: Object.fromEntries(Object.entries(knockout).map(([name, dates]) => [name, stageDatesIn(name, dates, formats)])), superCup };
}

/** Every continental match day of the season, which the leagues keep a day clear of: CONMEBOL's, and on the unified calendar UEFA's too. */
export function continentalDates(season: number, formats: Formats): IsoDate[] {
  const conmebol = conmebolDates(season, formats);
  if (formats.calendar !== "unified") return conmebol;
  const uefa = (["champions-league", "europa-league"] as const).flatMap((cup) => {
    const calendar = unifiedUefaCalendar(cup, formats);
    return [...calendar.leaguePhase, ...Object.values(calendar.knockout).flat(), calendar.superCup].map((date) => inSeason(date, season));
  });
  return [...conmebol, ...uefa];
}
