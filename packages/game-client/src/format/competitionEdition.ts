import type { Competition } from "@boleiro/engine/sim/gameState";
import type { EditionHost } from "@boleiro/engine/sim/hosts/venue";

/** What a competition's logo depends on: its key ("serie-a", "state-sp", "world-cup"), the season of its edition and the edition's host. */
export type CompetitionEdition = { key: string; season: number | null; host: EditionHost | null };

/** A competition id's key and the season it ends in: `state-sp-2027` is `state-sp` of 2027, `gb-eng-1` a key with none. */
export function editionKeyOf(id: string): { key: string; season: number | null } {
  const match = /^(.+)-(\d{4})$/.exec(id);
  return match ? { key: match[1] ?? id, season: Number(match[2]) } : { key: id, season: null };
}

/** A game competition's edition: a national competition's by its own id ("world-cup-2030"), a league's or cup's by the game's. */
export function competitionEditionOf(competition: Competition): CompetitionEdition {
  const { key, season } = editionKeyOf(competition.kind === "national" ? competition.nationalId : competition.id);
  const host = competition.kind === "continental" || competition.kind === "cupAbroad" || competition.kind === "national" ? (competition.host ?? null) : null;
  return { key, season: season ?? competition.season, host };
}
