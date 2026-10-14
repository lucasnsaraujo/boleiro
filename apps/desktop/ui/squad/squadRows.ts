import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { fatigueOn } from "@boleiro/engine/sim/players/fatigueOn";
import { isInjured } from "@boleiro/engine/sim/players/isInjured";
import type { Trait } from "@boleiro/engine/sim/players/playerProfile";
import { competitionName } from "@boleiro/game-client/format/competitionName";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";

export type PlayerStatus = { kind: "injured"; until: IsoDate } | { kind: "suspended"; competitions: string[] } | null;

export type SquadRow = {
  id: string;
  name: string;
  group: PositionGroup;
  strength: number;
  age: number;
  trait: Trait | null;
  /** Today's fatigue, where one full match adds 100. */
  fatigue: number;
  status: PlayerStatus;
  contractUntil: IsoDate;
  wage: number;
};

export type SquadSortKey = "name" | "strength" | "age" | "fatigue" | "contractUntil" | "wage";
export type SquadSort = { key: SquadSortKey; descending: boolean };
export type SquadGroup = { group: PositionGroup; rows: SquadRow[] };

const POSITION_ORDER: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

type StatusState = Pick<GameState, "date" | "discipline" | "competitions">;

/**
 * Card records of the competitions the club still has a game in. A competition opens its next stage
 * the day the last one ends, so a club with no game left in it is out or done, and the yellows and
 * bans it carries there no longer matter.
 */
export function liveDiscipline({ discipline, fixtures }: Pick<GameState, "discipline" | "fixtures">, clubId: string): GameState["discipline"] {
  const live = new Set(fixtures.filter((f) => !f.result && (f.homeId === clubId || f.awayId === clubId)).map((f) => f.competitionId));
  return Object.fromEntries(Object.entries(discipline).filter(([competitionId]) => live.has(competitionId)));
}

/** Injured beats suspended: an injured player is out of every competition. Pass the live discipline only. */
export function playerStatus(player: SimPlayer, { date, discipline, competitions }: StatusState): PlayerStatus {
  if (isInjured(player, date) && player.condition.injuredUntil) return { kind: "injured", until: player.condition.injuredUntil };
  const banned = Object.entries(discipline).flatMap(([competitionId, records]) => {
    const competition = competitions[competitionId];
    return (records[player.id]?.bans ?? 0) > 0 && competition ? [competitionName(competition)] : [];
  });
  return banned.length > 0 ? { kind: "suspended", competitions: banned } : null;
}

/** "Lesionado até 12 mar", "Suspenso: Baiano"; empty when he can play. */
export function statusText(status: PlayerStatus): string {
  if (!status) return "";
  if (status.kind === "injured") return `Lesionado até ${formatDayMonth(status.until)}`;
  return `Suspenso: ${status.competitions.join(", ")}`;
}

/** The coach's squad, one row per player. */
export function squadRows(state: Pick<GameState, "date" | "coachClubId" | "players" | "discipline" | "competitions" | "fixtures">): SquadRow[] {
  const { coachClubId, date } = state;
  if (!coachClubId) return [];
  const statusState = { ...state, discipline: liveDiscipline(state, coachClubId) };
  return Object.values(state.players)
    .filter((p) => p.clubId === coachClubId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
      strength: p.strength,
      age: p.age,
      trait: p.trait,
      fatigue: Math.round(fatigueOn(p, date)),
      status: playerStatus(p, statusState),
      contractUntil: p.contractUntil,
      wage: p.wage,
    }));
}

// Names, ages and contract ends read first-to-last; numbers where more is better read biggest first.
const ASCENDING_FIRST: ReadonlySet<SquadSortKey> = new Set(["name", "age", "contractUntil"]);

/** Clicking a column: a new one starts in its natural order, the same one flips. */
export function nextSort(current: SquadSort, key: SquadSortKey): SquadSort {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: !ASCENDING_FIRST.has(key) };
}

function compare(a: SquadRow, b: SquadRow, key: SquadSortKey): number {
  const x = a[key];
  const y = b[key];
  return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
}

/** The squad by position, keepers first, each group in the chosen order; ties go to the stronger player. */
export function sortedSquad(rows: readonly SquadRow[], { key, descending }: SquadSort): SquadGroup[] {
  const sorted = rows.toSorted((a, b) => (descending ? -1 : 1) * compare(a, b, key) || b.strength - a.strength || a.name.localeCompare(b.name, "pt-BR"));
  return POSITION_ORDER.map((group) => ({ group, rows: sorted.filter((row) => row.group === group) })).filter((g) => g.rows.length > 0);
}
