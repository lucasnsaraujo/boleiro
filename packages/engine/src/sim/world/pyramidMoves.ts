/** Who leaves a level at the end of a season, upwards and downwards. */
export type LevelExits = { promotedIds: readonly string[]; relegatedIds: readonly string[] };

/**
 * The clubs that change level between seasons in a pyramid listed top level first: promoted clubs go
 * up one level, relegated ones down one, and those relegated from the bottom level leave the
 * pyramid (null). Clubs that stay put are left out.
 */
export function pyramidMoves<Level>(levels: readonly Level[], exits: ReadonlyMap<Level, LevelExits>): Map<string, Level | null> {
  const moves = new Map<string, Level | null>();
  levels.forEach((level, i) => {
    const { promotedIds = [], relegatedIds = [] } = exits.get(level) ?? {};
    const above = levels[i - 1];
    if (above !== undefined) for (const id of promotedIds) moves.set(id, above);
    for (const id of relegatedIds) moves.set(id, levels[i + 1] ?? null);
  });
  return moves;
}
