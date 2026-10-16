import { keyedStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import { humanClubIds } from "../coach/humanCoaches.js";
import { guestClubOf } from "../continental/guestClubs.js";
import { addDays } from "../dates.js";
import type { Fixture, GameState, IsoDate } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import { rivalsOf } from "../morale/rivalsOf.js";
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
const PER_DAY: Record<Exclude<NewsKind, "event" | "match">, number> = { signing: 3, sacking: 3, upset: 2, rivalry: 2 };

type Variant = (names: Record<string, string>) => { headline: string; body: string };

const millions = (fee: number) => `R$ ${(fee / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

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

function scoreLine(state: GameState, fixture: Fixture): string {
  const name = (id: string) => state.clubs[id]?.shortName ?? id;
  const result = fixture.result;
  return result ? `${name(fixture.homeId)} ${result.homeGoals} × ${result.awayGoals} ${name(fixture.awayId)}` : "";
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
 * The day's stories for the round's newspaper: the human coaches' matches, signings, sackings, upsets
 * and derbies. They go into the event memory's archive, which keeps about five months.
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
  const add = (kind: NewsKind, clubIds: string[], rank: number, text: { headline: string; body: string }) => stories.push({ story: { date, kind, clubIds, ...text }, rank });
  const rivals = rivalsOf(state.clubs);

  for (const event of events) {
    if (event.type === "matchPlayed") {
      const fixture = event.fixture;
      const result = fixture.result;
      if (!result) continue;
      const { homeId, awayId } = fixture;
      const margin = result.homeGoals - result.awayGoals;
      const winner = margin > 0 || result.penaltyWinnerId === homeId ? homeId : margin < 0 || result.penaltyWinnerId === awayId ? awayId : null;
      const loser = winner === homeId ? awayId : winner === awayId ? homeId : null;
      const names = { home: name(homeId), away: name(awayId), winner: name(winner), loser: name(loser), score: scoreLine(state, fixture), goals: goalsLine(state, sheets, fixture), where: "a tabela" };
      if (humans.has(homeId) || humans.has(awayId)) {
        const variants = winner === null ? DRAWS : Math.abs(margin) >= 3 ? BIG_WINS : WINS;
        add("match", [homeId, awayId], 0, pick(variants, fixture.id, names));
      }
      const isDerby = rivals.get(homeId)?.has(awayId) ?? false;
      if (isDerby && (isMajor(homeId) || isMajor(awayId))) add("rivalry", winner && loser ? [winner, loser] : [homeId, awayId], 1, pick(winner ? DERBIES : DERBY_DRAWS, `derby:${fixture.id}`, names));
      if (!winner || !loser) continue;
      const competition = state.competitions[fixture.competitionId];
      const winnerDivision = state.clubs[winner]?.division;
      const loserDivision = state.clubs[loser]?.division;
      if (competition?.kind === "cup" && loserDivision && (!winnerDivision || DIVISION_RANK[winnerDivision] - DIVISION_RANK[loserDivision] >= 2)) {
        add("upset", [winner, loser], 3 + (winnerDivision ? DIVISION_RANK[winnerDivision] - DIVISION_RANK[loserDivision] : 4), pick(UPSETS, `upset:${fixture.id}`, { ...names, where: "a Copa do Brasil" }));
      } else if (competition?.kind === "league" && fixture.stage === 0 && winnerDivision === "A") {
        const above = state.boards[winner];
        const below = state.boards[loser];
        const places = above && below ? above.position - below.position : 0;
        if (places >= UPSET_PLACES && (below?.games ?? 0) >= UPSET_FROM_GAMES) add("upset", [winner, loser], places / 4, pick(UPSETS, `upset:${fixture.id}`, names));
      }
    } else if (event.type === "coachFired") {
      if (!event.isYou && !(isMajor(event.clubId) || state.clubs[event.clubId]?.division === "B")) continue;
      const names = { club: name(event.clubId), position: String(event.position), target: String(event.targetPosition), coach: state.coachName || "o técnico" };
      add("sacking", [event.clubId], event.isYou ? 10 : 1, pick(event.isYou ? YOUR_SACKING : SACKINGS, `fired:${event.clubId}`, names));
    } else if (event.type === "playerMoved") {
      const fee = event.fee > 0 ? `, por ${millions(event.fee)}` : ", sem custo de transferência";
      const names = { player: event.name, from: name(event.fromClubId), to: name(event.toClubId), fee };
      const isHumans = (event.toClubId !== null && humans.has(event.toClubId)) || (event.fromClubId !== null && humans.has(event.fromClubId));
      if (event.kind === "abroad" && (isHumans || (isMajor(event.fromClubId) && event.fee >= SALE_ABROAD_FEE))) {
        add("signing", [event.fromClubId ?? ""], event.fee / SALE_ABROAD_FEE, pick(SALES_ABROAD, `sale:${event.playerId}`, { ...names, fee: millions(event.fee) }));
      } else if (["transfer", "fromAbroad", "freeAgent", "preContract", "loanBuy"].includes(event.kind) && event.toClubId && (isHumans || (isMajor(event.toClubId) && event.fee >= SIGNING_FEE))) {
        add("signing", [event.toClubId, ...(event.fromClubId ? [event.fromClubId] : [])], isHumans ? 10 : event.fee / SIGNING_FEE, pick(SIGNINGS, `signing:${event.playerId}`, names));
      }
    }
  }
  if (!stories.length) return state;
  const kept: NewsItem[] = [];
  for (const kind of ["match", "event", "signing", "sacking", "upset", "rivalry"] as const) {
    const own = stories.filter(({ story }) => story.kind === kind).sort((a, b) => b.rank - a.rank);
    const limit = kind === "match" || kind === "event" ? own.length : PER_DAY[kind];
    kept.push(...own.slice(0, limit).map(({ story }) => story));
  }
  const memory = eventMemoryOf(state);
  const oldest = addDays(date, -NEWS_DAYS);
  return { ...state, eventMemory: { ...memory, news: [...memory.news.filter((item) => item.date >= oldest), ...kept] } };
}
