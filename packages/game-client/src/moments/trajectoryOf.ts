import { humanKey } from "@boleiro/engine/sim/coach/closeCoachSeason";
import { swapSeat, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import { derbyWinsOf, rivalryMemoryOf } from "@boleiro/engine/sim/rivalries/rivalryMemory";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import type { CoachRecord } from "@boleiro/engine/sim/history/history";
import type { Moment, MomentKind, Tally } from "@boleiro/engine/sim/moments/careerMoments";
import { IDOL_LINE, idolStandingOf, meterOf } from "@boleiro/engine/sim/moments/idolStanding";
import { competitionKeyName } from "../format/competitionName.js";
import { formatGameDate, formatMonthYear } from "../format/formatGameDate.js";
import type { ClubTag } from "./momentView.js";

/** What a marker on the timeline stands for, which picks its colour and the filter it answers to. */
export type MarkerKind = "title" | "idol" | "sacking" | "exit" | "tribute" | "award";

/** A point of the career on the timeline: when (as a fractional year), what, and the card it opens. */
export type TrajectoryMarker = { id: string; at: number; date: IsoDate; kind: MarkerKind; icon: string; count: number; title: string; detail: string; club: ClubTag; momentId: string | null };

/** A spell at a club as a band on the timeline. */
export type TrajectoryBand = { from: number; to: number; club: ClubTag; label: string };

/** The fans' standing with a club over the years, sampled at each season's end and when he left. */
export type IdolLine = { club: ClubTag; points: [at: number, value: number][] };

export type Trajectory = {
  coachName: string;
  since: string;
  from: number;
  to: number;
  today: string;
  summary: { value: number; label: string; isFoil: boolean }[];
  bands: TrajectoryBand[];
  markers: TrajectoryMarker[];
  idolLines: IdolLine[];
  records: [label: string, value: string][];
  games: number;
};

const NO_COLOURS = { primary: "#0B7A3B", secondary: "#FFFFFF" };
const clubTagOf = (state: GameState, clubId: string): ClubTag => ({ id: clubId, name: state.clubs[clubId]?.shortName ?? clubId, colours: state.clubs[clubId]?.colours ?? NO_COLOURS });
const yearOf = (date: IsoDate) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) - 1) / 12 + (Number(date.slice(8, 10)) - 1) / 365;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const gamesOf = ([w, d, l]: Tally) => w + d + l;

const MOMENT_MARKERS: Partial<Record<MomentKind, { kind: MarkerKind; icon: string }>> = {
  idol: { kind: "idol", icon: "star" },
  sendOff: { kind: "exit", icon: "flag-banner" },
  quietExit: { kind: "exit", icon: "signature" },
  milestone: { kind: "tribute", icon: "medal" },
  homecoming: { kind: "tribute", icon: "users-four" },
  idolRetired: { kind: "tribute", icon: "t-shirt" },
  testimonial: { kind: "tribute", icon: "t-shirt" },
  comeBack: { kind: "tribute", icon: "handshake" },
  playerAward: { kind: "award", icon: "medal" },
};

function momentLine(state: GameState, moment: Moment): { title: string; detail: string } {
  const club = clubTagOf(state, moment.clubId).name;
  switch (moment.kind) {
    case "idol":
      return { title: `Ídolo do ${club}`, detail: `A torcida passou a contar você entre os dela: ${moment.standing}.` };
    case "sendOff":
      return { title: `Despedida do ${club}`, detail: `Corredor, mosaico e a última volta depois de ${plural(Math.max(1, Math.round(moment.months / 12)), "ano", "anos")}.` };
    case "quietExit":
      return { title: `Saída do ${club}`, detail: moment.how === "resigned" ? "Você pediu para sair. Uma nota curta." : "Uma nota curta, sem homenagem." };
    case "milestone":
      return { title: moment.milestone === "years" ? `Dez anos de ${club}` : `${moment.count} jogos pelo ${club}`, detail: "Camisa emoldurada antes do jogo." };
    case "homecoming":
      return { title: `Aplaudido no ${club}`, detail: "Minuto de aplausos e placa na volta como visitante." };
    case "idolRetired":
      return { title: `${moment.name} se aposenta`, detail: `${moment.apps} jogos e ${moment.goals} gols pelo ${club}.` };
    case "testimonial":
      return { title: `Despedida de ${moment.name}`, detail: `${moment.homeGoals} × ${moment.awayGoals} no jogo de despedida.` };
    case "comeBack":
      return { title: `O ${club} pede a sua volta`, detail: "Campanha da torcida e proposta por escrito." };
    case "playerAward":
      return { title: `${moment.players[0]?.name ?? ""}: ${moment.award === "bolaDeOuro" ? "Bola de Ouro" : moment.award === "ballonDor" ? "melhor do mundo" : moment.award === "topScorer" ? "artilheiro" : "convocado para a Copa"}`, detail: `Temporada ${moment.season}.` };
    case "title":
      return { title: `${competitionKeyName(moment.competition)} ${moment.season}`, detail: moment.story.lastWon === null ? "Primeiro do clube no jogo." : `${moment.season - moment.story.lastWon} anos depois do último.` };
    case "sacking":
      return { title: `Demitido do ${club}`, detail: `${moment.position}º lugar, a meta era ${moment.targetPosition}º.` };
    case "retirement":
      return { title: "A aposentadoria", detail: "O álbum fechado." };
  }
}

