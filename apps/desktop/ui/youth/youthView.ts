import type { Club } from "@boleiro/data/clubs";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import { NO_SQUAD_WAGE } from "@boleiro/engine/sim/players/developPlayers";
import { SQUAD_CAP } from "@boleiro/engine/sim/transfers/squadCap";
import { wageRateOf } from "@boleiro/engine/sim/transfers/wageDemand";
import { academySquad, LEAVING_AGE, scoutedStars, type Copinha } from "@boleiro/engine/sim/youth/academy";
import { copinhaDate, copinhaRun } from "@boleiro/engine/sim/youth/copinha";
import { copinhaRoundName } from "@boleiro/game-client/format/copinhaRoundName";

export const YOUTH_KEYS = ["youth", "players", "clubs", "season", "date", "coachClubId"] as const;
export type YouthState = Pick<GameState, (typeof YOUTH_KEYS)[number]>;

/** The academy's age groups as the screen filters them. */
export const AGE_FILTERS = ["all", "u17", "u20"] as const;
export type AgeFilter = (typeof AGE_FILTERS)[number];
const UNDER_17 = 17;
// A rival at his position the kid would fight for a place, as the screen lists them.
const RIVALS_SHOWN = 3;

export type KidRow = {
  id: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  stars: { low: number; high: number };
  hometown: string;
  /** Joined at the last trials. */
  isNew: boolean;
  /** Turns 21 at the season's turn: he must go up, out or be sold before then. */
  isLeaving: boolean;
  joinedSeason: number;
};

export type KidDetail = KidRow & {
  /** What his first professional contract would pay a month. */
  wage: number;
  squadSize: number;
  rivals: { id: string; name: string; age: number; strength: number }[];
};

export type CopinhaNote = { kind: "upcoming"; date: string } | { kind: "champion"; season: number } | { kind: "out"; season: number; round: string } | { kind: "absent"; season: number };

export type YouthView = {
  club: Club;
  season: number;
  kids: KidRow[];
  squadSize: number;
  squadCap: number;
  copinha: CopinhaNote;
  detailOf: (id: string) => KidDetail | null;
};

/** This season's Copinha as the coach's academy saw it, or the next one while it is still to come. */
function copinhaNote(copinha: Copinha | undefined, state: Pick<GameState, "season" | "date">, clubId: string): CopinhaNote {
  const { season, date } = state;
  if (copinha?.season !== season) return { kind: "upcoming", date: date <= copinhaDate(season) ? copinhaDate(season) : copinhaDate(season + 1) };
  const run = copinhaRun(copinha, clubId);
  if (!run) return { kind: "absent", season };
  if (run.isChampion) return { kind: "champion", season };
  return { kind: "out", season, round: copinhaRoundName(run.lastRoundSize) };
}

/** Whether the kid falls in the filter's age group. */
export function isInAgeGroup(kid: Pick<KidRow, "age">, filter: AgeFilter): boolean {
  if (filter === "all") return true;
  return filter === "u17" ? kid.age <= UNDER_17 : kid.age > UNDER_17;
}

/** The coach's academy as the youth screen shows it, best first; null with no club. */
export function youthView(state: YouthState): YouthView | null {
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  if (!club) return null;
  const squad = Object.values(state.players).filter((p) => p.clubId === club.id);
  const rate = wageRateOf(squad);
  const rowOf = (p: NonNullable<GameState["youth"]>["prospects"][string]): KidRow => ({
    id: p.id,
    name: p.name,
    group: p.group,
    age: p.age,
    strength: Math.round(p.strength),
    stars: scoutedStars(p, state.season),
    hometown: p.hometown,
    isNew: p.joinedSeason === state.season,
    isLeaving: p.age + 1 >= LEAVING_AGE,
    joinedSeason: p.joinedSeason,
  });
  const kids = academySquad(state.youth, club.id).map(rowOf);
  const rivalsOf = (group: PositionGroup): SimPlayer[] =>
    squad.filter((p) => p.group === group).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id)).slice(0, RIVALS_SHOWN);
  return {
    club,
    season: state.season,
    kids,
    squadSize: squad.length,
    squadCap: SQUAD_CAP,
    copinha: copinhaNote(state.youth?.copinha, state, club.id),
    detailOf(id) {
      const prospect = state.youth?.prospects[id];
      if (!prospect || prospect.clubId !== club.id) return null;
      return {
        ...rowOf(prospect),
        wage: Math.max(NO_SQUAD_WAGE, rate(prospect.strength)),
        squadSize: squad.length,
        rivals: rivalsOf(prospect.group).map((p) => ({ id: p.id, name: p.name, age: p.age, strength: Math.round(p.strength) })),
      };
    },
  };
}
