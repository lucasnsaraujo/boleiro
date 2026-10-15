const NAMES: Record<number, string> = { 2: "final", 4: "semifinal", 8: "quartas de final", 16: "oitavas de final", 32: "segunda fase" };

/** A Copinha round by how many sides play it. */
export const copinhaRoundName = (sides: number): string => NAMES[sides] ?? "primeira fase";
