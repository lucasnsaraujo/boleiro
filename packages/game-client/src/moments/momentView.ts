import type { Role } from "@boleiro/data/players";
import { keyedStream } from "@boleiro/engine/engine/random";
import { roleOf } from "@boleiro/engine/sim/history/seasonAwards";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import type { CoachRecord, CompetitionKey } from "@boleiro/engine/sim/history/history";
import { IDOL_APPS, IDOL_GOALS } from "@boleiro/engine/sim/history/clubHistory";
import type { IdolEntry, Moment, PressureMark, Tally } from "@boleiro/engine/sim/moments/careerMoments";
import { IDOL_LINE, idolStandingOf, meterOf } from "@boleiro/engine/sim/moments/idolStanding";
import { LONG_CELEBRATION_S } from "@boleiro/engine/sim/moments/titleStory";
import { rivalsOf } from "@boleiro/engine/sim/morale/rivalsOf";
import { rivalryOf } from "@boleiro/engine/sim/rivalries/rivalryOf";
import { eventMemoryOf } from "@boleiro/engine/sim/events/eventMemory";
import { competitionKeyName } from "../format/competitionName.js";
import { formatBarDate, formatGameDate, formatMonthYear } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { compareText } from "@boleiro/engine/sim/compareText";

/** A club as a moment shows it: its id (for the crest), short name and kit colours. */
export type ClubTag = { id: string; name: string; colours: { primary: string; secondary: string } };

/** A player or coach sticker: the art's initial and number, the name and a caption under it. */
export type MomentSticker = { id: string; name: string; initial: string; number: string | null; caption: string; isShiny: boolean; club: ClubTag };

/** One of the coach's results as the sacking flips them. */
export type RunResult = { result: "V" | "E" | "D"; opponent: ClubTag; isHome: boolean; score: string; board: number; fans: number; isDerby: boolean };

/** A newspaper clipping: its kicker (day and place), headline and body. */
export type Clipping = { kicker: string; headline: string; body: string };

type Common = { id: string; when: string; club: ClubTag; coachName: string; cause: string };

export type IdolView = Common & {
  kind: "idol";
  standing: number;
  ledger: { icon: string; title: string; detail: string; points: number }[];
  monthsAtClub: number;
  since: string;
  rivals: string[];
  idols: MomentSticker[];
};

export type SackingView = Common & {
  kind: "sacking";
  headline: string;
  place: string;
  run: RunResult[];
  startBoard: number;
  startFans: number;
  clippings: Clipping[];
  stadium: string;
  night: { time: string; text: string }[];
  phoneDate: string;
  clubNote: string;
  paperAlert: string;
  assistant: { name: string; text: string };
  morning: { kicker: string; headline: string; deck: string; side: { headline: string; body: string }[]; tally: string[] };
  reactions: { club: ClubTag; who: string; quote: string; note: string }[];
  masthead: string;
};

export type SendOffView = Common & {
  kind: "sendOff";
  banner: string;
  stadium: string;
  headline: string;
  story: string;
  boards: string[];
  squad: MomentSticker[];
  coach: MomentSticker;
  numbers: { value: string; label: string; isFoil: boolean }[];
  titles: string;
  period: string;
};

export type QuietExitView = Common & {
  kind: "quietExit";
  place: string;
  paragraphs: string[];
  period: string;
  facts: [label: string, value: string][];
  footnote: { date: string; items: { headline: string; body: string; isYours: boolean }[] };
};

export type TitleView = Common & {
  kind: "title";
  isLong: boolean;
  seconds: number;
  competition: CompetitionKey;
  /** The season of the title, whose edition's logo the trophy shows. */
  season: number;
  competitionName: string;
  headline: string;
  subline: string;
  matchLine: string;
  eleven: MomentSticker[];
  facts: { value: string; label: string }[];
  clipping: string;
  drought: { from: number; to: number; label: string; tag: string };
  nearMisses: { year: number; label: string; isYours: boolean }[];
  veterans: MomentSticker[];
  paper: { masthead: string; headline: string; deck: string };
};

export type TributeView = Common & {
  kind: "milestone" | "homecoming" | "idolRetired";
  headline: string;
  story: string;
  shirtName: string;
  count: number;
  countLabel: string;
  facts: { value: string; label: string; isFoil: boolean }[];
  mosaic: string;
  plaque: { name: string; text: string; signed: string };
  result: string | null;
  opponent: ClubTag | null;
  standing: number;
};

export type TestimonialView = Common & {
  kind: "testimonial";
  playerName: string;
  ticket: { date: string; matchup: string };
  hero: MomentSticker;
  headline: string;
  story: string;
  stats: { value: string; label: string; isFoil: boolean }[];
  home: { club: ClubTag; eleven: MomentSticker[] };
  away: { club: ClubTag; eleven: MomentSticker[] };
  /** The match's feed: the player it is about (shown in bold) and what he did. */
  events: { minute: number; icon: string; who: string | null; text: string; side: "home" | "away" | null }[];
  score: [number, number];
  stadium: string;
};

export type ComeBackView = Common & {
  kind: "comeBack";
  masthead: string;
  strap: [string, string];
  headline: string;
  deck: string;
  banner: string;
  side: { headline: string; body: string }[];
  campaign: { value: string; label: string; countTo: number | null }[];
  standing: number;
  crisis: number;
  crisisNote: string;
  offer: { terms: [label: string, value: string, note: string][]; letter: string; until: string } | null;
  reunions: MomentSticker[];
  reunionsLabel: string;
};

export type PlayerAwardView = Common & {
  kind: "playerAward";
  award: string;
  plate: string;
  player: MomentSticker;
  others: MomentSticker[];
  headline: string;
  sub: string;
  stats: { value: string; label: string; isFoil: boolean }[];
  season: { date: string; title: string; detail: string; isNow: boolean }[];
  /** The player's clubs in this game, the most games first. */
  career: { club: ClubTag; apps: number; goals: number }[];
};

export type RetirementView = Common & {
  kind: "retirement";
  /** "2019 a 2026" */
  years: string;
  span: string;
  eras: { club: ClubTag; name: string; years: string; line: string; stickers: MomentSticker[] }[];
  clubs: { club: ClubTag; years: string; note: string; isIdol: boolean }[];
  numbers: { value: number | string; label: string; isFoil: boolean }[];
  titles: string;
  strip: { from: number; to: number; bands: { from: number; to: number; club: ClubTag }[]; titles: number[]; idols: number[]; sackings: number[] };
  tributes: { club: ClubTag; text: string }[];
  /** Former clubs whose tributes the page has no room for. */
  moreTributes: number;
  farewell: { eleven: MomentSticker[]; score: [number, number]; note: string };
  games: number;
  lastClub: ClubTag;
};

export type MomentView = IdolView | SackingView | SendOffView | QuietExitView | TitleView | TributeView | TestimonialView | ComeBackView | PlayerAwardView | RetirementView;

const NO_COLOURS = { primary: "#0B7A3B", secondary: "#FFFFFF" };
const MONTH_DAYS = 30.44;

