import type { Marking, Play, Posture } from "@boleiro/engine/engine/match";

export const POSTURE_LABEL: Record<Posture, string> = { defensive: "Retranca", counter: "Contra-ataque", balanced: "Equilibrada", attacking: "Ofensiva" };
export const POSTURES: readonly Posture[] = ["defensive", "counter", "balanced", "attacking"];
export const MARKING_LABEL: Record<Marking, string> = { light: "Leve", heavy: "Pesada", veryHeavy: "Muito pesada" };
export const MARKINGS: readonly Marking[] = ["light", "heavy", "veryHeavy"];
export const PLAY_LABEL: Record<Play, string> = { middle: "Pelo meio", flanks: "Pelas pontas" };
export const PLAYS: readonly Play[] = ["middle", "flanks"];
