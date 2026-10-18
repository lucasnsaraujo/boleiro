import { REFEREE_ROSTER, type RefereeProfile } from "@boleiro/data/refereeRoster";
import { keyedStream } from "../../engine/random.js";
import { COPA_DO_BRASIL_ENTRY_STAGES } from "../copaDoBrasil.js";
import type { CardRates } from "../discipline/cardRates.js";
import type { Competition, Fixture } from "../gameState.js";

/** Where a competition's video assistant referee works like Brazil's or like Europe's: how often it steps in and for how long. */
export type VarStyle = "brazil" | "europe";

/**
 * Who referees a match and whether VAR watches it. `referee` is null where the data names no
 * referee for the competition; `strictness` scales the match's cards (1 for an average referee of
 * the competition, or for none).
 */
export type MatchOfficials = { referee: RefereeProfile | null; strictness: number; var: VarStyle | null };

// The officials draw from a stream of their own, keyed by the fixture, so naming the referee leaves every other draw as it was.
const OFFICIALS_STREAM_SALT = 0x4ef3;

// Série A and B have VAR in every match; Série C from its second phase; Série D from the round of 16
// (8 ties); the Copa do Brasil from phase 5, when the Série A clubs join (Diario de Pernambuco,
// https://www.diariodepernambuco.com.br/esportes-dp/santa-cruz/2026/09/11722767-serie-c-com-santa-cruz-presente-quadrangular-do-acesso-tera-var.html;
// https://www.diariodepernambuco.com.br/esportes-dp/nacional/2025/10/11697172-com-as-mudancas-da-cbf-entenda-como-vai-ficar-a-serie-d.html;
// Band, https://www.band.com.br/esportes/futebol/var-copa-do-brasil-2026-quando-arbitro-video-entra).
// The Gaúcho has VAR from its first phase (Jornal do Comércio,
// https://www.jornaldocomercio.com/esportes/2025/11/1225277-com-novo-formato-gauchao-tera-presenca-de-var-desde-a-primeira-fase.html).
// guess: the Paulista, Carioca and Mineiro too (FotMob logged no VAR decision in 30 matches of any
// estadual, data/referee-coverage.csv, so it may not log them there), and CONMEBOL's cups in every
// stage and Argentina's top league like Brazil's, where FotMob logs them. Other estaduais have none.
const STATES_WITH_VAR = new Set(["SP", "RJ", "MG", "RS"]);
const SERIE_D_VAR_TIES = 8;
// guess: a competition is refereed by name only when the data has five of its referees or more; fewer
// would send the same few to every match (the crawl found one Série D referee and no Série C one).
const MIN_ROSTER = 5;
// The top leagues abroad the referee data covers all play with VAR, and so do the Saudi Pro League,
// MLS and Liga MX, though the data names none of their referees. guess: those three step in as
// Europe's do, under the same IFAB protocol; a league abroad without referee data otherwise (the lower
// levels, the smaller countries) is left without VAR, as the data says nothing.
const EUROPE = new Set(["gb-eng", "es", "it", "de", "fr", "pt", "nl", "sa", "us", "mx"]);

/** The referee roster's key for a competition: "br-A", "br-cup", "br-state-SP", "libertadores", "gb-eng-0". */
function rosterKeyOf(competition: Competition): string {
  switch (competition.kind) {
    case "league":
      if (competition.abroad) return `${competition.abroad.country}-${competition.abroad.level}`;
      return `br-${competition.division ?? "A"}`;
    case "state":
      return `br-state-${competition.state}`;
    case "cup":
      return "br-cup";
    case "continental":
      // guess: the Recopa is refereed by CONMEBOL's Libertadores referees.
      return competition.cup === "recopa" ? "libertadores" : competition.cup;
    case "cupAbroad":
      // guess: a national cup abroad is refereed from its top league's roster; UEFA's referees are not in the data.
      return competition.country ? `${competition.country}-0` : "uefa";
  }
}

