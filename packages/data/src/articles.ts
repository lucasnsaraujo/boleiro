/** A Portuguese definite article: "o" for a name said in the masculine, "a" for one said in the feminine. */
export type Article = "o" | "a";

// The clubs the Brazilian press calls in the feminine ("a Chapecoense", "a Ponte Preta", "a Juventus"),
// by id; every other club is "o". Brazil's: the usage in each club's pt.wikipedia article, the
// "da/na/a X" against the "do/no/o X" before its short name. Abroad: the Italian clubs whose name is
// feminine (la Juve, la Roma) and the clubs named after a university or a league, as Brazil's papers
// write them ("a LDU", "a Universidad de Chile").
export const FEMININE_CLUB_IDS: readonly string[] = [
  "anapolina-go",
  "aparecidense-go",
  "chapecoense-sc",
  "ferroviaria-es",
  "ferroviaria-sp",
  "inter-de-limeira-sp",
  "jataiense-go",
  "ponte-preta-sp",
  "portuguesa-rj",
  "portuguesa-sp",
  "tuna-luso-brasileira-pa",
  // Abroad, by Transfermarkt id.
  "tm-46", // Inter de Milão
  "tm-506", // Juventus
  "tm-12", // Roma
  "tm-398", // Lazio
  "tm-430", // Fiorentina
  "tm-800", // Atalanta
  "tm-410", // Udinese
  "tm-1038", // Sampdoria
  "tm-2239", // Cremonese
  "tm-4159", // Carrarese
  "tm-5587", // Juve Stabia
  "tm-681", // Real Sociedad
  "tm-9899", // Real Sociedad B
  "tm-2990", // Académica
  "tm-9855", // LDU Quito
  "tm-17584", // Universidad Católica (Equador)
  "tm-3277", // Universidad Católica (Chile)
  "tm-1037", // Universidad de Chile
  "tm-5622", // Universidad de Concepción
  "tm-22918", // Portuguesa (Venezuela)
];
const FEMININE_CLUBS: ReadonlySet<string> = new Set(FEMININE_CLUB_IDS);

/** The article the press puts before the club's name. */
export const clubArticle = (clubId: string): Article => (FEMININE_CLUBS.has(clubId) ? "a" : "o");

// A ground takes the gender of the noun it is named for: an arena, a vila, an ilha are feminine
// ("a Arena Condá", "a Neo Química Arena"); an estádio, a parque and a nickname ("o Maracanã") are not.
const FEMININE_GROUNDS = /(^|\s)(Arena|Vila|Ilha|Fonte|Toca|Casa|Rua|Baixada|Ressacada|Fazendinha|Bombonera)(\s|$)/;

/** The article the press puts before the stadium's name. */
export const stadiumArticle = (stadium: string): Article => (FEMININE_GROUNDS.test(stadium) ? "a" : "o");

const JOINED = {
  de: { o: "do", a: "da" },
  em: { o: "no", a: "na" },
  a: { o: "ao", a: "à" },
  por: { o: "pelo", a: "pela" },
} as const satisfies Record<string, Record<Article, string>>;

/** A preposition that joins the article that follows it: de + o = do, em + a = na. */
export type Preposition = keyof typeof JOINED;

/** The name after its article, joined to the preposition when one comes first: "o Flamengo", "da Chapecoense", "na Arena Condá". */
export function withArticle(name: string, article: Article, preposition?: Preposition): string {
  return `${preposition ? JOINED[preposition][article] : article} ${name}`;
}

const FEMININE_OF: Record<string, string> = { o: "a", do: "da", no: "na", ao: "à", pelo: "pela" };
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text with the masculine article written before each feminine name turned feminine: "do
 * Chapecoense" reads "da Chapecoense", "O Chapecoense" "A Chapecoense". Texts are written with "o",
 * the article of most clubs; this is what makes them right for the rest.
 */
export function agreeArticles(text: string, named: readonly { name: string; article: Article }[]): string {
  let agreed = text;
  for (const { name, article } of named) {
    if (article !== "a" || !name) continue;
    const before = new RegExp(`(?<!\\p{L})(o|do|no|ao|pelo|O|Do|No|Ao|Pelo) (?=${escaped(name)}(?!\\p{L}))`, "gu");
    agreed = agreed.replace(before, (_whole, word: string) => {
      const feminine = FEMININE_OF[word.toLowerCase()] ?? word;
      return `${word === word.toLowerCase() ? feminine : feminine.charAt(0).toUpperCase() + feminine.slice(1)} `;
    });
  }
  return agreed;
}
