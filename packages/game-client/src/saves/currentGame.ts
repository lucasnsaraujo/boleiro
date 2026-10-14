/** The game open in the engine: the slot it lives in and the coach's name, which the engine does not keep. */
export type CurrentGame = { slotId: string; coachName: string };

export type CurrentGameRef = { current: CurrentGame | null };
