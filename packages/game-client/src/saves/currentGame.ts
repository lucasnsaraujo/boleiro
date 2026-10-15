/**
 * The game open in the engine: the slot it lives in and the coach's name, which the engine does not keep.
 * The autosave sets `hasUnsavedPlay` while the game has moved on past every save of it; unset, nothing is unsaved.
 */
export type CurrentGame = { slotId: string; coachName: string; hasUnsavedPlay?: boolean };

export type CurrentGameRef = { current: CurrentGame | null };
