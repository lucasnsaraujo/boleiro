import { agreeArticles, FEMININE_CLUB_IDS } from "@boleiro/data/articles";
import { keyedStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import { humanClubIds } from "../coach/humanCoaches.js";
import { guestClubOf } from "../continental/guestClubs.js";
import { addDays } from "../dates.js";
import type { Fixture, GameState, IsoDate } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { coachKeyAt, coachNameOf, coachRivalryScore, freguesOf, humanCoachesOf, RIVALRY_POINTS } from "../rivalries/coachRivalries.js";
import { BLOCK_FROM_INTENSITY, idolClubsOf } from "../rivalries/idols.js";
import { pairKeyOf, rivalryMemoryOf } from "../rivalries/rivalryMemory.js";
import { rivalryOf } from "../rivalries/rivalryOf.js";
import { reviewLength, type VarDecision, type WrongCallKind } from "../referees/refereeCalls.js";
import type { RecordKind } from "../history/recordFeats.js";
import { competitionKey } from "../history/history.js";
import { eventMemoryOf, type NewsItem, type NewsKind } from "./eventMemory.js";

// The newspaper's stories draw their wording from a stream of their own per day and story.
const NEWS_SALT = 0x9e75;
// guess: the newspaper's archive keeps about five months of stories, as runEvents does.
const NEWS_DAYS = 150;
// guess: a signing makes the paper from R$ 5 million, a sale abroad from R$ 15 million; a human coach's club's always does.
const SIGNING_FEE = 5_000_000;
const SALE_ABROAD_FEE = 15_000_000;
// guess: a league win counts as an upset when the winner stood this many places below the loser after five games.
const UPSET_PLACES = 10;
const UPSET_FROM_GAMES = 5;
const DIVISION_RANK = { A: 0, B: 1, C: 2, D: 3 } as const;
// guess: the day's busiest beats print a few stories each; the rest is in the results.
const PER_DAY: Record<Exclude<NewsKind, "event" | "match" | "egg" | "career">, number> = { signing: 3, sacking: 3, upset: 2, rivalry: 2, var: 2, controversy: 3, award: 2, record: 3 };

type Variant = (names: Record<string, string>) => { headline: string; body: string };

// toLocaleString would build this formatter again for every fee.
const MILLIONS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const millions = (fee: number) => `R$ ${MILLIONS.format(fee / 1_000_000)} mi`;

const SIGNINGS: readonly Variant[] = [
  (n) => ({ headline: `${n.to} contrata ${n.player}`, body: `${n.player} chega do ${n.from}${n.fee}.` }),
  (n) => ({ headline: `${n.player} é do ${n.to}`, body: `O ${n.to} acertou com ${n.player}, que estava no ${n.from}${n.fee}.` }),
];
const SALES_ABROAD: readonly Variant[] = [
  (n) => ({ headline: `${n.player} deixa o ${n.from} rumo ao exterior`, body: `A venda rende ${n.fee} ao ${n.from}.` }),
  (n) => ({ headline: `${n.from} vende ${n.player} para fora`, body: `Negócio de ${n.fee}. O ${n.from} faz caixa.` }),
];
const SACKINGS: readonly Variant[] = [
  (n) => ({ headline: `${n.club} demite o técnico`, body: `A diretoria não esperou mais: o ${n.club} é ${n.position}º e a meta era ficar entre os ${n.target}.` }),
  (n) => ({ headline: `Cai o técnico do ${n.club}`, body: `${n.position}º lugar, longe da meta. O ${n.club} procura substituto.` }),
];
const YOUR_SACKING: readonly Variant[] = [
  (n) => ({ headline: `${n.club} demite ${n.coach}`, body: `O ${n.club} é ${n.position}º e a meta era ficar entre os ${n.target}.` }),
];
const UPSETS: readonly Variant[] = [
  (n) => ({ headline: `Zebra: ${n.winner} bate o ${n.loser}`, body: `${n.score}. Ninguém apostava no ${n.winner}.` }),
  (n) => ({ headline: `${n.winner} surpreende o ${n.loser}`, body: `${n.score}, resultado que mexe com ${n.where}.` }),
];
const DERBIES: readonly Variant[] = [
  (n) => ({ headline: `${n.winner} vence o clássico contra o ${n.loser}`, body: `${n.score}. A torcida do ${n.winner} vai lembrar dessa por muito tempo.` }),
  (n) => ({ headline: `Clássico é do ${n.winner}`, body: `${n.score}. O ${n.loser} ouve a provocação até o próximo encontro.` }),
];
const DERBY_DRAWS: readonly Variant[] = [(n) => ({ headline: `${n.home} e ${n.away} empatam o clássico`, body: `${n.score}. O clássico fica sem dono desta vez.` })];
const REUNIONS: readonly Variant[] = [
  (n) => ({ headline: `Reencontro: ${n.coach} e ${n.rival} frente a frente de novo`, body: `${n.score}. Foi o ${n.meetings}º duelo entre os dois: ${n.record}.` }),
  (n) => ({ headline: `Reencontro de velhos rivais à beira do campo`, body: `${n.coach} e ${n.rival} se enfrentaram pela ${n.meetings}ª vez. ${n.score}; ${n.record}.` }),
];
const FREGUESIAS: readonly Variant[] = [
  (n) => ({ headline: `Freguesia: ${n.winner} vence ${n.loser} pela ${n.wins}ª vez`, body: `${n.score}. Em ${n.meetings} jogos, ${n.loser} ainda não sabe o que é ganhar de ${n.winner}.` }),
];
const BOOS: readonly Variant[] = [
  (n) => ({ headline: `Torcida do ${n.home} vaia ${n.coach}`, body: `Ídolo do ${n.idolOf}, ${n.coach} ouviu vaias do começo ao fim. ${n.score}.` }),
];
const WINS: readonly Variant[] = [
  (n) => ({ headline: `${n.winner} vence o ${n.loser}`, body: `${n.score}. ${n.goals}` }),
  (n) => ({ headline: `${n.winner} passa pelo ${n.loser}`, body: `${n.score}. ${n.goals}` }),
  (n) => ({ headline: `Vitória do ${n.winner} sobre o ${n.loser}`, body: `${n.score}. ${n.goals}` }),
];
const BIG_WINS: readonly Variant[] = [(n) => ({ headline: `${n.winner} atropela o ${n.loser}`, body: `${n.score}. ${n.goals}` })];
const DRAWS: readonly Variant[] = [
  (n) => ({ headline: `${n.home} e ${n.away} ficam no empate`, body: `${n.score}. ${n.goals}` }),
  (n) => ({ headline: `Empate entre ${n.home} e ${n.away}`, body: `${n.score}. ${n.goals}` }),
];

// What VAR changed, of the player named (`player`, of `club`) at `minute` after a check of `review`.
const VAR_STORIES: Record<Exclude<VarDecision, "goalStands">, Variant> = {
  goalRuledOut: (n) => ({ headline: `VAR anula gol do ${n.club}`, body: `${n.player} marcou aos ${n.minute}', mas a revisão de ${n.review} pegou impedimento.${n.referee}` }),
  goalAwarded: (n) => ({ headline: `VAR dá o gol de ${n.player}`, body: `O bandeira marcou impedimento aos ${n.minute}'; a revisão de ${n.review} validou o gol do ${n.club}.${n.referee}` }),
  penaltyAwarded: (n) => ({ headline: `Pênalti pelo VAR para o ${n.club}`, body: `Revisão de ${n.review} aos ${n.minute}', e ${n.player} foi para a bola.${n.referee}` }),
  penaltyCancelled: (n) => ({ headline: `VAR desmarca pênalti para o ${n.club}`, body: `O árbitro tinha dado pênalti em ${n.player} aos ${n.minute}'. A revisão levou ${n.review}.${n.referee}` }),
  redCardGiven: (n) => ({ headline: `VAR expulsa ${n.player}`, body: `O árbitro foi ao monitor aos ${n.minute}' e trocou o amarelo pelo vermelho. O ${n.club} jogou com um a menos.${n.referee}` }),
  redCardCancelled: (n) => ({ headline: `VAR devolve ${n.player} ao jogo`, body: `O vermelho aos ${n.minute}' caiu depois de ${n.review} de revisão. Alívio no ${n.club}.${n.referee}` }),
};
// A record beaten: `whose` is "do Flamengo" or "da Série A".
const RECORDS: Record<RecordKind, Variant> = {
  mostSeasonGoals: (n) => ({ headline: `${n.player} faz ${n.value} gols e quebra recorde`, body: `É a maior marca de gols numa temporada ${n.whose}. O recorde anterior era ${n.previous}.` }),
  youngestScorer: (n) => ({ headline: `${n.player}, ${n.value} anos, entra para a história`, body: `É o goleador mais jovem ${n.whose}. A marca anterior era de um jogador de ${n.previous}.` }),
  longestUnbeaten: (n) => ({ headline: `${n.club} chega a ${n.value} jogos sem perder`, body: `É a maior invencibilidade ${n.whose}; a série anterior parou em ${n.previous}.` }),
  biggestWin: (n) => ({ headline: `${n.club} aplica a maior goleada ${n.whose}`, body: `${n.value} gols de diferença; a maior até aqui tinha sido por ${n.previous}.` }),
};
const BOLA_DE_OURO: Variant = (n) => ({ headline: `${n.player} é o Bola de Ouro do Brasileirão`, body: `Média ${n.average} em ${n.apps} jogos pelo ${n.club}. A Bola de Prata premia os melhores de cada posição.` });
const BALLON_DOR: Variant = (n) => ({ headline: `${n.player} ganha a Bola de Ouro da France Football`, body: `O jogador do ${n.club} é eleito o melhor do mundo da temporada.` });

// A wrong call that stood, told as the side it cost (`against`) tells it.
const WRONG_CALLS: Record<WrongCallKind, (n: Record<string, string>) => string> = {
  goalShouldNotStand: (n) => `O gol de ${n.player} (${n.club}) aos ${n.minute}' saiu em impedimento e valeu.`,
  goalWronglyRuledOut: (n) => `O gol de ${n.player} aos ${n.minute}' era legal e foi anulado.`,
  penaltyWronglyGiven: (n) => `O pênalti para o ${n.club} aos ${n.minute}' não existiu.`,
  penaltyNotGiven: (n) => `${n.player} foi derrubado na área aos ${n.minute}' e o árbitro mandou seguir.`,
  redCardWronglyGiven: (n) => `A expulsão de ${n.player} aos ${n.minute}' foi exagerada.`,
  redCardNotGiven: (n) => `${n.player} (${n.club}) merecia o vermelho aos ${n.minute}' e ficou em campo.`,
};
const CONTROVERSIES: readonly Variant[] = [
  (n) => ({ headline: `${n.against} reclama de ${n.by}`, body: `${n.what} No vestiário, o ${n.against} saiu falando em erro grave.` }),
  (n) => ({ headline: `Polêmica: ${n.against} prejudicado pela arbitragem`, body: `${n.what} ${n.blame}` }),
];

function scoreLine(state: GameState, fixture: Fixture): string {
  const name = (id: string) => state.clubs[id]?.shortName ?? id;
  const result = fixture.result;
  if (!result) return "";
  const extraTime = result.isAfterExtraTime ? " (prorr.)" : "";
  const shootout = result.penaltyWinnerId ? `, ${name(result.penaltyWinnerId)} nos pênaltis` : "";
  return `${name(fixture.homeId)} ${result.homeGoals} × ${result.awayGoals} ${name(fixture.awayId)}${extraTime}${shootout}`;
}

/** Who scored, by side: "Gols: Pedro (2), Arrascaeta; Luciano Juba." */
function goalsLine(state: GameState, sheets: MatchSheets, fixture: Fixture): string {
  const sheet = sheets[fixture.id];
  if (!sheet) return "";
  const side = (ids: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, goals]) => `${state.players[id]?.name ?? "?"}${goals > 1 ? ` (${goals})` : ""}`).join(", ");
  };
  const sides = [side(sheet.scorers.home), side(sheet.scorers.away)].filter(Boolean);
  return sides.length ? `Gols: ${sides.join("; ")}.` : "Sem gols.";
}

