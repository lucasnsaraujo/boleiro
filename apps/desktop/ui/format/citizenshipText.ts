import { inPortuguese } from "../market/marketSearch.js";

/** A player's citizenships after his age, in Portuguese, his own first (" · Inglaterra / Nigéria"); empty when the data gives none. */
export const citizenshipText = (nationalities: readonly string[]): string => (nationalities.length ? ` · ${nationalities.map(inPortuguese).join(" / ")}` : "");
