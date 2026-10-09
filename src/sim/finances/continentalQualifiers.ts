export type ContinentalQualifiers = { libertadoresGroups: string[]; libertadoresPreliminary: string[]; sulAmericana: string[] };

// From 2026 the Série A sends its top 4 to the Libertadores group stage and the 5th to the preliminary
// phase, the Copa do Brasil champion goes to the group stage and the runner-up to the preliminary
// phase, and a finalist who also qualified through the league hands its place down the table (CBF via
// Soccerway, https://br.soccerway.com/noticias/futebol-brasileirao-betano-vice-da-copa-do-brasil-vai-para-pre-libertadores-a-partir-de-2026-define-cbf/IBTDPtvh;
// Goal, https://www.goal.com/br/listas/copa-brasil-duas-vagas-fica-distribuicao-times-classificados-libertadores-partir-2026/bltf66e5acd259dcc21).
// The next six Série A clubs go to the Sul-Americana. guess: the game skips the rarer cascades
// (continental champions, a lower-division finalist who already qualified another way).
const LEAGUE_GROUP_PLACES = 4;
const LEAGUE_PRELIMINARY_PLACES = 1;
const SUL_AMERICANA_PLACES = 6;

/** Next season's continental entrants, from the finished Série A table and Copa do Brasil final. */
export function continentalQualifiers(table: readonly string[], copa: { championId: string; runnerUpId: string } | null): ContinentalQualifiers {
  const finalists = copa ? [copa.championId, copa.runnerUpId] : [];
  const league = table.filter((id) => !finalists.includes(id));
  const preliminaryEnd = LEAGUE_GROUP_PLACES + LEAGUE_PRELIMINARY_PLACES;
  return {
    libertadoresGroups: [...(copa ? [copa.championId] : []), ...league.slice(0, LEAGUE_GROUP_PLACES)],
    libertadoresPreliminary: [...(copa ? [copa.runnerUpId] : []), ...league.slice(LEAGUE_GROUP_PLACES, preliminaryEnd)],
    sulAmericana: league.slice(preliminaryEnd, preliminaryEnd + SUL_AMERICANA_PLACES),
  };
}
