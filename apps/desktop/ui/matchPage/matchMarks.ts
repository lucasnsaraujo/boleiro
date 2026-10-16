// guess: newspaper marks read 7.5 and up as a great match and under 5.5 as a poor one.
const GREAT = 7.5;
const POOR = 5.5;
// A name longer than this goes on the pitch as its first initial and last word.
const PITCH_NAME = 13;

/** A 0–10 mark's badge class: great, poor or plain. */
export const markClass = (rating: number) => (rating >= GREAT ? "mark great" : rating < POOR ? "mark poor" : "mark");

/** A mark as the paper prints it: "7,4". */
export const formatMark = (rating: number) => rating.toFixed(1).replace(".", ",");

/** A player's name short enough for a shirt on the pitch: "Bruno Henrique" stays, "Giorgian de Arrascaeta" turns "G. Arrascaeta". */
export function shortName(name: string): string {
  if (name.length <= PITCH_NAME) return name;
  const words = name.split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? name;
  return words.length > 1 ? `${words[0]?.charAt(0)}. ${last}` : name;
}
