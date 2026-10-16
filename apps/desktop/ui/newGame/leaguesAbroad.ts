import type { Club } from "@boleiro/data/clubs";
import { EUROPE } from "@boleiro/engine/sim/world/europe";
import { MARKET_LEAGUES } from "@boleiro/engine/sim/world/marketLeagues";
import { SOUTH_AMERICA } from "@boleiro/engine/sim/world/southAmerica";

const COUNTRY_NAMES: Record<string, string> = {
  ar: "Argentina", bo: "Bolívia", cl: "Chile", co: "Colômbia", ec: "Equador", pe: "Peru", py: "Paraguai", uy: "Uruguai", ve: "Venezuela",
  "gb-eng": "Inglaterra", es: "Espanha", it: "Itália", de: "Alemanha", fr: "França", pt: "Portugal", nl: "Holanda", tr: "Turquia",
  be: "Bélgica", "gb-sct": "Escócia", at: "Áustria", gr: "Grécia", cz: "Tchéquia", hr: "Croácia", ua: "Ucrânia", pl: "Polônia",
  no: "Noruega", sk: "Eslováquia", si: "Eslovênia", hu: "Hungria", bg: "Bulgária", cy: "Chipre", am: "Armênia", il: "Israel", az: "Azerbaijão",
  sa: "Arábia Saudita", us: "Estados Unidos", mx: "México",
};

/** A league abroad a coach can pick his club from: `value` is the packs' league id (`gb-eng-1`). */
export type LeagueAbroadOption = { value: string; label: string; country: string; level: number };

/** Every league of South America's and Europe's pyramids and the market leagues, as the club picker lists them after Brazil's series. */
export const LEAGUES_ABROAD: readonly LeagueAbroadOption[] = [...SOUTH_AMERICA, ...EUROPE, ...MARKET_LEAGUES].flatMap(({ id, levels }) =>
  levels.map((level, index) => ({ value: `${id}-${index + 1}`, label: `${level.name} · ${COUNTRY_NAMES[id] ?? id}`, country: id, level: index })),
);

/** The league abroad a club plays in, as the picker names it; null for a club in Brazil. */
export function leagueAbroadOf(club: Pick<Club, "abroad">): LeagueAbroadOption | null {
  const { abroad } = club;
  return abroad ? (LEAGUES_ABROAD.find((league) => league.country === abroad.country && league.level === abroad.level) ?? null) : null;
}
