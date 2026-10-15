// Brasfoot's registration cap (best/ah.java:2026-2069): no club signs a player while it has 35. It
// binds the coach's club and the clubs buying from him; a club that starts above it keeps its players
// and sells down before it can sign again. AI clubs trading among themselves keep to their usual
// squad sizes (squadNeeds.ts) instead.
export const SQUAD_CAP = 35;

/** Whether a squad of this size can't register one more player. */
export const isSquadFull = (size: number): boolean => size >= SQUAD_CAP;
