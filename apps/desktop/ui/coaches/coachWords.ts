import type { Posture } from "@boleiro/engine/engine/match";
import type { JobAnswer, Refusal } from "@boleiro/engine/sim/coach/applyForJob";
import { competitionKeyName } from "@boleiro/game-client/format/competitionName";
import type { ProfileStint } from "@boleiro/game-client/coaches/coachesPage";

// Countries as Transfermarkt writes a coach's nationality, as Brazilians name them.
const NATIONALITIES: Readonly<Record<string, string>> = {
  Brazil: "Brasil",
  Argentina: "Argentina",
  Spain: "Espanha",
  Portugal: "Portugal",
  Italy: "Itália",
  Germany: "Alemanha",
  Netherlands: "Holanda",
  France: "França",
  Croatia: "Croácia",
  Ukraine: "Ucrânia",
  "Czech Republic": "Tchéquia",
  Uruguay: "Uruguai",
  Poland: "Polônia",
  Bulgaria: "Bulgária",
  Slovakia: "Eslováquia",
  Israel: "Israel",
  Austria: "Áustria",
  Norway: "Noruega",
  Türkiye: "Turquia",
  Slovenia: "Eslovênia",
  Belgium: "Bélgica",
  Hungary: "Hungria",
  Greece: "Grécia",
  England: "Inglaterra",
  Armenia: "Armênia",
  Scotland: "Escócia",
  "United States": "Estados Unidos",
  Cyprus: "Chipre",
  Colombia: "Colômbia",
  Denmark: "Dinamarca",
  Paraguay: "Paraguai",
  Chile: "Chile",
  Mexico: "México",
  Serbia: "Sérvia",
  Sweden: "Suécia",
  Peru: "Peru",
  Bolivia: "Bolívia",
  Switzerland: "Suíça",
  Ecuador: "Equador",
  Azerbaijan: "Azerbaijão",
  "Northern Ireland": "Irlanda do Norte",
  Ireland: "Irlanda",
  "Bosnia-Herzegovina": "Bósnia",
  Wales: "País de Gales",
  Venezuela: "Venezuela",
  Russia: "Rússia",
  "North Macedonia": "Macedônia do Norte",
  Latvia: "Letônia",
  Australia: "Austrália",
  Tunisia: "Tunísia",
  Romania: "Romênia",
  "New Zealand": "Nova Zelândia",
  Morocco: "Marrocos",
  Moldova: "Moldávia",
  Mali: "Mali",
  Lithuania: "Lituânia",
  Japan: "Japão",
  Iceland: "Islândia",
  Finland: "Finlândia",
  Estonia: "Estônia",
  "Cote d'Ivoire": "Costa do Marfim",
  Belarus: "Belarus",
  Albania: "Albânia",
  "Saudi Arabia": "Arábia Saudita",
  "United Arab Emirates": "Emirados Árabes",
  Egypt: "Egito",
  "Korea, South": "Coreia do Sul",
  "South Africa": "África do Sul",
};

// The game's countries by id, as Brazilians name them.
const COUNTRIES: Readonly<Record<string, string>> = {
  br: "Brasil", ar: "Argentina", bo: "Bolívia", cl: "Chile", co: "Colômbia", ec: "Equador", py: "Paraguai", pe: "Peru", uy: "Uruguai", ve: "Venezuela",
  "gb-eng": "Inglaterra", es: "Espanha", it: "Itália", de: "Alemanha", fr: "França", pt: "Portugal", nl: "Holanda", tr: "Turquia", be: "Bélgica",
  "gb-sct": "Escócia", at: "Áustria", gr: "Grécia", cz: "Tchéquia", hr: "Croácia", ua: "Ucrânia", pl: "Polônia", no: "Noruega", sk: "Eslováquia",
  si: "Eslovênia", hu: "Hungria", bg: "Bulgária", cy: "Chipre", am: "Armênia", il: "Israel", az: "Azerbaijão", sa: "Arábia Saudita",
  us: "Estados Unidos", mx: "México", ae: "Emirados Árabes", eg: "Egito", jp: "Japão", kr: "Coreia do Sul", ma: "Marrocos", nz: "Nova Zelândia",
  tn: "Tunísia", za: "África do Sul",
};

/** A coach's nationality in Portuguese; one the game has no name for stays as Transfermarkt wrote it. */
export const nationalityName = (nationality: string): string => NATIONALITIES[nationality] ?? nationality;

/** A country of the game by id, in Portuguese. */
export const countryName = (id: string): string => COUNTRIES[id] ?? id.toUpperCase();

/** A title's competition: the game's own names, and for a league or cup of the result-only world, its country's. */
export function titleName(key: string): string {
  const abroad = /^([a-z]{2}(?:-[a-z]{3})?)-(1|2|cup)$/.exec(key);
  if (abroad?.[1] && COUNTRIES[abroad[1]]) return `${abroad[2] === "cup" ? "Copa" : abroad[2] === "2" ? "2ª divisão" : "Liga"} · ${countryName(abroad[1])}`;
  return competitionKeyName(key);
}

export const STYLE_WORDS: Record<Posture, string> = { attacking: "Ofensivo", balanced: "Equilibrado", counter: "Contra-ataque", defensive: "Retranqueiro" };

/** How a spell ended, as the career timeline says it. */
export function exitWord(left: ProfileStint["left"]): string {
  switch (left) {
    case null:
      return "no cargo";
    case "fired":
      return "demitido";
    case "resigned":
      return "pediu demissão";
    case "replaced":
      return "substituído";
    case "retired":
      return "aposentou-se";
    case "contractEnded":
      return "fim de contrato";
    case "moved":
      return "trocou de clube";
  }
}

/** Why a club with an open job would turn the coach down, under its verdict; `idolOf` names the rival club he is an idol of, after "de" ("do Vasco"). */
export function jobRefusalText(refusal: Refusal, idolOf: string): string {
  switch (refusal) {
    case "tooBig":
      return "quer um nome maior";
    case "notWelcome":
      return "não esqueceu sua saída";
    case "rivalIdol":
      return `não contrata ídolo ${idolOf}`;
  }
}

/** What a club answered the coach's application, for the toast. */
export function answerText(answer: JobAnswer, club: string): string {
  switch (answer) {
    case "offered":
      return `${club} fez uma proposta. Ela está em Propostas.`;
    case "tooBig":
      return `${club} quer um nome maior.`;
    case "notWelcome":
      return `${club} não esqueceu sua saída. Ainda não é bem-vindo.`;
    case "rivalIdol":
      return `${club} não contrata ídolo de rival. A torcida não aceitaria.`;
    case "alreadyOffered":
      return `${club} já fez uma proposta. Ela está em Propostas.`;
    case "noOpening":
      return `${club} não tem vaga agora.`;
    case "retired":
      return "Você encerrou a carreira.";
  }
}