/** The fans' meter at a club at each season's end of his spells there, and the day he left. */
function idolLineOf(state: GameState, record: CoachRecord, name: string | undefined, clubId: string): IdolLine {
  const stints = record.stints.filter((s) => s.clubId === clubId);
  const first = stints[0];
  const dates: IsoDate[] = [];
  if (first) dates.push(first.from);
  for (const stint of stints) {
    for (let year = Number(stint.from.slice(0, 4)); year <= Number((stint.until ?? state.date).slice(0, 4)); year++) {
      const end = `${year}-12-31`;
      if (end > stint.from && end < (stint.until ?? state.date)) dates.push(end);
    }
    dates.push(stint.until ?? state.date);
  }
  const lastDate = dates.at(-1);
  if (lastDate && lastDate < state.date) dates.push(state.date);
  // The derbies won are kept as a total, so the line spreads them over his days at the club.
  const totalDays = stints.reduce((sum, s) => sum + (Date.parse(s.until ?? state.date) - Date.parse(s.from)), 0) || 1;
  const wins = derbyWinsOf(state, humanKey(name), clubId);
  const points = [...new Set(dates)].sort().map((date): [number, number] => {
    const daysSoFar = stints.reduce((sum, s) => sum + Math.max(0, Math.min(Date.parse(date), Date.parse(s.until ?? state.date)) - Date.parse(s.from)), 0);
    const derbyWins = { ...rivalryMemoryOf(state).derbyWins, [humanKey(name)]: { [clubId]: Math.round((wins * daysSoFar) / totalDays) } };
    const upTo: CoachRecord = {
      ...record,
      stints: record.stints.filter((s) => s.from <= date).map((s) => (s.until === null || s.until > date ? { ...s, until: date, left: null } : s)),
      trophies: record.trophies.filter((t) => `${t.season}-12-31` <= date || t.season < Number(date.slice(0, 4))),
    };
    return [yearOf(date), meterOf(idolStandingOf({ date, rivalries: { ...rivalryMemoryOf(state), derbyWins } }, { name, record: upTo }, clubId))];
  });
  return { club: clubTagOf(state, clubId), points };
}

/**
 * The career of a human coach as the trajectory screen draws it: `seat` 0 is the one in the seat, then
 * the waiting ones in turn order. Clubs as bands, titles, idol crossings, sackings, exits, tributes and
 * awards as markers, the fans' meter per club over time, and his records.
 */
