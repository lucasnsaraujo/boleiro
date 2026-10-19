import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { competitionKey, type StrengthMark } from "@boleiro/engine/sim/history/history";
import type { Trait } from "@boleiro/engine/sim/players/playerProfile";
import { competitionName } from "@boleiro/game-client/format/competitionName";
import { liveDiscipline, playerStatus, type PlayerStatus } from "./squadRows.js";

export type PlayerCard = {
  id: string;
  name: string;
  group: PositionGroup;
  age: number;
  /** His citizenships as the data names them, his own first; none when it gives none. */
  nationalities: string[];
  trait: Trait | null;
  strength: number;
  /** One mark per season, oldest first, ending with this season's. */
  strengthBySeason: StrengthMark[];
  clubId: string;
  status: PlayerStatus;
  /** Goals and the yellows counting toward a ban, by competition this season; minutes in every competition. */
  season: { goals: { competition: string; goals: number }[]; minutes: number; yellows: { competition: string; yellows: number }[] };
  /** Games and goals for his current club since the save began. */
  atClub: { apps: number; goals: number };
  contract: { until: IsoDate; wage: number; loan: { fromClubId: string; until: IsoDate } | null; leavesForId: string | null };
  isCoachsPlayer: boolean;
};

type CardState = Pick<GameState, "date" | "season" | "coachClubId" | "players" | "discipline" | "competitions" | "fixtures" | "history" | "market">;

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
  const discipline = liveDiscipline(state, player.clubId);
  const yellows = Object.entries(discipline).flatMap(([competitionId, records]) => {
    const count = records[playerId]?.yellows ?? 0;
    const competition = state.competitions[competitionId];
    return count > 0 && competition ? [{ competition: competitionName(competition), yellows: count }] : [];
  });
  const atClub = state.history.players[player.clubId]?.[playerId];
  const loan = state.market.loans[playerId];
  const pastStrength = (state.history.strength[playerId] ?? []).filter((mark) => mark.season < state.season);
  return {
    id: player.id,
    name: player.name,
    group: player.group,
    age: player.age,
    nationalities: player.nationalities,
    trait: player.trait,
    strength: player.strength,
    strengthBySeason: [...pastStrength, { season: state.season, strength: player.strength }],
    clubId: player.clubId,
    status: playerStatus(player, { ...state, discipline }),
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
