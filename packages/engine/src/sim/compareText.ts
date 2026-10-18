// Text sorts must put things in one order on every computer, or a seed plays another game in another language:
// a bare localeCompare follows the system's locale, and Czech, for one, sorts "ch" after "h". English collation
// is the order the game always had on en-US and pt-BR computers, so every seed keeps its game.
const collator = new Intl.Collator("en");

/** Compares two texts in one fixed order, whatever the computer's language. */
export const compareText = (a: string, b: string): number => collator.compare(a, b);