function varStyleOf(competition: Competition, fixture: Fixture): VarStyle | null {
  const stage = competition.stages[fixture.stage];
  switch (competition.kind) {
    case "league": {
      if (competition.abroad) {
        const { country, level } = competition.abroad;
        if (level !== 0) return null;
        return EUROPE.has(country) ? "europe" : country === "ar" ? "brazil" : null;
      }
      const division = competition.division ?? "A";
      if (division === "A" || division === "B") return "brazil";
      if (division === "C") return fixture.stage >= 1 ? "brazil" : null;
      return stage?.kind === "knockout" && stage.ties.length <= SERIE_D_VAR_TIES ? "brazil" : null;
    }
    case "state":
      return STATES_WITH_VAR.has(competition.state) ? "brazil" : null;
    case "cup":
      return fixture.stage >= COPA_DO_BRASIL_ENTRY_STAGES.serieA ? "brazil" : null;
    case "continental":
      return "brazil";
    case "cupAbroad":
      // UEFA's club cups play with VAR from their league phase; guess: a national cup abroad where its top league does.
      return competition.country === null || EUROPE.has(competition.country) ? "europe" : null;
  }
}

/** How much a referee books over his league's average in FotMob's stats; 1 when the stats give no average. */
const bookingRate = (referee: RefereeProfile) => (referee.leagueYellowsPerMatch > 0 ? referee.yellowsPerMatch / referee.leagueYellowsPerMatch : 1);

/**
 * A referee's booking rate over the mean of his competition's, weighted by how often each one
 * referees, so the competition's referees together keep its real card rates. A referee's stats can
 * come from another league (a Série B referee working in Série A), so each is read against his own.
 */
function strictnessIn(roster: readonly RefereeProfile[], referee: RefereeProfile): number {
  const { mean } = weightsOf(roster);
  return mean > 0 ? bookingRate(referee) / mean : 1;
}

// A season draws officials for thousands of matches from the same few rosters.
const ROSTER_WEIGHTS = new WeakMap<readonly RefereeProfile[], { matches: number; mean: number }>();

/** A roster's matches in all, and its booking rate weighted by matches. */
function weightsOf(roster: readonly RefereeProfile[]): { matches: number; mean: number } {
  let known = ROSTER_WEIGHTS.get(roster);
  if (!known) {
    const matches = roster.reduce((sum, r) => sum + r.matches, 0);
    known = { matches, mean: roster.reduce((sum, r) => sum + bookingRate(r) * r.matches, 0) / matches };
    ROSTER_WEIGHTS.set(roster, known);
  }
  return known;
}

/**
 * The officials of a match: a real referee of the competition, drawn by how many matches each one
 * referees, and VAR where the competition has it at this stage.
 */
export function matchOfficials(seed: number, competition: Competition, fixture: Fixture): MatchOfficials {
  const roster = REFEREE_ROSTER[rosterKeyOf(competition)] ?? [];
  const style = varStyleOf(competition, fixture);
  if (roster.length < MIN_ROSTER) return { referee: null, strictness: 1, var: style };
  let roll = keyedStream(seed ^ OFFICIALS_STREAM_SALT, fixture.id)() * weightsOf(roster).matches;
  const referee = roster.find((r) => (roll -= r.matches) < 0) ?? roster[roster.length - 1];
  if (!referee) return { referee: null, strictness: 1, var: style };
  return { referee, strictness: strictnessIn(roster, referee), var: style };
}

/** A match's card rates under its referee: a strict one books more, a lenient one fewer, red cards alike. */
export function refereedCardRates(rates: CardRates, officials: MatchOfficials): CardRates {
  const s = officials.strictness;
  if (s === 1) return rates;
  return { ...rates, home: { yellows: rates.home.yellows * s, reds: rates.home.reds * s }, away: { yellows: rates.away.yellows * s, reds: rates.away.reds * s } };
}
