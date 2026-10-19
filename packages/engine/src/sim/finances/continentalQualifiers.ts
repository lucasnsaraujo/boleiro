import { BRAZIL } from "../world/brazil.js";
import { continentalPlaces, type CupFinal } from "../world/continentalPlaces.js";

export type ContinentalQualifiers = { libertadoresGroups: string[]; libertadoresPreliminary: string[]; sulAmericana: string[] };

/** Next season's continental entrants, from the finished Série A table and Copa do Brasil final, by Brazil's places. */
export function continentalQualifiers(table: readonly string[], copa: CupFinal | null): ContinentalQualifiers {
  const places = continentalPlaces(BRAZIL.continental, table, copa);
  return {
    libertadoresGroups: places.get("libertadoresGroups") ?? [],
    libertadoresPreliminary: places.get("libertadoresPreliminary") ?? [],
    sulAmericana: places.get("sulAmericana") ?? [],
  };
}
