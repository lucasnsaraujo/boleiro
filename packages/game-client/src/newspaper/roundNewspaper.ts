import { eventMemoryOf, type NewsItem, type NewsKind } from "@boleiro/engine/sim/events/eventMemory";
import type { Fixture, GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { standings } from "@boleiro/engine/sim/standings";
import { competitionName, fixtureLabel } from "../format/competitionName.js";

export type NewspaperState = Pick<GameState, "coachClubId" | "clubs" | "fixtures" | "competitions" | "eventMemory">;

/** One story of an edition with the word over its headline ("Zebra", "Mercado"). */
export type Story = NewsItem & { kicker: string };

export type ResultLine = { homeId: string; awayId: string; homeGoals: number; awayGoals: number };

/** The round's newspaper on one day: its lead, the side stories, the round's results and the top of the table. */
export type Edition = {
  date: IsoDate;
  /** "31ª rodada", or the competition when it isn't a round robin. */
  round: string;
  lead: Story | null;
  /** The coach's match the lead is about, with its result. */
  match: Fixture | null;
  side: Story[];
  results: { title: string; lines: ResultLine[] };
  table: { clubId: string; points: number; goalDifference: number }[];
};

/** An edition in the archive list: its day, what it was about and its lead's headline. */
export type EditionTitle = { date: IsoDate; label: string; headline: string };

const KICKERS: Record<NewsKind, string> = { match: "", event: "Bastidores", signing: "Mercado", sacking: "Técnico", upset: "Zebra", rivalry: "Rivalidade" };
// The paper's side column fits five stories at 1280x800 (mock design/mocks/newspaper.html).
const SIDE_STORIES = 5;
// The results row holds the round's ten games of a 20-club league.
const RESULTS = 10;
// The coach's own news first, then the beats in the mock's order.
const SIDE_ORDER: readonly NewsKind[] = ["upset", "sacking", "signing", "rivalry", "event"];

const isAbout = (item: NewsItem, clubId: string | null) => clubId !== null && item.clubIds.includes(clubId);

function coachMatchOn(state: NewspaperState, date: IsoDate): Fixture | null {
  const { coachClubId } = state;
  return state.fixtures.find((f) => f.date === date && f.result && (f.homeId === coachClubId || f.awayId === coachClubId)) ?? null;
}

/** The days the paper printed an edition, newest first: the coach's match days, or every day with news for a coach without a club. */
function editionDates(state: NewspaperState): IsoDate[] {
  const news = eventMemoryOf(state).news;
  const own = news.filter((item) => item.kind === "match" && isAbout(item, state.coachClubId));
  return [...new Set((own.length ? own : news).map((item) => item.date))].sort().reverse();
}

function storyOf(state: NewspaperState, item: NewsItem): Story {
  if (item.kind !== "match") return { ...item, kicker: KICKERS[item.kind] };
  const match = state.fixtures.find((f) => f.date === item.date && f.homeId === item.clubIds[0] && f.awayId === item.clubIds[1]);
  const competition = match && state.competitions[match.competitionId];
  return { ...item, kicker: competition ? fixtureLabel(competition, match) : "Jogo" };
}

/** The archive of editions, newest first. */
export function newspaperEditions(state: NewspaperState): EditionTitle[] {
  return editionDates(state).map((date) => {
    const edition = newspaperOf(state, date);
    return { date, label: edition?.round ?? "", headline: edition?.lead?.headline ?? "" };
  });
}

/**
 * The edition of `date`, the latest one when left out: the coach's match as the lead, the stories since
 * the edition before (his own news first), the results of his competition that day and the top of its table.
 * Null before the paper has printed anything.
 */
export function newspaperOf(state: NewspaperState, date?: IsoDate): Edition | null {
  const dates = editionDates(state);
  const day = date ?? dates[0];
  if (!day) return null;
  const previous = dates.find((other) => other < day) ?? "";
  const window = eventMemoryOf(state).news.filter((item) => item.date > previous && item.date <= day);
  const match = coachMatchOn(state, day);
  const leadItem = window.find((item) => item.kind === "match" && item.date === day && isAbout(item, state.coachClubId)) ?? window.findLast((item) => item.kind !== "match") ?? null;
  const rest = window.filter((item) => item !== leadItem && !(item.kind === "match" && !isAbout(item, state.coachClubId)));
  const rank = (item: NewsItem) => (isAbout(item, state.coachClubId) && item.kind !== "match" ? -1 : SIDE_ORDER.indexOf(item.kind));
  const side = [...rest].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date)).slice(0, SIDE_STORIES);
  const competition = match ? state.competitions[match.competitionId] : undefined;
  const sameRound = match ? state.fixtures.filter((f) => f.competitionId === match.competitionId && f.date === day && f.result) : [];
  const lines = sameRound.flatMap((f) => (f.result ? [{ homeId: f.homeId, awayId: f.awayId, homeGoals: f.result.homeGoals, awayGoals: f.result.awayGoals }] : []));
  const ownFirst = [...lines].sort((a, b) => Number(b.homeId === state.coachClubId || b.awayId === state.coachClubId) - Number(a.homeId === state.coachClubId || a.awayId === state.coachClubId));
  return {
    date: day,
    round: match && competition ? (fixtureLabel(competition, match).split(" · ")[1] ?? competitionName(competition)) : "",
    lead: leadItem && storyOf(state, leadItem),
    match,
    side: side.map((item) => storyOf(state, item)),
    results: { title: competition ? competitionName(competition) : "", lines: ownFirst.slice(0, RESULTS) },
    table: match ? tableTop(state, match) : [],
  };
}

/** The first four of the coach's league group after the edition's day, when the match was a league's. */
function tableTop(state: NewspaperState, match: Fixture): Edition["table"] {
  const competition = state.competitions[match.competitionId];
  const stage = competition?.stages[match.stage];
  if (competition?.kind !== "league" || stage?.kind !== "groups") return [];
  const group = stage.groups.find((clubs) => clubs.includes(match.homeId));
  if (!group) return [];
  const played = state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === match.stage && f.result && f.date <= match.date);
  return standings(group, played, competition.drawOrder)
    .slice(0, 4)
    .map((row) => ({ clubId: row.clubId, points: row.points, goalDifference: row.goalDifference }));
}
