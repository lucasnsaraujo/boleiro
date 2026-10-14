import { squadStrength } from "@boleiro/engine/sim/finances/squadStrength";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";

/** What the new-career screen reads from the season drawn before any coach is in it. */
export const PREVIEW_KEYS = ["clubs", "players", "finances", "fixtures"] as const;

export type ClubPreview = {
  /** Mean strength of the best eleven, rounded. */
  strength: number;
  /** 1 for the strongest squad of the club's division. */
  rank: number;
  cash: number;
  monthlyWages: number;
  debut: { date: IsoDate; opponentId: string; isHome: boolean } | null;
};

export type ClubPreviews = Readonly<Record<string, ClubPreview>>;

/** Strength, money and first match of every club in a division, for the club picker. */
export function clubPreviews(state: Pick<GameState, (typeof PREVIEW_KEYS)[number]>): ClubPreviews {
  const squads = new Map<string, SimPlayer[]>();
  for (const player of Object.values(state.players)) squads.set(player.clubId, [...(squads.get(player.clubId) ?? []), player]);

  const debuts = new Map<string, ClubPreview["debut"]>();
  for (const fixture of state.fixtures.toSorted((a, b) => a.date.localeCompare(b.date))) {
    for (const [clubId, opponentId, isHome] of [
      [fixture.homeId, fixture.awayId, true],
      [fixture.awayId, fixture.homeId, false],
    ] as const) {
      if (!debuts.has(clubId)) debuts.set(clubId, { date: fixture.date, opponentId, isHome });
    }
  }

  const national = Object.values(state.clubs).filter((club) => club.division !== null);
  const strength = new Map(national.map((club) => [club.id, Math.round(squadStrength(squads.get(club.id) ?? []))]));
  return Object.fromEntries(
    national.map((club) => {
      const own = strength.get(club.id) ?? 0;
      const stronger = national.filter((other) => other.division === club.division && (strength.get(other.id) ?? 0) > own).length;
      const tiedBefore = national.filter((other) => other.division === club.division && strength.get(other.id) === own && other.id < club.id).length;
      const squad = squads.get(club.id) ?? [];
      return [
        club.id,
        {
          strength: own,
          rank: stronger + tiedBefore + 1,
          cash: state.finances[club.id]?.cash ?? 0,
          monthlyWages: squad.reduce((sum, player) => sum + player.wage, 0),
          debut: debuts.get(club.id) ?? null,
        },
      ];
    }),
  );
}
