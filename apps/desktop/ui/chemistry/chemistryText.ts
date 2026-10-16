// guess: where the meter's words change, from a squad at odds to one that plays by heart.
const WORDS: readonly [number, string][] = [
  [80, "Ótimo"],
  [60, "Bom"],
  [45, "Regular"],
  [30, "Fraco"],
  [0, "Ruim"],
];

/** The meter in a word, as the chemistry screen prints it under the number. */
export function chemistryWord(value: number): string {
  return WORDS.find(([from]) => value >= from)?.[1] ?? "Ruim";
}

/** How the meter moved in the club's last match, or null when it stayed. */
export function trendText(value: number, was: number): string | null {
  const moved = value - was;
  if (moved === 0) return null;
  return `${moved > 0 ? "subiu" : "caiu"} ${Math.abs(moved)} desde o último jogo`;
}

/** The strength share the meter adds or takes, to the tenth of a percent: "+1,2%", "−0,6%", "0%". */
export function effectText(effect: number): string {
  const tenths = Math.round(effect * 1000);
  if (tenths === 0) return "0%";
  const text = (Math.abs(tenths) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${tenths > 0 ? "+" : "−"}${text}%`;
}
