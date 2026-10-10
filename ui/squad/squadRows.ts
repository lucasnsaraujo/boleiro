import type { PositionGroup } from "../../src/engine/match.js";
import type { GameState, IsoDate, SimPlayer } from "../../src/sim/gameState.js";
import { fatigueOn } from "../../src/sim/players/fatigueOn.js";
import { isInjured } from "../../src/sim/players/isInjured.js";
import type { Trait } from "../../src/sim/players/playerProfile.js";
import { competitionName } from "../format/competitionName.js";

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

export const POSITION_ORDER: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

type StatusState = Pick<GameState, "date" | "discipline" | "competitions">;

/** Injured beats suspended: an injured player is out of every competition. */
export function playerStatus(player: SimPlayer, { date, discipline, competitions }: StatusState): PlayerStatus {
  if (isInjured(player, date) && player.condition.injuredUntil) return { kind: "injured", until: player.condition.injuredUntil };
  const banned = Object.entries(discipline).flatMap(([competitionId, records]) => {
    const competition = competitions[competitionId];
    return (records[player.id]?.bans ?? 0) > 0 && competition ? [competitionName(competition)] : [];
  });
  return banned.length > 0 ? { kind: "suspended", competitions: banned } : null;
}

/** The coach's squad, one row per player. */
export function squadRows(state: Pick<GameState, "date" | "coachClubId" | "players" | "discipline" | "competitions">): SquadRow[] {
  const { coachClubId, date } = state;
  if (!coachClubId) return [];
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
      status: playerStatus(p, state),
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