export function trajectoryOf(game: GameState, seat = 0): Trajectory {
  const state = seat > 0 && seat <= waitingCoachesOf(game).length ? swapSeat(game, seat - 1) : game;
  const record = state.history.coach;
  const name = state.coachName;
  const coachName = state.coachName || state.eggs?.coachName || "Você";
  const moments = record.moments;
  const shown = moments?.past ?? [];
  const first = record.stints[0]?.from ?? state.date;
  const from = Math.floor(yearOf(first));
  const to = Math.max(from + 1, Math.floor(yearOf(state.date)) + 1);
  const bands = record.stints.map((stint): TrajectoryBand => {
    const titles = record.trophies.filter((t) => t.clubId === stint.clubId && t.season >= Number(stint.from.slice(0, 4)) && t.season <= Number((stint.until ?? state.date).slice(0, 4))).length;
    return { from: yearOf(stint.from), to: yearOf(stint.until ?? state.date), club: clubTagOf(state, stint.clubId), label: `${stint.from.slice(0, 4)} a ${(stint.until ?? state.date).slice(0, 4)} · ${plural(titles, "título", "títulos")}` };
  });
  const titleMoments = new Map(shown.filter((m): m is Extract<Moment, { kind: "title" }> => m.kind === "title").map((m) => [`${m.competition}:${m.season}:${m.clubId}`, m]));
  const markers: TrajectoryMarker[] = record.trophies.map((trophy, index) => {
    const moment = titleMoments.get(`${trophy.competition}:${trophy.season}:${trophy.clubId}`);
    const date = moment?.date ?? `${trophy.season}-12-01`;
    const line = moment ? momentLine(state, moment) : { title: `${competitionKeyName(trophy.competition)} ${trophy.season}`, detail: "Título com você." };
    return { id: `trophy:${index}`, at: yearOf(date), date, kind: "title", icon: "trophy", count: 1, ...line, club: clubTagOf(state, trophy.clubId), momentId: moment?.id ?? null };
  });
  record.firings.forEach((firing, index) => {
    const moment = shown.find((m) => m.kind === "sacking" && m.clubId === firing.clubId && m.date === firing.date);
    markers.push({ id: `firing:${index}`, at: yearOf(firing.date), date: firing.date, kind: "sacking", icon: "timer", count: 1, title: `Demitido do ${clubTagOf(state, firing.clubId).name}`, detail: `${firing.position}º lugar, a meta era ${firing.targetPosition}º.`, club: clubTagOf(state, firing.clubId), momentId: moment?.id ?? null });
  });
  for (const moment of shown) {
    const look = MOMENT_MARKERS[moment.kind];
    if (look) markers.push({ id: moment.id, at: yearOf(moment.date), date: moment.date, ...look, count: 1, ...momentLine(state, moment), club: clubTagOf(state, moment.clubId), momentId: moment.id });
  }
  markers.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const clubIds = [...new Set(record.stints.map((s) => s.clubId))];
  const coach = { name, record };
  const idolClubs = clubIds.filter((id) => idolStandingOf(state, coach, id).points >= IDOL_LINE);
  const games = moments ? Object.values(moments.games).reduce((sum, tally) => sum + gamesOf(tally), 0) : 0;
  const mostGames = moments ? Object.entries(moments.games).sort((a, b) => gamesOf(b[1]) - gamesOf(a[1]))[0] : undefined;
  const titleRun = [...titleMoments.values()].sort((a, b) => b.season - b.story.droughtFrom - (a.season - a.story.droughtFrom))[0];
  const closed = record.stints.filter((s) => s.until !== null);
  const shortest = closed.sort((a, b) => Date.parse(a.until ?? "") - Date.parse(a.from) - (Date.parse(b.until ?? "") - Date.parse(b.from)))[0];
  const award = shown.find((m) => m.kind === "playerAward" && (m.award === "ballonDor" || m.award === "bolaDeOuro"));
  const records: [string, string][] = [];
  if (mostGames) records.push(["Mais jogos num clube", `${clubTagOf(state, mostGames[0]).name}, ${gamesOf(mostGames[1])}`]);
  const byClub = new Map<string, number>();
  for (const trophy of record.trophies) byClub.set(trophy.clubId, (byClub.get(trophy.clubId) ?? 0) + 1);
  const mostTitles = [...byClub].sort((a, b) => b[1] - a[1])[0];
  if (mostTitles) records.push(["Mais títulos num clube", `${clubTagOf(state, mostTitles[0]).name}, ${mostTitles[1]}`]);
  if (titleRun) records.push(["Maior fila quebrada", `${plural(titleRun.season - titleRun.story.droughtFrom, "ano", "anos")} · ${clubTagOf(state, titleRun.clubId).name}, ${titleRun.season}`]);
  if (award?.kind === "playerAward") records.push(["Jogador premiado", `${award.players[0]?.name ?? ""}, ${award.award === "ballonDor" ? "melhor do mundo" : "Bola de Ouro"} ${award.season}`]);
  if (shortest?.until) records.push(["Passagem mais curta", `${clubTagOf(state, shortest.clubId).name}, ${plural(Math.max(1, Math.round((Date.parse(shortest.until) - Date.parse(shortest.from)) / (30.44 * 86_400_000))), "mês", "meses")}`]);
  return {
    coachName,
    since: formatMonthYear(first),
    from,
    to,
    today: formatGameDate(state.date),
    summary: [
      { value: new Set(record.seasons.map((s) => s.season)).size || Math.max(1, to - from), label: "temporadas", isFoil: false },
      { value: clubIds.length, label: clubIds.length === 1 ? "clube" : "clubes", isFoil: false },
      { value: record.trophies.length, label: record.trophies.length === 1 ? "título" : "títulos", isFoil: true },
      { value: idolClubs.length, label: idolClubs.length === 1 ? "vez ídolo" : "vezes ídolo", isFoil: true },
      { value: record.firings.length, label: record.firings.length === 1 ? "demissão" : "demissões", isFoil: false },
    ],
    bands,
    markers,
    idolLines: clubIds.map((id) => idolLineOf(state, record, name, id)),
    records,
    games,
  };
}
