import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { TRANSFER_WINDOWS } from "@boleiro/engine/sim/transfers/transferWindows";
import { competitionName } from "@boleiro/game-client/format/competitionName";

export type Outcome = "win" | "draw" | "loss";

export type CalendarEntry =
  | {
      kind: "match";
      date: IsoDate;
      fixtureId: string;
      competition: string;
      isHome: boolean;
      opponentId: string;
      result: { homeGoals: number; awayGoals: number; outcome: Outcome; onPenalties: boolean } | null;
    }
  | { kind: "window"; date: IsoDate; opens: boolean };

/** One month of the season: the coach's games and the transfer window's dates, in date order. */
export type CalendarMonth = { month: number; entries: CalendarEntry[]; hasWindow: boolean };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthOf = (date: IsoDate) => Number(date.slice(5, 7));

function outcomeOf(goalsFor: number, goalsAgainst: number, penaltyWinnerId: string | undefined, clubId: string): Outcome {
  if (penaltyWinnerId) return penaltyWinnerId === clubId ? "win" : "loss";
  return goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw";
}

export function calendarMonths({ season, coachClubId, fixtures, competitions }: Pick<GameState, "season" | "coachClubId" | "fixtures" | "competitions">): CalendarMonth[] {
  const entries: CalendarEntry[] = [];
  for (const f of fixtures) {
    if (!coachClubId || (f.homeId !== coachClubId && f.awayId !== coachClubId)) continue;
    const isHome = f.homeId === coachClubId;
    const competition = competitions[f.competitionId];
    const { result } = f;
    entries.push({
      kind: "match",
      date: f.date,
      fixtureId: f.id,
      competition: competition ? competitionName(competition) : "",
      isHome,
      opponentId: isHome ? f.awayId : f.homeId,
      result: result && {
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        outcome: isHome
          ? outcomeOf(result.homeGoals, result.awayGoals, result.penaltyWinnerId, coachClubId)
          : outcomeOf(result.awayGoals, result.homeGoals, result.penaltyWinnerId, coachClubId),
        onPenalties: result.penaltyWinnerId !== undefined,
      },
    });
  }
  for (const window of TRANSFER_WINDOWS) {
    entries.push({ kind: "window", date: `${season}-${window.opens}`, opens: true }, { kind: "window", date: `${season}-${window.closes}`, opens: false });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const windowMonths = new Set(TRANSFER_WINDOWS.flatMap(({ opens, closes }) => MONTHS.filter((m) => m >= Number(opens.slice(0, 2)) && m <= Number(closes.slice(0, 2)))));
  return MONTHS.map((month) => ({ month, entries: entries.filter((e) => monthOf(e.date) === month), hasWindow: windowMonths.has(month) }));
}
