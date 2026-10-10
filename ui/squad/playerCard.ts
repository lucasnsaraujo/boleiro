import type { PositionGroup } from "../../src/engine/match.js";
import type { GameState, IsoDate } from "../../src/sim/gameState.js";
import { competitionKey } from "../../src/sim/history/history.js";
import { fatigueOn } from "../../src/sim/players/fatigueOn.js";
import type { Trait } from "../../src/sim/players/playerProfile.js";
import { competitionName } from "../format/competitionName.js";
import { playerStatus, type PlayerStatus } from "./squadRows.js";

export type PlayerCard = {
  id: string;
  name: string;
  group: PositionGroup;
  age: number;
  nationalities: string[];
  trait: Trait | null;
  strength: number;
  clubId: string;
  fatigue: number;
  status: PlayerStatus;
  /** Goals and pending yellows by competition this season; minutes in every competition. */
  season: { goals: { competition: string; goals: number }[]; minutes: number; yellows: { competition: string; yellows: number }[] };
  /** Games and goals for his current club since the save began. */
  atClub: { apps: number; goals: number };
  contract: { until: IsoDate; wage: number; loan: { fromClubId: string; until: IsoDate } | null; leavesForId: string | null };
  isCoachsPlayer: boolean;
};

type CardState = Pick<GameState, "date" | "coachClubId" | "players" | "discipline" | "competitions" | "history" | "market">;

export function playerCard(state: CardState, playerId: string): PlayerCard | null {
  const player = state.players[playerId];
  if (!player) return null;
  const competitions = Object.values(state.competitions);
  const nameOfKey = (key: string) => {
    const competition = competitions.find((c) => competitionKey(c.id) === key);
    return competition ? competitionName(competition) : null;
  };
  const goals = Object.entries(state.history.current.goals)
    .flatMap(([key, byPlayer]) => {
      const count = byPlayer[playerId] ?? 0;
      const competition = nameOfKey(key);
      return count > 0 && competition ? [{ competition, goals: count }] : [];
    })
    .sort((a, b) => b.goals - a.goals);
  const yellows = Object.entries(state.discipline).flatMap(([competitionId, records]) => {
    const count = records[playerId]?.yellows ?? 0;
    const competition = state.competitions[competitionId];
    return count > 0 && competition ? [{ competition: competitionName(competition), yellows: count }] : [];
  });
  const atClub = state.history.players[player.clubId]?.[playerId];
  const loan = state.market.loans[playerId];
  return {
    id: player.id,
    name: player.name,
    group: player.group,
    age: player.age,
    nationalities: player.nationalities,
    trait: player.trait,
    strength: player.strength,
    clubId: player.clubId,
    fatigue: Math.round(fatigueOn(player, state.date)),
    status: playerStatus(player, state),
    season: { goals, minutes: player.condition.seasonMinutes, yellows },
    atClub: { apps: atClub?.apps ?? 0, goals: atClub?.goals ?? 0 },
    contract: {
      until: player.contractUntil,
      wage: player.wage,
      loan: loan ? { fromClubId: loan.fromClubId, until: loan.until } : null,
      leavesForId: state.market.preContracts[playerId] ?? null,
    },
    isCoachsPlayer: player.clubId === state.coachClubId,
  };
}
