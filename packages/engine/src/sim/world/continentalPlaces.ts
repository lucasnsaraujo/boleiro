/** A country's continental place: one for a cup finalist, or a run of places down the league table; a country lists its entries best first. */
export type ContinentalSlot<Entry extends string> =
  | { entry: Entry; from: "cupChampion" | "cupRunnerUp" }
  | { entry: Entry; from: "league"; places: number };

export type LeaguePlace<Entry extends string> = Extract<ContinentalSlot<Entry>, { from: "league" }>;

export type CupFinal = { championId: string; runnerUpId: string };

/**
 * Next season's continental entrants of one country, by entry, from its top league's final table and
 * its cup final. The slots list the entries best first, each ranked by its first slot. A club keeps its
 * best route: the entries fill best first, cup finalists ahead of league clubs, and a place whose club
 * is already in a better or the same entry passes down the table to the next club not yet in.
 */
export function continentalPlaces<Entry extends string>(
  slots: readonly ContinentalSlot<Entry>[],
  table: readonly string[],
  cup: CupFinal | null,
): Map<Entry, string[]> {
  const places = new Map<Entry, string[]>(slots.map((slot) => [slot.entry, []]));
  const taken = new Set<string>();
  for (const [entry, clubs] of places) {
    let fromTable = 0;
    for (const slot of slots) {
      if (slot.entry !== entry) continue;
      if (slot.from === "league") fromTable += slot.places;
      else if (cup) {
        const finalist = slot.from === "cupChampion" ? cup.championId : cup.runnerUpId;
        if (taken.has(finalist)) fromTable += 1;
        else {
          taken.add(finalist);
          clubs.push(finalist);
        }
      }
    }
    const fromLeague = table.filter((id) => !taken.has(id)).slice(0, fromTable);
    for (const id of fromLeague) taken.add(id);
    clubs.push(...fromLeague);
  }
  return places;
}