function clubTagOf(state: GameState, clubId: string): ClubTag {
  const club = state.clubs[clubId];
  return { id: clubId, name: club?.shortName ?? clubId, colours: club?.colours ?? NO_COLOURS };
}

const coachNameOf = (state: GameState) => state.coachName || state.eggs?.coachName || "Você";
/** "Sáb, 27 nov 2027" */
const dayOf = (date: IsoDate) => `${formatBarDate(date)} ${date.slice(0, 4)}`;
const yearsOf = (months: number) => Math.max(1, Math.round(months / 12));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const score = (a: number, b: number) => `${a} × ${b}`;

function stickerOfPlayer(state: GameState, playerId: string, name: string, clubId: string, caption: string, isShiny = false): MomentSticker {
  return { id: playerId, name, initial: name.charAt(0).toUpperCase(), number: null, caption, isShiny, club: clubTagOf(state, clubId) };
}

function coachSticker(state: GameState, clubId: string, caption: string, isShiny = true): MomentSticker {
  const name = coachNameOf(state);
  return { id: "coach", name, initial: name.charAt(0).toUpperCase(), number: null, caption, isShiny, club: clubTagOf(state, clubId) };
}

const ROLE_WORDS: Record<Role, string> = { goleiro: "goleiro", lateral: "lateral", zagueiro: "zagueiro", meia: "meia", atacante: "atacante" };

/** The club's players today, the most used this season first. */
function squadOf(state: GameState, clubId: string, count: number): SimPlayer[] {
  const used = state.history.current.squads?.[clubId] ?? {};
  return Object.values(state.players)
    .filter((player) => player.clubId === clubId)
    .sort((a, b) => (used[b.id]?.[0] ?? 0) - (used[a.id]?.[0] ?? 0) || b.strength - a.strength || compareText(a.id, b.id))
    .slice(0, count);
}

const isIdolAt = (state: GameState, playerId: string, clubId: string) => {
  const mark = state.history.players[clubId]?.[playerId];
  return !!mark && (mark.apps >= IDOL_APPS || mark.goals >= IDOL_GOALS);
};

function elevenOf(state: GameState, clubId: string, count = 11): MomentSticker[] {
  return squadOf(state, clubId, count).map((player) => stickerOfPlayer(state, player.id, player.name, clubId, ROLE_WORDS[roleOf(player)], isIdolAt(state, player.id, clubId)));
}

function titlesLine(trophies: CoachRecord["trophies"]): string {
  const byKey = new Map<CompetitionKey, number[]>();
  for (const trophy of trophies) byKey.set(trophy.competition, [...(byKey.get(trophy.competition) ?? []), trophy.season]);
  return [...byKey]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, seasons]) => `${seasons.length} ${competitionKeyName(key)} (${seasons.join(", ")})`)
    .join(" · ");
}

const LEDGER_ICONS: Record<IdolEntry["cause"], string> = { years: "calendar-dots", title: "trophy", derbies: "soccer-ball", left: "door-open", rivalMove: "x" };

function ledgerRow(entry: IdolEntry, clubName: string): IdolView["ledger"][number] {
  const points = Math.round(entry.points);
  switch (entry.cause) {
    case "years": {
      const years = Math.floor(entry.count);
      const months = Math.round((entry.count - years) * 12);
      return { icon: LEDGER_ICONS.years, title: years ? plural(years, "ano de casa", "anos de casa") : plural(months, "mês de casa", "meses de casa"), detail: years && months ? `e ${plural(months, "mês", "meses")}` : "", points };
    }
    case "title":
      return { icon: LEDGER_ICONS.title, title: `${competitionKeyName(entry.competition ?? "")} ${entry.season ?? ""}`.trim(), detail: "título com você", points };
    case "derbies":
      return { icon: LEDGER_ICONS.derbies, title: "Clássicos", detail: `${plural(entry.count, "vitória", "vitórias")} em clássicos pelo ${clubName}`, points };
    case "left":
      return { icon: LEDGER_ICONS.left, title: "A saída", detail: entry.left === "resigned" ? "você pediu para sair" : "a forma como saiu", points };
    case "rivalMove":
      return { icon: LEDGER_ICONS.rivalMove, title: "Foi para o rival", detail: "a torcida não perdoa", points };
  }
}

function monthsAt(record: CoachRecord, clubId: string, today: IsoDate): number {
  const days = record.stints.filter((s) => s.clubId === clubId).reduce((sum, s) => sum + (Date.parse(s.until ?? today) - Date.parse(s.from)) / 86_400_000, 0);
  return Math.round(days / MONTH_DAYS);
}

function idolView(state: GameState, moment: Extract<Moment, { kind: "idol" }>): IdolView {
  const club = clubTagOf(state, moment.clubId);
  const record = state.history.coach;
  const firstFrom = record.stints.find((s) => s.clubId === moment.clubId)?.from ?? moment.date;
  const rivals = [...(rivalsOf(state.clubs).get(moment.clubId) ?? [])].filter((id) => (rivalryOf(id, moment.clubId)?.intensity ?? 0) >= 3).map((id) => clubTagOf(state, id).name);
  const idolPlayers = Object.entries(state.history.players[moment.clubId] ?? {})
    .filter(([, mark]) => mark.apps >= IDOL_APPS || mark.goals >= IDOL_GOALS)
    .sort((a, b) => b[1].apps - a[1].apps)
    .slice(0, 4)
    .map(([id, mark]) => stickerOfPlayer(state, id, mark.name, moment.clubId, `${mark.apps} jogos`, true));
  return {
    kind: "idol",
    id: moment.id,
    when: dayOf(moment.date),
    club,
    coachName: coachNameOf(state),
    cause: `A torcida conta anos de casa, títulos e clássicos ganhos, e desconta a forma como você sai. Passou de ${IDOL_LINE}: ${moment.standing}.`,
    standing: moment.standing,
    ledger: moment.ledger.map((entry) => ledgerRow(entry, club.name)),
    monthsAtClub: monthsAt(record, moment.clubId, moment.date),
    since: formatMonthYear(firstFrom),
    rivals: rivals.slice(0, 3),
    idols: [...idolPlayers, coachSticker(state, moment.clubId, `desde ${firstFrom.slice(0, 4)}`)],
  };
}

function runOf(state: GameState, marks: readonly PressureMark[], clubId: string): RunResult[] {
  return marks.map((mark) => ({
    result: mark.goalsFor > mark.goalsAgainst ? "V" : mark.goalsFor === mark.goalsAgainst ? "E" : "D",
    opponent: clubTagOf(state, mark.opponentId),
    isHome: mark.isHome,
    score: mark.isHome ? score(mark.goalsFor, mark.goalsAgainst) : score(mark.goalsAgainst, mark.goalsFor),
    board: mark.board,
    fans: mark.fans,
    isDerby: (rivalryOf(clubId, mark.opponentId)?.intensity ?? 0) >= 2,
  }));
}

