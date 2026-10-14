import type { Division } from "@boleiro/data/players";
import type { LeagueFormatId } from "../gameState.js";
import type { ContinentalSlot } from "./continentalPlaces.js";

export type BrazilContinentalEntry = "libertadoresGroups" | "libertadoresPreliminary" | "sulAmericana";

type FullTierCountry = {
  /** The national leagues, top first; each format decides its own champion, promoted and relegated clubs. */
  levels: readonly { division: Division; format: LeagueFormatId }[];
  /** Clubs relegated from the bottom level leave the pyramid, and the estaduais refill it to this size. */
  bottomLevelSize: number;
  continental: readonly ContinentalSlot<BrazilContinentalEntry>[];
};

/**
 * Brazil as the full tier plays it: Série A–D, refilled from the estaduais, with the Copa do Brasil
 * and the CONMEBOL places.
 *
 * Série D 2026 has 96 clubs (CBF, https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-serie-d/a/cbf-publica-documentos-tecnicos-da-nova-serie-d).
 *
 * From 2026 the Série A sends its top 4 to the Libertadores group stage and the 5th to the preliminary
 * phase, the Copa do Brasil champion goes to the group stage and the runner-up to the preliminary
 * phase, and a finalist who also qualified through the league hands its place down the table (CBF via
 * Soccerway, https://br.soccerway.com/noticias/futebol-brasileirao-betano-vice-da-copa-do-brasil-vai-para-pre-libertadores-a-partir-de-2026-define-cbf/IBTDPtvh;
 * Goal, https://www.goal.com/br/listas/copa-brasil-duas-vagas-fica-distribuicao-times-classificados-libertadores-partir-2026/bltf66e5acd259dcc21).
 * The next six Série A clubs go to the Sul-Americana. guess: the game skips the rarer cascades
 * (continental champions, a lower-division finalist who already qualified another way).
 */
export const BRAZIL: FullTierCountry = {
  levels: [
    { division: "A", format: "serie-a" },
    { division: "B", format: "serie-b" },
    { division: "C", format: "serie-c" },
    { division: "D", format: "serie-d" },
  ],
  bottomLevelSize: 96,
  continental: [
    { entry: "libertadoresGroups", from: "cupChampion" },
    { entry: "libertadoresPreliminary", from: "cupRunnerUp" },
    { entry: "libertadoresGroups", from: "league", places: 4 },
    { entry: "libertadoresPreliminary", from: "league", places: 1 },
    { entry: "sulAmericana", from: "league", places: 6 },
  ],
};
