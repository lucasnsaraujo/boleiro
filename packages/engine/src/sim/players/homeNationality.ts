import type { Club } from "@boleiro/data/clubs";

// Each country's own citizenship as Transfermarkt names it: the one most of its pack's players hold
// (homeNationality.test.ts reads it off the packs).
const HOME_NATIONALITIES: Readonly<Record<string, string>> = {
  ae: "United Arab Emirates",
  am: "Armenia",
  ar: "Argentina",
  at: "Austria",
  az: "Azerbaijan",
  be: "Belgium",
  bg: "Bulgaria",
  bo: "Bolivia",
  br: "Brazil",
  cl: "Chile",
  co: "Colombia",
  cy: "Cyprus",
  cz: "Czech Republic",
  de: "Germany",
  ec: "Ecuador",
  eg: "Egypt",
  es: "Spain",
  fr: "France",
  "gb-eng": "England",
  "gb-sct": "Scotland",
  gr: "Greece",
  hr: "Croatia",
  hu: "Hungary",
  il: "Israel",
  it: "Italy",
  jp: "Japan",
  kr: "Korea, South",
  ma: "Morocco",
  mx: "Mexico",
  nl: "Netherlands",
  no: "Norway",
  nz: "New Zealand",
  pe: "Peru",
  pl: "Poland",
  pt: "Portugal",
  py: "Paraguay",
  sa: "Saudi Arabia",
  si: "Slovenia",
  sk: "Slovakia",
  tn: "Tunisia",
  tr: "Türkiye",
  ua: "Ukraine",
  us: "United States",
  uy: "Uruguay",
  ve: "Venezuela",
  za: "South Africa",
};

const BRAZIL = "Brazil";

/** The own citizenship of a country of the world, by its id; null for one the game has no pack for. */
export const homeNationalityOfCountry = (countryId: string): string | null => HOME_NATIONALITIES[countryId] ?? null;

/** The citizenship of the country a club plays in: its league abroad's, else Brazil's. */
export const homeNationalityOf = (club: Pick<Club, "abroad"> | undefined): string => (club?.abroad ? (HOME_NATIONALITIES[club.abroad.country] ?? BRAZIL) : BRAZIL);

/** Whether a player holds no citizenship of `home`; one the data gives none counts as home. */
export const isForeignTo = (nationalities: readonly string[], home: string = BRAZIL): boolean => nationalities.length > 0 && !nationalities.includes(home);
