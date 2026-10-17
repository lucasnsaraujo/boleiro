import { agreeArticles, type Article } from "@boleiro/data/articles";

const SLOT_NAMES = ["player", "teammate", "club", "rival", "age", "position", "stadium", "coach"] as const;
type SlotName = (typeof SLOT_NAMES)[number];
const isSlotName = (slot: string): slot is SlotName => SLOT_NAMES.some((name) => name === slot);

/** The real names an event's text takes, by slot, and the article each club and stadium takes ("o" when left out). */
export type Slots = Record<SlotName, string> & { articles?: Partial<Record<"club" | "rival" | "stadium", Article>> };

// A club without a named coach is "o técnico", which a preposition before it takes in: "do técnico".
const JOINED = { de: "do", em: "no", a: "ao", por: "pelo" } as const;

/**
 * The text with each `{slot}` replaced by its name, starting with a capital ("o técnico" opens a
 * headline as "O técnico"); a slot the text doesn't know stays as it is. Texts write a club or a
 * stadium after the masculine article ("do {club}"); a feminine one takes the feminine ("da Chapecoense").
 */
export function fillSlots(text: string, slots: Slots): string {
  const filled = text
    .replace(/\{(\w+)\}/g, (whole, slot: string) => (isSlotName(slot) ? slots[slot] : whole))
    .replace(/\b(de|em|a|por) o técnico/g, (_whole, word: keyof typeof JOINED) => `${JOINED[word]} técnico`);
  const named = (["club", "rival", "stadium"] as const).map((slot) => ({ name: slots[slot], article: slots.articles?.[slot] ?? "o" }));
  const agreed = agreeArticles(filled, named);
  return agreed.charAt(0).toUpperCase() + agreed.slice(1);
}
