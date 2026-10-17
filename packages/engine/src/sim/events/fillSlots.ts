import { agreeArticles, type Article } from "@boleiro/data/articles";

const SLOT_NAMES = ["player", "teammate", "club", "rival", "age", "position", "stadium", "coach"] as const;
type SlotName = (typeof SLOT_NAMES)[number];
const isSlotName = (slot: string): slot is SlotName => SLOT_NAMES.some((name) => name === slot);

/** The real names an event's text takes, by slot, and the article each club and stadium takes ("o" when left out). */
export type Slots = Record<SlotName, string> & { articles?: Partial<Record<"club" | "rival" | "stadium", Article>> };

// A club without a named coach is "o técnico", which a preposition before it takes in: "do técnico".
const JOINED = { de: "do", em: "no", a: "ao", por: "pelo" } as const;

// A slot right after these opens a sentence: the text's start, a full stop or a quote that opens one.
const SENTENCE_START = /(^|[.!?…]\s+)“?$/;
const capitalised = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The text with each `{slot}` replaced by its name, a name that opens a sentence with a capital
 * ("o técnico" opens one as "O técnico"); a slot the text doesn't know stays as it is. Texts write a
 * club or a stadium after the masculine article ("do {club}"); a feminine one takes the feminine ("da Chapecoense").
 */
export function fillSlots(text: string, slots: Slots): string {
  const filled = text
    .replace(/\{(\w+)\}/g, (whole, slot: string, at: number) => (isSlotName(slot) ? (SENTENCE_START.test(text.slice(0, at)) ? capitalised(slots[slot]) : slots[slot]) : whole))
    .replace(/\b(de|em|a|por) o técnico/g, (_whole, word: keyof typeof JOINED) => `${JOINED[word]} técnico`);
  const named = (["club", "rival", "stadium"] as const).map((slot) => ({ name: slots[slot], article: slots.articles?.[slot] ?? "o" }));
  return capitalised(agreeArticles(filled, named));
}
