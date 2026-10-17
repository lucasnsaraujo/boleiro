import { agreeArticles, type Article } from "@boleiro/data/articles";

/** The article each slot that names a club or a stadium takes, by slot ({club}, {rival}...); one left out takes "o". */
export type SlotArticles = Readonly<Record<string, Article>>;

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
export function fillSlots(text: string, slots: Readonly<Record<string, string>>, articles: SlotArticles = {}): string {
  const filled = text
    .replace(/\{(\w+)\}/g, (whole, slot: string, at: number) => {
      const name = Object.hasOwn(slots, slot) ? slots[slot] : undefined;
      if (name === undefined) return whole;
      return SENTENCE_START.test(text.slice(0, at)) ? capitalised(name) : name;
    })
    .replace(/\b(de|em|a|por) o técnico/g, (_whole, word: keyof typeof JOINED) => `${JOINED[word]} técnico`);
  const named = Object.entries(articles).map(([slot, article]) => ({ name: slots[slot] ?? "", article }));
  return capitalised(agreeArticles(filled, named));
}
