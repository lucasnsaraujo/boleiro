/**
 * The game open in the engine: the slot it lives in and the coach's name, which the engine does not keep.
 * `unsavedChanges` counts the changes made since the game was last written into its own slot; unset, there are none.
 * The autosave doesn't clear them: its one slot is shared, and the next game opened writes over it.
 */
export type CurrentGame = { slotId: string; coachName: string; unsavedChanges?: number };

export type CurrentGameRef = { current: CurrentGame | null };

/** Whether throwing the open game away now would lose play its own slot doesn't hold. */
export function hasUnsavedPlay(game: CurrentGame | null): boolean {
  return (game?.unsavedChanges ?? 0) > 0;
}
