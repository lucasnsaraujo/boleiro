/** A country's continental place: one for a cup finalist, or a run of places down the league table. */
export type ContinentalSlot<Entry extends string> =
  | { entry: Entry; from: "cupChampion" | "cupRunnerUp" }
  | { entry: Entry; from: "league"; places: number };

export type CupFinal = { championId: string; runnerUpId: string };

/**
 * Next season's continental entrants of one country, by entry, from its top league's final table and
 * its cup final. Cup places are given first; a club takes one place only, so league places skip the
 * clubs already in and pass down the table, as a finalist hands its league place down.
 */
export function continentalPlaces<Entry extends string>(
  slots: readonly ContinentalSlot<Entry>[],
  table: readonly string[],
  cup: CupFinal | null,
): Map<Entry, string[]> {
  const places = new Map<Entry, string[]>(slots.map((slot) => [slot.entry, []]));
  const taken = new Set<string>();
  const give = (entry: Entry, ids: readonly string[]) => {
    for (const id of ids) taken.add(id);
    places.get(entry)?.push(...ids);
  };
  for (const slot of slots) {
    if (slot.from === "cupChampion" && cup) give(slot.entry, [cup.championId]);
    if (slot.from === "cupRunnerUp" && cup) give(slot.entry, [cup.runnerUpId]);
  }
  const league = table.filter((id) => !taken.has(id));
  let next = 0;
  for (const slot of slots) {
    if (slot.from !== "league") continue;
    give(slot.entry, league.slice(next, next + slot.places));
    next += slot.places;
  }
  return places;
}