/**
 * The day's stories for the round's newspaper: the human coaches' matches and their duels with rival
 * coaches, signings, sackings, upsets and derbies. They go into the event memory's archive, which keeps about five months.
 */
export function recordNews(state: GameState, date: IsoDate, events: readonly DayEvent[], sheets: MatchSheets): GameState {
  const humans = new Set(humanClubIds(state));
  const name = (id: string | null) => (id && (state.clubs[id]?.shortName ?? guestClubOf(state, id)?.name)) || "exterior";
  const isMajor = (id: string | null) => id !== null && (humans.has(id) || state.clubs[id]?.division === "A");
  const pick = (variants: readonly Variant[], key: string, names: Record<string, string>) => {
    const random = keyedStream(state.seed ^ NEWS_SALT, `${date}:${key}`);
    const variant = variants[Math.floor(random() * variants.length)] ?? variants[0];
    if (!variant) throw new Error("a story has no wording");
    return variant(names);
  };
  const stories: { story: NewsItem; rank: number }[] = [];
  const feminine = FEMININE_CLUB_IDS.flatMap((id) => {
    const shown = state.clubs[id]?.shortName ?? guestClubOf(state, id)?.name;
    return shown ? [{ name: shown, article: "a" as const }] : [];
  });
  const agreed = (text: string) => agreeArticles(text, feminine);
  const add = (kind: NewsKind, clubIds: string[], rank: number, text: { headline: string; body: string }) =>
    stories.push({ story: { date, kind, clubIds, headline: agreed(text.headline), body: agreed(text.body) }, rank });
  const rivals = rivalsOf(state.clubs);
  const humanCoaches = humanCoachesOf(state);
  /** The coaches' side of a human coach's match: a reencontro of rivals, a freguesia, a rival crowd booing an idol. */
  const addCoachStories = (fixture: Fixture, winner: string | null, names: Record<string, string>) => {
    const home = coachKeyAt(state, fixture.homeId);
    const away = coachKeyAt(state, fixture.awayId);
    const rivalry = home && away ? rivalryMemoryOf(state).coaches[pairKeyOf(home, away)] : undefined;
    if (home && away && rivalry) {
      const [coach, rival] = humans.has(fixture.homeId) ? [home, away] : [away, home];
      const winnerKey = winner === fixture.homeId ? home : winner === fixture.awayId ? away : null;
      const fregues = freguesOf(rivalry);
      const ofKey = (key: string) => (key === rivalry.a ? rivalry.aWins : rivalry.bWins);
      const record = `${coachNameOf(state, coach)} ${ofKey(coach)} vitórias, ${coachNameOf(state, rival)} ${ofKey(rival)}, ${rivalry.draws} empates`;
      const told = { ...names, coach: coachNameOf(state, coach), rival: coachNameOf(state, rival), meetings: String(rivalry.meetings), record };
      if (fregues && winnerKey && fregues !== winnerKey && rivalry.lastMet === date) {
        const loser = fregues;
        add("rivalry", [fixture.homeId, fixture.awayId], 10, pick(FREGUESIAS, `fregues:${fixture.id}`, { ...told, winner: coachNameOf(state, winnerKey), loser: coachNameOf(state, loser), wins: String(ofKey(winnerKey)) }));
      } else if (coachRivalryScore(rivalry) >= RIVALRY_POINTS) {
        add("rivalry", [fixture.homeId, fixture.awayId], 10, pick(REUNIONS, `reunion:${fixture.id}`, told));
      }
    }
    for (const coach of humanCoaches) {
      if (!coach.clubId || coach.clubId !== fixture.awayId) continue;
      const idolOf = idolClubsOf(state, coach).find((clubId) => (rivalryOf(clubId, fixture.homeId)?.intensity ?? 0) >= BLOCK_FROM_INTENSITY);
      if (idolOf) add("rivalry", [fixture.homeId, coach.clubId], 10, pick(BOOS, `boo:${fixture.id}`, { ...names, coach: coach.name || "o técnico", idolOf: name(idolOf) }));
    }
  };

  const storiesOfMatch = (event: Extract<DayEvent, { type: "matchPlayed" }>) => {
    const fixture = event.fixture;
    const result = fixture.result;
    if (!result) return;
    const { homeId, awayId } = fixture;
    const margin = result.homeGoals - result.awayGoals;
    const winner = margin > 0 || result.penaltyWinnerId === homeId ? homeId : margin < 0 || result.penaltyWinnerId === awayId ? awayId : null;
    const loser = winner === homeId ? awayId : winner === awayId ? homeId : null;
    // Most matches make no story: their lines are only written for one that does.
    let lines: Record<string, string> | undefined;
    const names = () => (lines ??= { home: name(homeId), away: name(awayId), winner: name(winner), loser: name(loser), score: scoreLine(state, fixture), goals: goalsLine(state, sheets, fixture), where: "a tabela" });
    if (humans.has(homeId) || humans.has(awayId)) {
      const variants = winner === null ? DRAWS : Math.abs(margin) >= 3 ? BIG_WINS : WINS;
      add("match", [homeId, awayId], 0, pick(variants, fixture.id, names()));
    }
    if (humans.has(homeId) || humans.has(awayId)) addCoachStories(fixture, winner, names());
    const isDerby = rivals.get(homeId)?.has(awayId) ?? false;
    if (isDerby && (isMajor(homeId) || isMajor(awayId))) add("rivalry", winner && loser ? [winner, loser] : [homeId, awayId], 1, pick(winner ? DERBIES : DERBY_DRAWS, `derby:${fixture.id}`, names()));
    if (!winner || !loser) return;
    const competition = state.competitions[fixture.competitionId];
    const winnerDivision = state.clubs[winner]?.division;
    const loserDivision = state.clubs[loser]?.division;
    if (competition?.kind === "cup" && loserDivision && (!winnerDivision || DIVISION_RANK[winnerDivision] - DIVISION_RANK[loserDivision] >= 2)) {
      add("upset", [winner, loser], 3 + (winnerDivision ? DIVISION_RANK[winnerDivision] - DIVISION_RANK[loserDivision] : 4), pick(UPSETS, `upset:${fixture.id}`, { ...names(), where: "a Copa do Brasil" }));
    } else if (competition?.kind === "league" && fixture.stage === 0 && winnerDivision === "A") {
      const above = state.boards[winner];
      const below = state.boards[loser];
      const places = above && below ? above.position - below.position : 0;
      if (places >= UPSET_PLACES && (below?.games ?? 0) >= UPSET_FROM_GAMES) add("upset", [winner, loser], places / 4, pick(UPSETS, `upset:${fixture.id}`, names()));
    }
  };

  const storiesOfCall = (event: Extract<DayEvent, { type: "refereeCall" }>) => {
    const { call } = event;
    const against = call.type === "wrongCall" ? call.againstId : call.clubId;
    const isHumans = humans.has(call.clubId) || humans.has(against);
    if (!isHumans && !isMajor(call.clubId) && !isMajor(against)) return;
    const names = {
      player: state.players[call.playerId]?.name ?? "um jogador",
      club: name(call.clubId),
      against: name(against),
      minute: String(call.minute),
      by: event.referee ?? "a arbitragem",
      referee: event.referee ? ` Árbitro: ${event.referee}.` : "",
      blame: event.referee ? `O técnico do ${name(against)} culpou ${event.referee}.` : `O técnico do ${name(against)} culpou a arbitragem.`,
    };
    const key = `${event.fixtureId}:${call.minute}:${call.playerId}`;
    if (call.type === "varCheck") {
      if (call.decision === "goalStands") return;
      add("var", [call.clubId], isHumans ? 10 : 1, VAR_STORIES[call.decision]({ ...names, review: reviewLength(call.seconds) }));
    } else {
      add("controversy", [against, call.clubId], isHumans ? 10 : 1, pick(CONTROVERSIES, `referee:${key}`, { ...names, what: WRONG_CALLS[call.call](names) }));
    }
  };

  const storiesOfRecord = (event: Extract<DayEvent, { type: "recordBroken" }>) => {
    // A human coach's club's records always make the paper; the Série A's whoever breaks them.
    if (!humans.has(event.clubId) && (event.scope === "club" || event.competition !== "serie-a")) return;
    const leagueName = event.competition && Object.values(state.competitions).find((c) => competitionKey(c.id) === event.competition && c.kind === "league");
    const whose = event.scope === "league" ? `da ${leagueName && leagueName.kind === "league" && leagueName.division ? `Série ${leagueName.division}` : "liga"}` : `do ${name(event.clubId)}`;
    const names = { player: event.name ?? "", club: name(event.clubId), whose, value: String(event.value), previous: String(event.previous) };
    add("record", [event.clubId], humans.has(event.clubId) ? 10 : 1, RECORDS[event.kind](names));
  };

  const storiesOfAwards = (event: Extract<DayEvent, { type: "seasonAwarded" }>) => {
    const { bolaDeOuro, ballonDor } = event.awards;
    if (bolaDeOuro) {
      const average = bolaDeOuro.average.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      add("award", [bolaDeOuro.clubId], 2, BOLA_DE_OURO({ player: bolaDeOuro.name, club: name(bolaDeOuro.clubId), average, apps: String(bolaDeOuro.apps) }));
    }
    const [best] = ballonDor;
    if (best) add("award", [best.clubId], 1, BALLON_DOR({ player: best.name, club: best.clubName }));
  };

  const storiesOfSacking = (event: Extract<DayEvent, { type: "coachFired" }>) => {
    if (!event.isYou && !(isMajor(event.clubId) || state.clubs[event.clubId]?.division === "B")) return;
    const names = { club: name(event.clubId), position: String(event.position), target: String(event.targetPosition), coach: state.coachName || "o técnico" };
    add("sacking", [event.clubId], event.isYou ? 10 : 1, pick(event.isYou ? YOUR_SACKING : SACKINGS, `fired:${event.clubId}`, names));
  };

  const storiesOfMove = (event: Extract<DayEvent, { type: "playerMoved" }>) => {
    const fee = event.fee > 0 ? `, por ${millions(event.fee)}` : ", sem custo de transferência";
    const names = { player: event.name, from: name(event.fromClubId), to: name(event.toClubId), fee };
    const isHumans = (event.toClubId !== null && humans.has(event.toClubId)) || (event.fromClubId !== null && humans.has(event.fromClubId));
    if (event.kind === "abroad" && (isHumans || (isMajor(event.fromClubId) && event.fee >= SALE_ABROAD_FEE))) {
      add("signing", [event.fromClubId ?? ""], event.fee / SALE_ABROAD_FEE, pick(SALES_ABROAD, `sale:${event.playerId}`, { ...names, fee: millions(event.fee) }));
    } else if (["transfer", "releaseClause", "fromAbroad", "freeAgent", "preContract", "loanBuy"].includes(event.kind) && event.toClubId && (isHumans || (isMajor(event.toClubId) && event.fee >= SIGNING_FEE))) {
      add("signing", [event.toClubId, ...(event.fromClubId ? [event.fromClubId] : [])], isHumans ? 10 : event.fee / SIGNING_FEE, pick(SIGNINGS, `signing:${event.playerId}`, names));
    }
  };

  for (const event of events) {
    if (event.type === "matchPlayed") storiesOfMatch(event);
    else if (event.type === "refereeCall") storiesOfCall(event);
    else if (event.type === "recordBroken") storiesOfRecord(event);
    else if (event.type === "seasonAwarded") storiesOfAwards(event);
    else if (event.type === "coachFired") storiesOfSacking(event);
    else if (event.type === "playerMoved") storiesOfMove(event);
  }
  if (!stories.length) return state;
  const kept: NewsItem[] = [];
  for (const kind of ["match", "event", "award", "record", "signing", "sacking", "upset", "rivalry", "var", "controversy"] as const) {
    const own = stories.filter(({ story }) => story.kind === kind).sort((a, b) => b.rank - a.rank);
    const limit = kind === "match" || kind === "event" ? own.length : PER_DAY[kind];
    kept.push(...own.slice(0, limit).map(({ story }) => story));
  }
  const memory = eventMemoryOf(state);
  const oldest = addDays(date, -NEWS_DAYS);
  return { ...state, eventMemory: { ...memory, news: [...memory.news.filter((item) => item.date >= oldest), ...kept] } };
}