/** How a run reads as a headline: "Nove jogos sem vencer", "Cinco derrotas em oito jogos". */
function runHeadline(run: readonly RunResult[]): string {
  const NUMBERS = ["Nenhum", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  let winless = 0;
  for (const r of [...run].reverse()) {
    if (r.result === "V") break;
    winless++;
  }
  if (winless >= 3) return `${NUMBERS[winless] ?? winless} jogos sem vencer`;
  const losses = run.filter((r) => r.result === "D").length;
  return `${NUMBERS[losses] ?? losses} derrotas em ${(NUMBERS[run.length] ?? String(run.length)).toLowerCase()} jogos`;
}

function nightTimes(state: GameState, id: string): { meet: string; call: string; dark: string; note: string } {
  const random = keyedStream(state.seed, `night:${id}`);
  const meetMinute = 20 * 60 + 50 + Math.floor(random() * 70);
  const noteMinute = 24 * 60 + 20 + Math.floor(random() * 60);
  const at = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    return `${h}h${String(minutes % 60).padStart(2, "0")}`;
  };
  return { meet: at(meetMinute), call: at(meetMinute + 110 + Math.floor(random() * 30)), dark: at(noteMinute - 14), note: at(noteMinute) };
}

function sackingView(state: GameState, moment: Extract<Moment, { kind: "sacking" }>): SackingView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const marks = moment.run.slice(-9);
  const baseline = moment.run.length > marks.length ? moment.run[0] : undefined;
  const run = runOf(state, marks, moment.clubId);
  const last = run.at(-1);
  const titles = state.history.coach.trophies.filter((t) => t.clubId === moment.clubId);
  const times = nightTimes(state, moment.id);
  const stadium = state.clubs[moment.clubId]?.stadium ?? club.name;
  const rival = moment.rivalId ? clubTagOf(state, moment.rivalId) : null;
  const isIdol = moment.standing >= IDOL_LINE;
  const nextDay = new Date(Date.parse(`${moment.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const derbyLoss = run.find((r) => r.isDerby && r.result === "D");
  const clippings: Clipping[] = [];
  if (moment.ultimatumOn) clippings.push({ kicker: dayOf(moment.ultimatumOn), headline: "Ultimato da diretoria", body: `A diretoria do ${club.name} cobra reação de ${coachName}. Sem vitória, a conversa muda.` });
  if (moment.protestOn) clippings.push({ kicker: dayOf(moment.protestOn), headline: "Protesto na porta do CT", body: "Torcedores cobram elenco e diretoria depois de mais um tropeço." });
  if (last) clippings.push({ kicker: dayOf(moment.date), headline: last.isHome ? `${club.name} ${last.score} ${last.opponent.name}` : `${last.opponent.name} ${last.score} ${club.name}`, body: last.result === "D" ? "Vaias no fim. Na saída do campo, você não fala com a imprensa." : "Nem o resultado segurou a diretoria." });
  const gamesPlayed = moment.games[0] + moment.games[1] + moment.games[2];
  const titleWords = titles.length ? `Campeão ${titles.map((t) => `${competitionKeyName(t.competition)} ${t.season}`).slice(-2).join(" e ")}, ` : "";
  return {
    kind: "sacking",
    id: moment.id,
    when: dayOf(moment.date),
    club,
    coachName,
    cause: `${runHeadline(run)} e a diretoria em ${last?.board ?? moment.run.at(-1)?.board ?? 0}. ${isIdol ? `Ser ídolo segurou a torcida, não a diretoria (${moment.standing}).` : "Sem crédito com a torcida, a diretoria não esperou."}`,
    headline: runHeadline(run),
    place: `${club.name} · ${moment.position}º lugar, a meta era ${moment.targetPosition}º`,
    run,
    startBoard: baseline?.board ?? 50,
    startFans: baseline?.fans ?? run[0]?.fans ?? 50,
    clippings: clippings.slice(-3),
    stadium,
    night: [
      { time: times.meet, text: `Diretoria se reúne no ${stadium}` },
      { time: times.call, text: "Ninguém atende seu empresário" },
      { time: times.dark, text: "Luzes apagam na sala da presidência" },
      { time: times.note, text: "Sai a nota" },
    ],
    phoneDate: formatGameDate(nextDay).replace(/ de \d{4}$/, ""),
    clubNote: `O ${club.name} comunica que ${coachName} não é mais o técnico do clube.${titles.length ? ` Agradecemos pelo título de ${titles.at(-1)?.season}.` : " Agradecemos pelo trabalho."}`,
    paperAlert: `Urgente: ${club.name} demite ${coachName} na madrugada`,
    assistant: { name: state.coach.assistant?.name ?? "Seu auxiliar", text: "Professor, acabei de ver. Amanhã cedo tô aí." },
    morning: {
      kicker: club.name,
      headline: "Demitido na madrugada",
      deck: `${titleWords}${coachName} cai depois de ${runHeadline(run).toLowerCase()}. A nota saiu à ${times.note}, por mensagem.`,
      side: [
        { headline: "Vestiário soube pelo celular", body: isIdol ? "Capitão defende o técnico: “Ele mudou este clube.”" : "Ninguém do elenco quis falar na saída do treino." },
        { headline: `${club.name} já sonda substituto`, body: "Diretoria quer um nome até o próximo jogo." },
      ],
      tally: [`${moment.months >= 12 ? `${yearsOf(moment.months)} ${yearsOf(moment.months) === 1 ? "ano" : "anos"}` : plural(moment.months, "mês", "meses")} no ${club.name}`, `${gamesPlayed} jogos`, `${moment.games[0]} vitórias`],
    },
    reactions: [
      isIdol
        ? { club, who: "Torcida no CT", quote: "“Respeita a nossa história”", note: "Faixa amarrada no portão às 6h." }
        : { club, who: "Torcida nas redes", quote: "“Já foi tarde”", note: "A hashtag sobe antes das 8h." },
      ...(rival ? [{ club: rival, who: `Torcida do ${rival.name}`, quote: derbyLoss ? "“O clássico derrubou”" : "“Um a menos”", note: "Piada nas redes antes do café." }] : []),
    ],
    masthead: `${dayOf(nextDay)} · 7h`,
  };
}

function sendOffView(state: GameState, moment: Extract<Moment, { kind: "sendOff" }>): SendOffView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const stint = state.history.coach.stints.findLast((s) => s.clubId === moment.clubId);
  const from = stint?.from ?? moment.date;
  const fromYear = from.slice(0, 4);
  const toYear = moment.date.slice(0, 4);
  const stadium = state.clubs[moment.clubId]?.stadium ?? club.name;
  const played = moment.games[0] + moment.games[1] + moment.games[2];
  const seasons = Number(toYear) - Number(fromYear) + 1;
  const trophies = state.history.coach.trophies.filter((t) => t.clubId === moment.clubId && moment.titles.includes(t.competition));
  const titleCount = moment.titles.length;
  const NUMBERS = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
  const squad = elevenOf(state, moment.clubId, 12).map((sticker) => ({ ...sticker, isShiny: false }));
  return {
    kind: "sendOff",
    id: moment.id,
    when: dayOf(moment.date),
    club,
    coachName,
    cause: `${moment.toClubId ? `Você aceitou a proposta do ${clubTagOf(state, moment.toClubId).name}` : "Seu contrato acabou"}. ${plural(seasons, "temporada", "temporadas")}, ${plural(titleCount, "título", "títulos")}${moment.standing >= IDOL_LINE ? " e ídolo da torcida" : ""}: a despedida é das grandes.`,
    banner: `${coachName} · ${fromYear}–${toYear} · ${NUMBERS[titleCount] ?? titleCount} ${titleCount === 1 ? "taça" : "taças"} · eterno`,
    stadium,
    headline: "A última volta no gramado",
    story: `Ninguém foi embora. O time fez o corredor, a arquibancada virou mosaico e você atravessou o campo até o meio, onde tudo começou em ${fromYear}.`,
    boards: [`OBRIGADO, ${coachName.toUpperCase()}`, `${club.name.toUpperCase()} ${fromYear}–${toYear}`],
    squad,
    coach: coachSticker(state, moment.clubId, `${fromYear}–${toYear}`),
    numbers: [
      { value: String(seasons), label: seasons === 1 ? "temporada" : "temporadas", isFoil: false },
      { value: String(played), label: "jogos", isFoil: false },
      { value: String(moment.games[0]), label: "vitórias", isFoil: false },
      { value: String(titleCount), label: titleCount === 1 ? "título" : "títulos", isFoil: true },
      { value: String(moment.derbyWins), label: "clássicos vencidos", isFoil: false },
      { value: String(moment.standing), label: moment.standing >= 100 ? "ídolo, o máximo" : "com a torcida", isFoil: moment.standing >= IDOL_LINE },
    ],
    titles: titlesLine(trophies),
    period: `${formatMonthYear(from)} a ${formatMonthYear(moment.date)}`,
  };
}

const QUIET_WORDS: Record<"resigned" | "contractEnded" | "moved", (club: string, coach: string, to: string | null) => string[]> = {
  resigned: (club) => [`Ao ${club},`, "peço demissão do cargo de técnico a partir de hoje. Os resultados não vieram, e o clube precisa de outra voz no vestiário.", "Obrigado aos jogadores, à comissão técnica e a quem me recebeu bem."],
  contractEnded: (club) => [`Ao ${club},`, "meu contrato chega ao fim e encerro aqui o trabalho. Não houve acordo para seguir.", "Obrigado a todos que trabalharam comigo."],
  moved: (club, _coach, to) => [`Ao ${club},`, `aceitei a proposta ${to ? `do ${to}` : "de outro clube"} e deixo o cargo hoje.`, "Obrigado pelo período e boa sorte daqui pra frente."],
};

function quietExitView(state: GameState, moment: Extract<Moment, { kind: "quietExit" }>): QuietExitView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const stint = state.history.coach.stints.findLast((s) => s.clubId === moment.clubId);
  const from = stint?.from ?? moment.date;
  const to = moment.toClubId ? clubTagOf(state, moment.toClubId).name : null;
  const played = moment.games[0] + moment.games[1] + moment.games[2];
  const lengthWords = moment.months >= 12 ? plural(yearsOf(moment.months), "ano", "anos") : plural(Math.max(1, moment.months), "mês", "meses");
  const news = eventMemoryOf(state)
    .news.filter((item) => item.date === moment.date && !item.clubIds.includes(moment.clubId))
    .slice(0, 2)
    .map((item) => ({ headline: item.headline, body: item.body, isYours: false }));
  const own = { headline: `${coachName} deixa o ${club.name}`, body: `${lengthWords} depois de chegar. Ninguém pediu que ficasse.`, isYours: true };
  const why = moment.how === "resigned" ? "o pedido foi seu" : moment.how === "moved" ? "você trocou de clube" : "o contrato acabou";
  return {
    kind: "quietExit",
    id: moment.id,
    when: dayOf(moment.date),
    club,
    coachName,
    cause: `Foram ${lengthWords}, ${moment.titles ? plural(moment.titles, "título", "títulos") : "sem título"}, e ${why}. Por isso a saída é uma nota, sem homenagem.`,
    place: `${state.clubs[moment.clubId]?.stadium ?? club.name}, ${formatGameDate(moment.date)}`,
    paragraphs: QUIET_WORDS[moment.how](club.name, coachName, to),
    period: `${formatMonthYear(from)} a ${formatMonthYear(moment.date)}`,
    facts: [
      ["Jogos", String(played)],
      ["Campanha", `${moment.games[0]} V · ${moment.games[1]} E · ${moment.games[2]} D`],
      ["Títulos", moment.titles ? String(moment.titles) : "nenhum"],
    ],
    footnote: { date: `${dayOf(moment.date)} · pág. 9`, items: [news[0], own, news[1]].filter((item): item is QuietExitView["footnote"]["items"][number] => !!item) },
  };
}

function titleView(state: GameState, moment: Extract<Moment, { kind: "title" }>): TitleView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const { story } = moment;
  const name = competitionKeyName(moment.competition);
  const isLong = moment.seconds >= LONG_CELEBRATION_S;
  const decider = story.decider;
  const opponentId = decider ? (decider.homeId === moment.clubId ? decider.awayId : decider.homeId) : null;
  const matchLine = decider ? `${clubTagOf(state, decider.homeId).name} ${score(decider.homeGoals, decider.awayGoals)} ${clubTagOf(state, decider.awayId).name}` : name;
  const droughtYears = moment.season - story.droughtFrom;
  const standingNow = meterOf(idolStandingOf(state, { name: state.coachName, record: state.history.coach }, moment.clubId));
  const nearMisses = [
    ...story.runnerUps.map((year) => ({ year, label: "Vice da liga com você", isYours: true })),
    ...story.lostFinals.map((final) => ({ year: final.season, label: `Final da ${competitionKeyName(final.competition)} perdida com você`, isYours: true })),
  ].sort((a, b) => a.year - b.year);
  const firstWords = story.careerTitles === 1 ? "Seu primeiro título" : story.seasonInSpell === 1 ? "Na sua primeira temporada" : `Na ${story.seasonInSpell}ª temporada`;
  const drought = story.lastWon === null ? `Primeiro desde ${story.droughtFrom} no jogo` : `${plural(droughtYears, "ano", "anos")} desde o último, o de ${story.lastWon}`;
  return {
    kind: "title",
    id: moment.id,
    when: `${dayOf(moment.date)} · ${matchLine}`,
    club,
    coachName,
    cause: isLong
      ? `${plural(story.seasonInSpell, "temporada", "temporadas")} no clube${nearMissWords(story.runnerUps.length, story.lostFinals.length)}${story.rivalId ? `, o ${clubTagOf(state, story.rivalId).name} batido` : ""}: a festa longa. Ídolo do ${club.name}: ${standingNow}.`
      : `${story.seasonInSpell === 1 ? "Técnico recém-chegado" : "Pouca espera"} e nenhuma fila longa para quebrar: a festa é rápida e alegre.`,
    isLong,
    seconds: moment.seconds,
    competition: moment.competition,
    season: moment.season,
    competitionName: name,
    headline: championOf(moment.competition, name),
    subline: isLong ? `Depois de ${plural(story.seasonInSpell, "temporada", "temporadas")}` : firstWords,
    matchLine,
    eleven: elevenOf(state, moment.clubId, 12),
    facts: [
      { value: story.lastWon === null ? "1º" : plural(droughtYears, "ano", "anos"), label: story.lastWon === null ? "título no jogo" : `desde o último, ${story.lastWon}` },
      { value: String(story.careerTitles), label: story.careerTitles === 1 ? "título na carreira" : "títulos na carreira" },
    ],
    clipping: `${club.name} campeão${opponentId ? ` contra o ${clubTagOf(state, opponentId).name}` : ""}`,
    drought: { from: story.droughtFrom, to: moment.season, label: story.lastWon === null ? `anos de espera desde ${story.droughtFrom}` : `anos sem ${name}`, tag: story.lastWon === null ? drought : `${plural(droughtYears, "ano", "anos")} de fila` },
    nearMisses,
    veterans: story.veterans.flatMap((id) => {
      const player = state.players[id];
      return player ? [stickerOfPlayer(state, id, player.name, moment.clubId, `${ROLE_WORDS[roleOf(player)]} · desde ${story.droughtFrom >= moment.season - story.seasonInSpell ? moment.season - story.seasonInSpell + 1 : story.droughtFrom}`)] : [];
    }),
    paper: {
      masthead: `${state.clubs[moment.clubId]?.state ?? ""} · ${formatGameDate(moment.date)}`,
      headline: "Finalmente",
      deck: `${story.lastWon === null ? "Pela primeira vez no jogo" : `${plural(droughtYears, "ano", "anos")} depois`}, o ${club.name} é campeão${moment.competition.startsWith("serie-a") ? " brasileiro" : ` da ${name}`}. ${coachName}${nearMisses.length ? ` viu ${nearMissList(story.runnerUps.length, story.lostFinals.length)} aqui antes deste` : " esperou por isso"} e foi o último a sair do gramado.`,
    },
  };
}

/** "2 vices e 1 final perdida": the near misses, as a list; empty when there were none. */
function nearMissList(runnerUps: number, lostFinals: number): string {
  return [runnerUps ? plural(runnerUps, "vice", "vices") : "", lostFinals ? plural(lostFinals, "final perdida", "finais perdidas") : ""].filter(Boolean).join(" e ");
}

/** ", 2 vices e 1 final perdida com você": the near misses as the cause line says them. */
function nearMissWords(runnerUps: number, lostFinals: number): string {
  const list = nearMissList(runnerUps, lostFinals);
  return list ? `, ${list} com você` : "";
}

const CHAMPION_OF: Partial<Record<CompetitionKey, string>> = {
  "serie-a": "Campeão brasileiro",
  "copa-do-brasil": "Campeão da Copa do Brasil",
  libertadores: "Campeão da Libertadores",
  "sul-americana": "Campeão da Sul-Americana",
  recopa: "Campeão da Recopa",
  "club-world-cup": "Campeão do Super Mundial",
  "intercontinental-cup": "Campeão do Mundial de Clubes",
};

/** "Campeão brasileiro", "Campeão baiano", "Campeão da Libertadores": a title as the crowd sings it. */
function championOf(key: CompetitionKey, name: string): string {
  const known = CHAMPION_OF[key];
  if (known) return known;
  if (key.startsWith("state-")) return `Campeão ${name.toLowerCase()}`;
  if (/^serie-[b-d]$/.test(key)) return `Campeão da ${name}`;
  return `Campeão: ${name}`;
}

function tributeView(state: GameState, moment: Extract<Moment, { kind: "milestone" | "homecoming" | "idolRetired" }>): TributeView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const stadium = state.clubs[moment.clubId]?.stadium ?? club.name;
  const upper = coachName.split(" ")[0]?.toUpperCase() ?? coachName.toUpperCase();
  const common = { id: moment.id, when: dayOf(moment.date), club, coachName };
  if (moment.kind === "milestone") {
    const played = moment.games[0] + moment.games[1] + moment.games[2];
    const isYears = moment.milestone === "years";
    return {
      ...common,
      kind: "milestone",
      cause: `Marcas de 100, 250 e 500 jogos e de 10 anos no clube viram homenagem. ${isYears ? "Dez anos de casa" : `${moment.count} jogos`}, ${plural(moment.titles, "título", "títulos")}.`,
      headline: isYears ? `Dez anos de ${club.name}` : `${moment.count} jogos pelo ${club.name}`,
      story: `Antes do jogo, a diretoria entrou em campo com uma camisa emoldurada e o ${stadium} cantou seu nome.`,
      shirtName: upper,
      count: isYears ? 10 : moment.count,
      countLabel: isYears ? "anos" : "jogos",
      facts: [
        { value: String(moment.games[0]), label: "vitórias", isFoil: false },
        { value: String(moment.games[1]), label: "empates", isFoil: false },
        { value: String(moment.games[2]), label: "derrotas", isFoil: false },
        { value: String(moment.titles), label: moment.titles === 1 ? "título até aqui" : "títulos até aqui", isFoil: true },
      ],
      mosaic: `VALEU, ${upper}`,
      plaque: { name: coachName, text: `${played} jogos e ${plural(moment.titles, "título", "títulos")} pelo ${club.name}.`, signed: `${club.name} · ${formatGameDate(moment.date)}` },
      result: null,
      opponent: null,
      standing: moment.standing,
    };
  }
  if (moment.kind === "homecoming") {
    const opponent = clubTagOf(state, moment.opponentId);
    const years = yearsOf(moment.months);
    return {
      ...common,
      kind: "homecoming",
      cause: `Você saiu ídolo (${moment.standing}). Ex-clube onde você é ídolo homenageia na primeira visita da temporada.`,
      headline: `O ${stadium} aplaudiu o técnico do ${opponent.name}`,
      story: `Você entrou no ${stadium} pelo vestiário visitante. Antes do jogo, um minuto de aplausos e uma placa entregue no gramado.`,
      shirtName: upper,
      count: years,
      countLabel: years === 1 ? "ano" : "anos",
      facts: [
        { value: String(years), label: years === 1 ? "ano de casa" : "anos de casa", isFoil: false },
        { value: String(moment.titles), label: moment.titles === 1 ? "título" : "títulos", isFoil: true },
      ],
      mosaic: `VALEU, ${upper}`,
      plaque: { name: coachName, text: `${plural(years, "ano", "anos")} e ${plural(moment.titles, "título", "títulos")} de ${club.name}. Aqui você sempre joga em casa.`, signed: `${club.name} · ${formatGameDate(moment.date)}` },
      result: `${score(moment.goalsAgainst, moment.goalsFor)}`,
      opponent,
      standing: moment.standing,
    };
  }
  const upperPlayer = moment.name.split(" ").at(-1)?.toUpperCase() ?? moment.name.toUpperCase();
  return {
    ...common,
    kind: "idolRetired",
    cause: `${moment.name} chegou a ${moment.apps} jogos e ${moment.goals} gols pelo ${club.name}: ídolo do clube. Ídolo que para no seu elenco ganha homenagem.`,
    headline: `${moment.name} pendura as chuteiras`,
    story: `O último dia de ${moment.name} como jogador do ${club.name}. O ${stadium} se despede de um dos seus.`,
    shirtName: upperPlayer,
    count: moment.apps,
    countLabel: "jogos",
    facts: [
      { value: String(moment.apps), label: "jogos", isFoil: false },
      { value: String(moment.goals), label: "gols", isFoil: true },
    ],
    mosaic: `VALEU, ${upperPlayer}`,
    plaque: { name: moment.name, text: `${moment.apps} jogos e ${moment.goals} gols com a camisa do ${club.name}.`, signed: `${club.name} · ${formatGameDate(moment.date)}` },
    result: null,
    opponent: null,
    standing: meterOf(idolStandingOf(state, { name: state.coachName, record: state.history.coach }, moment.clubId)),
  };
}

function testimonialView(state: GameState, moment: Extract<Moment, { kind: "testimonial" }>): TestimonialView {
  const home = clubTagOf(state, moment.homeId);
  const away = clubTagOf(state, moment.awayId);
  const coachName = coachNameOf(state);
  const random = keyedStream(state.seed, `testimonial:${moment.id}`);
  const homeEleven = elevenOf(state, moment.homeId).filter((s) => s.id !== moment.playerId).slice(0, 10);
  const hero = { ...stickerOfPlayer(state, moment.playerId, moment.name, moment.homeId, `${home.name} · ${moment.apps} jogos`, true) };
  const awayEleven = elevenOf(state, moment.awayId);
  const scorers = (eleven: readonly MomentSticker[], goals: number, side: "home" | "away") =>
    Array.from({ length: goals }, (_, i) => {
      const isHero = side === "home" && i === 0;
      const scorer = isHero ? hero : (eleven[Math.floor(random() * eleven.length)] ?? hero);
      return { side, name: scorer.name, isHero };
    });
  const goals = [...scorers(homeEleven, moment.homeGoals, "home"), ...scorers(awayEleven, moment.awayGoals, "away")];
  const minutes = goals.map(() => 5 + Math.floor(random() * 80)).sort((a, b) => a - b);
  const events: TestimonialView["events"] = [
    { minute: 0, icon: "t-shirt", who: moment.name, text: "entra em campo com a braçadeira", side: null },
    ...goals.map((goal, i) => ({ minute: minutes[i] ?? 45, icon: "soccer-ball", who: goal.name, text: goal.isHero ? "faz o gol da despedida" : "marca", side: goal.side })),
    { minute: 88, icon: "users-four", who: moment.name, text: "sai de campo. Quatro minutos de aplauso", side: null },
    { minute: 90, icon: "flag-banner", who: null, text: "Fim. Volta no gramado com os dois times juntos", side: null },
  ].sort((a, b) => a.minute - b.minute);
  return {
    kind: "testimonial",
    id: moment.id,
    when: dayOf(moment.date),
    club: home,
    coachName,
    cause: `${moment.name}, ídolo com ${moment.apps} jogos, anunciou que para no fim da temporada. O clube marcou o jogo de despedida, e a renda foi para ele.`,
    playerName: moment.name,
    ticket: { date: formatGameDate(moment.date), matchup: `${home.name} × ${away.name}` },
    hero,
    headline: `A última de ${moment.name}`,
    story: `${moment.name} se despede contra o ${away.name}, o clube onde mais jogou antes. ${coachName} no banco do ${home.name}.`,
    stats: [
      { value: String(moment.apps), label: "jogos", isFoil: false },
      { value: String(moment.goals), label: "gols", isFoil: false },
      { value: "1", label: "despedida", isFoil: true },
    ],
    home: { club: home, eleven: [hero, ...homeEleven] },
    away: { club: away, eleven: awayEleven },
    events,
    score: [moment.homeGoals, moment.awayGoals],
    stadium: state.clubs[moment.homeId]?.stadium ?? home.name,
  };
}

function comeBackView(state: GameState, moment: Extract<Moment, { kind: "comeBack" }>): ComeBackView {
  const club = clubTagOf(state, moment.clubId);
  const coachName = coachNameOf(state);
  const offer = state.coach.offers.find((o) => o.clubId === moment.clubId);
  const crisis = moment.position && moment.tableSize ? Math.round((100 * moment.position) / moment.tableSize) : 50;
  // The engine's line: a club in the bottom third of its table is in crisis.
  const isInCrisis = !!moment.position && !!moment.tableSize && moment.position > (2 / 3) * moment.tableSize;
  const fanbase = state.clubs[moment.clubId]?.fanbase ?? 1_000_000;
  // The campaign's numbers are the game's own: posts in thousands grow with the fanbase and how much the fans want him.
  const posts = Math.max(1, Math.round((fanbase / 100_000) * (moment.standing / 100)));
  const banners = 1 + Math.floor(keyedStream(state.seed, `banners:${moment.id}`)() * 4);
  const record = state.history.coach;
  const lastStint = record.stints.findLast((s) => s.clubId === moment.clubId);
  const reunions = Object.values(state.players)
    .filter((player) => player.clubId === moment.clubId && (state.history.players[moment.clubId]?.[player.id]?.apps ?? 0) > 0 && lastStint && (record.album ?? []).some((page) => page.clubId === moment.clubId && page.stickers.some(([id]) => id === player.id)))
    .sort((a, b) => (state.history.players[moment.clubId]?.[b.id]?.apps ?? 0) - (state.history.players[moment.clubId]?.[a.id]?.apps ?? 0))
    .slice(0, 3)
    .map((player) => stickerOfPlayer(state, player.id, player.name, moment.clubId, `${state.history.players[moment.clubId]?.[player.id]?.apps ?? 0} jogos pelo clube`));
  const titles = record.trophies.filter((t) => t.clubId === moment.clubId).length;
  return {
    kind: "comeBack",
    id: moment.id,
    when: dayOf(moment.date),
    club,
    coachName,
    cause: `Você é ídolo do ${club.name} (${moment.standing}) e o clube abriu a vaga${moment.position ? ` em ${moment.position}º lugar` : ""}. ${isInCrisis ? "Em crise, ele procura você primeiro." : "A torcida pediu, e a diretoria ouviu."}`,
    masthead: `${formatGameDate(moment.date)}`,
    strap: [`${club.name} sem técnico`, moment.position && moment.tableSize ? `${moment.position}º de ${moment.tableSize} na tabela` : "vaga aberta"],
    deck: `A faixa apareceu de madrugada no muro do CT. ${moment.successor ? `${moment.successor} caiu, e` : "Com a vaga aberta,"} o nome de ${coachName} virou o pedido de quem foi ao treino.`,
    headline: `Volta, ${coachName.split(" ")[0] ?? coachName}`,
    banner: `VOLTA, ${(coachName.split(" ")[0] ?? coachName).toUpperCase()}`,
    side: [
      { headline: "Diretoria liga à tarde", body: "A proposta sai por escrito." },
      moment.ppg
        ? { headline: "Os números", body: `${moment.ppg.yours.toFixed(2).replace(".", ",")} pontos por jogo com ${coachName}, ${moment.ppg.theirs.toFixed(2).replace(".", ",")} com quem veio depois.` }
        : { headline: "Domingo tem mosaico", body: "As organizadas prometem a festa de volta." },
    ],
    campaign: [
      { value: `${posts} mil`, label: "posts pedindo a volta", countTo: posts },
      { value: String(banners), label: banners === 1 ? "faixa no CT" : "faixas no CT", countTo: null },
      { value: moment.position ? `${moment.position}º` : "–", label: "na tabela", countTo: null },
    ],
    standing: moment.standing,
    crisis,
    crisisNote: moment.position && moment.tableSize && moment.position > moment.tableSize - 4 ? "Na zona de rebaixamento." : "Longe da meta da diretoria.",
    offer: offer
      ? {
          terms: [
            ["Contrato", `até dez ${offer.untilSeason}`, `${offer.untilSeason - state.season + 1} ${offer.untilSeason - state.season + 1 === 1 ? "temporada" : "temporadas"}`],
            ["Salário", formatMoney(offer.salary), "por mês"],
            ["Títulos com você", String(titles), "no clube"],
          ],
          letter: `“A gente sabe como você saiu e sabe o que o time precisa. A torcida decidiu antes da diretoria.”`,
          until: `Responde até ${formatGameDate(offer.expiresOn)}. Sem resposta, o ${club.name} procura outro nome.`,
        }
      : null,
    reunions: reunions.length ? reunions : elevenOf(state, moment.clubId, 3),
    reunionsLabel: reunions.length ? "Quem você reencontra" : "Quem te espera no elenco",
  };
}

const AWARD_WORDS: Record<Extract<Moment, { kind: "playerAward" }>["award"], { name: string; plate: string; date: string }> = {
  bolaDeOuro: { name: "Bola de Ouro", plate: "Melhor jogador do Brasileirão", date: "Entregue na festa da Bola de Prata." },
  ballonDor: { name: "Melhor do mundo", plate: "Melhor jogador do mundo", date: "Na votação do fim do ano." },
  topScorer: { name: "Artilheiro", plate: "Artilheiro do Brasileirão", date: "No fim do campeonato." },
  worldCup: { name: "Convocado para a Copa", plate: "Convocado para a Copa do Mundo", date: "Na lista final." },
};

function playerAwardView(state: GameState, moment: Extract<Moment, { kind: "playerAward" }>): PlayerAwardView {
  const club = clubTagOf(state, moment.clubId);
  const words = AWARD_WORDS[moment.award];
  const [first, ...rest] = moment.players;
  const player = state.players[first?.playerId ?? ""];
  const caption = player ? `${club.name} · ${ROLE_WORDS[roleOf(player)]} · ${player.age} anos` : club.name;
  const all = [...(state.history.coach.moments?.past ?? []), ...(state.history.coach.moments?.queue ?? [])];
  const season = all
    .filter((m): m is Extract<Moment, { kind: "playerAward" }> => m.kind === "playerAward" && m.season === moment.season && m.players.some((p) => p.playerId === first?.playerId))
    .map((m) => ({ date: dayOf(m.date), title: AWARD_WORDS[m.award].name, detail: AWARD_WORDS[m.award].date, isNow: m.id === moment.id }));
  const mark = first ? state.history.players[moment.clubId]?.[first.playerId] : undefined;
  return {
    kind: "playerAward",
    id: moment.id,
    when: `${dayOf(moment.date)} · ${words.name}`,
    club,
    coachName: coachNameOf(state),
    cause: "Prêmio de jogador vira cena quando ele é do seu elenco, um de cada vez, no dia em que acontece.",
    award: words.name,
    plate: words.plate,
    player: stickerOfPlayer(state, first?.playerId ?? "", first?.name ?? "", moment.clubId, caption, true),
    others: rest.map((p) => stickerOfPlayer(state, p.playerId, p.name, moment.clubId, state.players[p.playerId] ? ROLE_WORDS[roleOf(state.players[p.playerId] as SimPlayer)] : "", false)),
    headline: moment.players.length > 1 ? `${moment.players.length} dos seus na Copa` : `O ano de ${first?.name.split(" ")[0] ?? ""}`,
    sub: moment.players.length > 1 ? moment.players.map((p) => p.name).join(", ") : `${words.plate}, ${moment.season}.`,
    stats: [
      ...(first && first.apps ? [{ value: String(first.apps), label: `jogos em ${moment.season}`, isFoil: false }] : []),
      ...(first && first.goals ? [{ value: String(first.goals), label: "gols", isFoil: false }] : []),
      ...(mark ? [{ value: String(mark.apps), label: `jogos pelo ${club.name}`, isFoil: false }] : []),
      { value: String(season.length), label: season.length === 1 ? "conquista no ano" : "conquistas no ano", isFoil: true },
    ],
    season,
    career: Object.entries(state.history.players)
      .flatMap(([clubId, players]) => {
        const at = first ? players[first.playerId] : undefined;
        return at ? [{ club: clubTagOf(state, clubId), apps: at.apps, goals: at.goals }] : [];
      })
      .sort((a, b) => b.apps - a.apps)
      .slice(0, 4),
  };
}

function retirementView(state: GameState, moment: Extract<Moment, { kind: "retirement" }>): RetirementView {
  const record = state.history.coach;
  const coachName = coachNameOf(state);
  const moments = record.moments;
  const games = Object.values(moments?.games ?? {}).reduce((sum, [w, d, l]) => sum + w + d + l, 0);
  const first = record.stints[0]?.from.slice(0, 4) ?? moment.date.slice(0, 4);
  const last = moment.date.slice(0, 4);
  const coach = { name: state.coachName, record };
  const eras = record.stints.map((stint) => {
    const club = clubTagOf(state, stint.clubId);
    const titles = record.trophies.filter((t) => t.clubId === stint.clubId && t.season >= Number(stint.from.slice(0, 4)) && t.season <= Number((stint.until ?? moment.date).slice(0, 4)));
    const tally: Tally = moments?.games[stint.clubId] ?? [0, 0, 0];
    const page = (record.album ?? []).filter((p) => p.clubId === stint.clubId).at(-1);
    // A spell the album never printed shows the club's most capped players in the game instead.
    const stickers = page
      ? page.stickers
          .slice()
          .sort((a, b) => b[3] - a[3])
          .slice(0, 15)
          .map(([id, name, , , , shine]) => stickerOfPlayer(state, id, name, stint.clubId, "", shine > 0))
      : Object.entries(state.history.players[stint.clubId] ?? {})
          .sort((a, b) => b[1].apps - a[1].apps)
          .slice(0, 15)
          .map(([id, mark]) => stickerOfPlayer(state, id, mark.name, stint.clubId, "", isIdolAt(state, id, stint.clubId)));
    const years = `${stint.from.slice(0, 4)}${stint.until && stint.until.slice(0, 4) !== stint.from.slice(0, 4) ? ` a ${stint.until.slice(0, 4)}` : ""}`;
    const how = stint.left === "fired" ? "Demitido" : stint.left === "resigned" ? "Pediu para sair" : stint.left === "retired" ? "A última parada" : "Saiu";
    return { club, name: club.name, years, line: `${plural(titles.length, "título", "títulos")}, ${tally[0] + tally[1] + tally[2]} jogos. ${how}.`, stickers };
  });
  const clubIds = [...new Set(record.stints.map((s) => s.clubId))];
  const idolClubs = clubIds.filter((id) => idolStandingOf(state, coach, id).points >= IDOL_LINE);
  const titleMoments = (moments?.past ?? []).filter((m): m is Extract<Moment, { kind: "title" }> => m.kind === "title");
  const longestDrought = Math.max(0, ...titleMoments.map((m) => m.season - m.story.droughtFrom));
  const toYear = (date: IsoDate) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) - 1) / 12 + Number(date.slice(8, 10)) / 365;
  const players = record.stints.flatMap((stint) =>
    Object.entries(state.history.players[stint.clubId] ?? {})
      .filter(([id]) => (record.album ?? []).some((page) => page.clubId === stint.clubId && page.stickers.some(([sid]) => sid === id)))
      .map(([id, mark]) => ({ id, mark, clubId: stint.clubId })),
  );
  const seen = new Set<string>();
  const fromAlbum = players
    .sort((a, b) => b.mark.apps - a.mark.apps)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, 9)
    .map((p) => stickerOfPlayer(state, p.id, p.mark.name, p.clubId, "", isIdolAt(state, p.id, p.clubId)));
  // A career too short for the album, or saved before it, fields the last club's regulars.
  const eleven = [...fromAlbum, ...elevenOf(state, moment.clubId, 9).filter((s) => !seen.has(s.id))].slice(0, 9);
  const random = keyedStream(state.seed, `farewell:${moment.id}`);
  const farewellScore: [number, number] = [2 + Math.floor(random() * 4), 2 + Math.floor(random() * 4)];
  const lastClub = clubTagOf(state, moment.clubId);
  const tributes = clubIds.map((id) => {
    const club = clubTagOf(state, id);
    const standing = idolStandingOf(state, coach, id).points;
    const tally = moments?.games[id] ?? [0, 0, 0];
    const text =
      standing >= IDOL_LINE
        ? `Mosaico na arquibancada: “Obrigado, ${coachName.split(" ")[0]}”. Camisa com os ${tally[0] + tally[1] + tally[2]} jogos pelo clube.`
        : standing >= IDOL_LINE / 2
          ? "Vídeo no telão com os melhores momentos e aplausos antes do jogo."
          : "Nota curta no site: “Obrigado e felicidades.”";
    return { club, text };
  });
  return {
    kind: "retirement",
    id: moment.id,
    when: `${dayOf(moment.date)} · sua última página`,
    club: lastClub,
    coachName,
    cause: `Você escolheu parar. ${plural(Number(last) - Number(first) + 1, "temporada", "temporadas")} e ídolo de ${plural(idolClubs.length, "clube", "clubes")}: a despedida com todos os ex-clubes.`,
    years: `${first} a ${last}`,
    span: `Técnico de ${first} a ${last}. ${plural(Number(last) - Number(first) + 1, "temporada", "temporadas")}, ${plural(clubIds.length, "clube", "clubes")}. Este é o álbum inteiro.`,
    eras,
    clubs: record.stints.map((stint) => {
      const club = clubTagOf(state, stint.clubId);
      const titles = record.trophies.filter((t) => t.clubId === stint.clubId).length;
      return { club, years: `${stint.from.slice(2, 4)}–${(stint.until ?? moment.date).slice(2, 4)}`, note: plural(titles, "título", "títulos"), isIdol: idolClubs.includes(stint.clubId) };
    }),
    numbers: [
      { value: games, label: "jogos", isFoil: false },
      { value: record.trophies.length, label: "títulos", isFoil: true },
      { value: idolClubs.length, label: idolClubs.length === 1 ? "clube onde você é ídolo" : "clubes onde você é ídolo", isFoil: true },
      longestDrought > 0 ? { value: longestDrought, label: "anos de fila quebrados, o maior", isFoil: false } : { value: Number(last) - Number(first) + 1, label: "temporadas", isFoil: false },
      { value: record.firings.length, label: record.firings.length === 1 ? "demissão" : "demissões", isFoil: false },
      { value: (moments?.past ?? []).filter((m) => m.kind === "playerAward").length, label: "prêmios dos seus jogadores", isFoil: false },
    ],
    titles: titlesLine(record.trophies) || "Nenhum título. O álbum guarda o resto.",
    strip: {
      from: Number(first),
      to: toYear(moment.date) + 0.3,
      bands: record.stints.map((stint) => ({ from: toYear(stint.from), to: toYear(stint.until ?? moment.date), club: clubTagOf(state, stint.clubId) })),
      titles: record.trophies.map((trophy) => toYear(titleMoments.find((m) => m.season === trophy.season && m.competition === trophy.competition && m.clubId === trophy.clubId)?.date ?? `${trophy.season}-12-01`)),
      idols: (moments?.past ?? []).filter((m) => m.kind === "idol").map((m) => toYear(m.date)),
      sackings: record.firings.map((f) => toYear(f.date)),
    },
    tributes: tributes.slice(-4),
    moreTributes: Math.max(0, tributes.length - 4),
    farewell: { eleven, score: farewellScore, note: eleven[0] ? `${eleven[0].name} abriu o placar. Você entrou aos 89'.` : "Você entrou aos 89'." },
    games,
    lastClub,
  };
}

/** A moment as its screen shows it, with names, numbers and words from the game as it stands. */
export function momentViewOf(state: GameState, moment: Moment): MomentView {
  switch (moment.kind) {
    case "idol":
      return idolView(state, moment);
    case "sacking":
      return sackingView(state, moment);
    case "sendOff":
      return sendOffView(state, moment);
    case "quietExit":
      return quietExitView(state, moment);
    case "title":
      return titleView(state, moment);
    case "milestone":
    case "homecoming":
    case "idolRetired":
      return tributeView(state, moment);
    case "testimonial":
      return testimonialView(state, moment);
    case "comeBack":
      return comeBackView(state, moment);
    case "playerAward":
      return playerAwardView(state, moment);
    case "retirement":
      return retirementView(state, moment);
  }
}

/** A seated coach's moment by id, waiting or shown; null when he has none such. */
export function momentById(state: GameState, id: string): Moment | null {
  const moments = state.history.coach.moments;
  return moments?.queue.find((m) => m.id === id) ?? moments?.past.find((m) => m.id === id) ?? null;
}
