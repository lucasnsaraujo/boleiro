import { agreeArticles, FEMININE_CLUB_IDS } from "@boleiro/data/articles";
import { keyedStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import { coachesByClub } from "../coach/aiCoaches.js";
import { isCoolingDown } from "../coach/coach.js";
import { asWaitingCoach, isHumanClub, swapSeat, waitingCoachesOf } from "../coach/humanCoaches.js";
import { boardConfidence, crowdPressure, isOnTheBrink } from "../coach/judgeCoaches.js";
import { jobOffer, OFFER_DAYS, type JobOffered } from "../coach/offerJobs.js";
import { addDays, daysBetween } from "../dates.js";
import { eventMemoryOf, type NewsItem } from "../events/eventMemory.js";
import { freeFriendlyDates, isFree, type Friendly } from "../friendlies/friendlies.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CoachStint } from "../history/history.js";
import { clubMood } from "../morale/clubMood.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { worldCupOf } from "../nations/fifaCalendar.js";
import { isIdolPlayerAt, idolClubsOf } from "../rivalries/idols.js";
import { derbyWinsOf } from "../rivalries/rivalryMemory.js";
import { humanKey } from "../coach/closeCoachSeason.js";
import { departureMomentId, type AwardKind, type CareerMoments, type Moment, type QuietHow, type Tally } from "./careerMoments.js";
import { IDOL_LINE, idolStandingOf, meterOf, type HumanCoach } from "./idolStanding.js";
import { celebrationSeconds, standingWithout, titleStoryOf } from "./titleStory.js";

// The moments draw their chances from a stream of their own per day and coach, so no match, event or market draw moves.
const MOMENTS_SALT = 0x3a7e1d;
// The sacking screen flips the coach's last nine results (design/mocks/moment-sacked-night.html) from the meters before them.
const PRESSURE_KEPT = 10;
// guess: the papers print an ultimatum once in a bad stretch, again only after six weeks; protests are counted once a month.
const ULTIMATUM_DAYS = 45;
const PROTEST_DAYS = 30;
// guess: a spell of two years with a title, or one that made him an idol, earns a send-off; anything less leaves quietly.
const SEND_OFF_MONTHS = 24;
// guess: the club pays tribute at its coach's 100th, 250th and 500th game, and after ten years.
const GAME_MILESTONES = [100, 250, 500] as const;
const YEARS_MILESTONE = 10;
const YEAR_DAYS = 365.25;
// guess: the papers compare a successor with the coach after ten league and cup games, once a season, for two seasons after he left.
const COMPARE_AFTER_GAMES = 10;
const COMPARE_SEASONS = 2;
const PPG_GAP = 0.25;
// guess: an idol's old club in crisis almost always calls him back when its job opens; one whose fans have been
// singing his name since he left, most times; otherwise more often than not.
const COME_BACK_CHANCE = 0.6;
const COME_BACK_CHANCE_MISSED = 0.8;
const COME_BACK_CHANCE_IN_CRISIS = 0.9;
// guess: a club in the bottom third of its table is in crisis.
const CRISIS_SHARE = 2 / 3;
// guess: a farewell match is booked at least a week ahead, on the season's first free date after that.
const FAREWELL_NOTICE_DAYS = 7;
// The World Cup squad is called up for the camp before the tournament (nationsDay's TOURNAMENT_CAMP_DAYS is 20).
const WORLD_CUP_CALL_DAYS = 40;
const NEWS_DAYS = 150;

const EMPTY_TALLY: Tally = [0, 0, 0];

/** The moments engine's memory for a record it has not seen before: what is already there counts as old news. */
export function openMoments(state: GameState, coach: HumanCoach): CareerMoments {
  const { record } = coach;
  return {
    queue: [],
    shownOn: null,
    past: [],
    seen: { closedStints: record.stints.filter((stint) => stint.until !== null).length, trophies: record.trophies.length },
    idolOf: idolClubsOf(state, coach),
    games: {},
    pressure: [],
    ultimatumOn: null,
    protestOn: null,
    milestones: [],
    compared: {},
    homecomings: {},
    farewells: {},
  };
}

const nameOf = (state: GameState, clubId: string) => state.clubs[clubId]?.shortName ?? clubId;
const coachNameIn = (state: GameState) => state.coachName || state.eggs?.coachName || "o técnico";
const monthsOf = (stint: CoachStint, today: IsoDate) => Math.max(0, Math.round(daysBetween(stint.from, stint.until ?? today) / 30.44));
const ppgOf = ([w, d, l]: Tally) => (w + d + l ? (3 * w + d) / (w + d + l) : 0);

function tallied(tally: Tally, goalsFor: number, goalsAgainst: number): Tally {
  const [w, d, l] = tally;
  return goalsFor > goalsAgainst ? [w + 1, d, l] : goalsFor === goalsAgainst ? [w, d + 1, l] : [w, d, l + 1];
}

/** The club's biggest derby rival in the game; null when it has none. */
function topRivalOf(state: GameState, clubId: string): string | null {
  return [...(rivalsOf(state.clubs).get(clubId) ?? [])][0] ?? null;
}

type Seat = { before: GameState; after: GameState; events: readonly DayEvent[]; today: IsoDate };

/** Everything one day added for one coach: the moments to queue, the papers' stories and the offers. */
type Found = { moments: Moment[]; news: NewsItem[]; offers: JobOffered[]; friendlies: Friendly[] };

/** A career story for the round's newspaper, its articles agreeing with the clubs said in the feminine. */
function storyIn(state: GameState) {
  const feminine = FEMININE_CLUB_IDS.flatMap((id) => (state.clubs[id] ? [{ name: state.clubs[id].shortName, article: "a" as const }] : []));
  return (today: IsoDate, clubIds: string[], headline: string, body: string): NewsItem => ({ date: today, kind: "career", clubIds, headline: agreeArticles(headline, feminine), body: agreeArticles(body, feminine) });
}

/** The coach's matches today at the club he ran: tallied per club, and the board's and fans' meters after each. */
function countMatches(seat: Seat, moments: CareerMoments): CareerMoments {
  const clubId = seat.before.coachClubId;
  if (!clubId) return moments;
  const played = seat.events.flatMap((event) => (event.type === "matchPlayed" && (event.fixture.homeId === clubId || event.fixture.awayId === clubId) ? [event.fixture] : []));
  if (!played.length) return moments;
  let games = moments.games[clubId] ?? EMPTY_TALLY;
  const pressure = [...moments.pressure];
  const stillThere = seat.after.coachClubId === clubId;
  for (const fixture of played) {
    if (!fixture.result) continue;
    const isHome = fixture.homeId === clubId;
    const goalsFor = isHome ? fixture.result.homeGoals : fixture.result.awayGoals;
    const goalsAgainst = isHome ? fixture.result.awayGoals : fixture.result.homeGoals;
    games = tallied(games, goalsFor, goalsAgainst);
    const last = pressure.at(-1);
    // A board that fired him today starts over at once; the meter he saw was past its firing line.
    const board = stillThere ? Math.round(100 * boardConfidence(seat.after.boards[clubId], crowdPressure(seat.after, clubId))) : Math.min(last?.board ?? 9, 9);
    pressure.push({ date: fixture.date, opponentId: isHome ? fixture.awayId : fixture.homeId, isHome, goalsFor, goalsAgainst, board, fans: Math.round(clubMood(seat.after, clubId).fans) });
  }
  return { ...moments, games: { ...moments.games, [clubId]: games }, pressure: pressure.slice(-PRESSURE_KEPT) };
}

/** The pressure the coach can see building before a sacking: the board's ultimatum in the papers, protests at the training ground. */
function watchPressure(seat: Seat, moments: CareerMoments, found: Found): CareerMoments {
  const story = storyIn(seat.after);
  const { after, today } = seat;
  const clubId = after.coachClubId;
  if (!clubId || clubId !== seat.before.coachClubId) return moments;
  let next = moments;
  if (isOnTheBrink(after, clubId) && (!next.ultimatumOn || daysBetween(next.ultimatumOn, today) > ULTIMATUM_DAYS)) {
    next = { ...next, ultimatumOn: today };
    const club = nameOf(after, clubId);
    found.news.push(story(today, [clubId], `Ultimato: o ${club} quer reação já`, `A diretoria do ${club} cobra ${coachNameIn(after)}. Mais uma derrota e a reunião é à noite.`));
  }
  const { supporters } = clubMood(after, clubId);
  if ((supporters === "protest" || supporters === "violence") && (!next.protestOn || daysBetween(next.protestOn, today) > PROTEST_DAYS)) next = { ...next, protestOn: today };
  return next;
}

/** The farewell the coach's departures earn: the night sacking, a send-off after a long and happy spell, or a quiet note. */
function leave(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const story = storyIn(seat.after);
  const { after, today } = seat;
  const { record } = coach;
  const closed = record.stints.filter((stint) => stint.until !== null);
  if (closed.length <= moments.seen.closedStints) return moments;
  for (const stint of closed.slice(moments.seen.closedStints)) {
    const clubId = stint.clubId;
    const standing = meterOf(idolStandingOf(after, coach, clubId));
    const games = moments.games[clubId] ?? EMPTY_TALLY;
    const months = monthsOf(stint, today);
    if (!stint.left) continue;
    const id = departureMomentId(stint.left, clubId, today);
    const rivalId = topRivalOf(after, clubId);
    const index = record.stints.indexOf(stint);
    const toClubId = record.stints[index + 1]?.clubId ?? null;
    const club = nameOf(after, clubId);
    const coachName = coachNameIn(after);
    if (stint.left === "fired") {
      const firing = record.firings.findLast((f) => f.clubId === clubId);
      found.moments.push({ id, kind: "sacking", date: today, clubId, position: firing?.position ?? 0, targetPosition: firing?.targetPosition ?? 0, run: moments.pressure, ultimatumOn: moments.ultimatumOn, protestOn: moments.protestOn, standing, games, months, rivalId });
      if (standing >= IDOL_LINE) found.news.push(story(today, [clubId], `Torcida do ${club} vai à sede contra a diretoria`, `Faixas pedem a volta de ${coachName}. “Ídolo não se demite de madrugada.”`));
      if (rivalId) found.news.push(story(today, [rivalId, clubId], `Torcida do ${nameOf(after, rivalId)} faz festa nas redes`, `A queda de ${coachName} no ${club} virou piada do outro lado.`));
    } else if (stint.left === "resigned" || stint.left === "moved" || stint.left === "contractEnded") {
      const titles = record.trophies.filter((t) => t.clubId === clubId && `${t.season}-12-31` >= stint.from && (!stint.until || `${t.season}-01-01` <= stint.until)).map((t) => t.competition);
      const isSendOff = stint.left !== "resigned" && months >= SEND_OFF_MONTHS && (titles.length > 0 || standing >= IDOL_LINE);
      if (isSendOff) {
        found.moments.push({ id, kind: "sendOff", date: today, clubId, months, games, titles, standing, derbyWins: derbyWinsOf(after, humanKey(coach.name), clubId), rivalId, toClubId });
        found.news.push(story(today, [clubId], `Obrigado, ${coachName}`, `O ${club} se despede de ${coachName} depois de ${Math.round(months / 12)} anos. Faixa, mosaico e volta olímpica.`));
      } else {
        const how: QuietHow = stint.left;
        found.moments.push({ id, kind: "quietExit", date: today, clubId, how, months, games, titles: titles.length, toClubId });
      }
    }
  }
  return { ...moments, seen: { ...moments.seen, closedStints: closed.length }, pressure: [], ultimatumOn: null, protestOn: null };
}

/** A title party for every trophy the coach won today, weighed by the story behind it. */
function celebrate(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const { after, today } = seat;
  const { trophies } = coach.record;
  if (trophies.length <= moments.seen.trophies) return moments;
  const won = trophies.slice(moments.seen.trophies);
  won.forEach((trophy, index) => {
    const before = standingWithout(after, coach, trophy.clubId, won.length - index);
    const story = titleStoryOf(after, { ...coach, record: { ...coach.record, trophies: trophies.slice(0, moments.seen.trophies + index + 1) } }, trophy.clubId, trophy.competition, trophy.season, before);
    found.moments.push({ id: `title:${trophy.competition}:${trophy.season}:${trophy.clubId}`, kind: "title", date: today, clubId: trophy.clubId, competition: trophy.competition, season: trophy.season, seconds: celebrationSeconds(story, trophy.season), story });
  });
  return { ...moments, seen: { ...moments.seen, trophies: trophies.length } };
}

/** "Você virou ídolo": the day the fans of the club he runs count him as one of their own. */
function crown(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const { after, today } = seat;
  const clubId = after.coachClubId;
  if (!clubId || moments.idolOf.includes(clubId)) return moments;
  const standing = idolStandingOf(after, coach, clubId);
  if (standing.points < IDOL_LINE) return moments;
  found.moments.push({ id: `idol:${clubId}:${today}`, kind: "idol", date: today, clubId, ledger: standing.ledger, standing: meterOf(standing) });
  return { ...moments, idolOf: [...moments.idolOf, clubId] };
}

/** The club's tributes to its coach: his 100th, 250th and 500th game in charge, and ten years at the club. */
function markMilestones(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const { after, today } = seat;
  const clubId = after.coachClubId;
  if (!clubId) return moments;
  const games = moments.games[clubId] ?? EMPTY_TALLY;
  const played = games[0] + games[1] + games[2];
  const days = coach.record.stints.filter((s) => s.clubId === clubId).reduce((sum, s) => sum + daysBetween(s.from, s.until ?? today), 0);
  const titles = coach.record.trophies.filter((t) => t.clubId === clubId).length;
  const standing = meterOf(idolStandingOf(after, coach, clubId));
  const due = [
    ...GAME_MILESTONES.filter((count) => played >= count).map((count) => ({ milestone: "games" as const, count })),
    ...(days >= YEARS_MILESTONE * YEAR_DAYS ? [{ milestone: "years" as const, count: YEARS_MILESTONE }] : []),
  ].filter(({ milestone, count }) => !moments.milestones.includes(`${milestone}:${clubId}:${count}`));
  if (!due.length) return moments;
  for (const { milestone, count } of due) found.moments.push({ id: `${milestone}:${clubId}:${count}`, kind: "milestone", date: today, clubId, milestone, count, games, titles, standing });
  return { ...moments, milestones: [...moments.milestones, ...due.map(({ milestone, count }) => `${milestone}:${clubId}:${count}`)] };
}

/** A former club where he is an idol applauds him when he comes back as the visitor, once a season. */
function homecoming(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const story = storyIn(seat.after);
  const { before, after, today } = seat;
  const clubId = before.coachClubId;
  if (!clubId) return moments;
  const formerClubs = new Set(coach.record.stints.filter((s) => s.until !== null).map((s) => s.clubId));
  let next = moments;
  for (const event of seat.events) {
    if (event.type !== "matchPlayed" || event.fixture.awayId !== clubId || !event.fixture.result) continue;
    const hostId = event.fixture.homeId;
    if (hostId === clubId || !formerClubs.has(hostId) || next.homecomings[hostId] === after.season) continue;
    const standing = idolStandingOf(after, coach, hostId);
    if (standing.points < IDOL_LINE) continue;
    const months = coach.record.stints.filter((s) => s.clubId === hostId).reduce((sum, s) => sum + monthsOf(s, today), 0);
    const titles = coach.record.trophies.filter((t) => t.clubId === hostId).length;
    found.moments.push({ id: `homecoming:${hostId}:${today}`, kind: "homecoming", date: today, clubId: hostId, opponentId: clubId, goalsFor: event.fixture.result.awayGoals, goalsAgainst: event.fixture.result.homeGoals, months, titles, standing: meterOf(standing) });
    found.news.push(story(today, [hostId, clubId], `Um minuto de aplausos para ${coachNameIn(after)}`, `A torcida do ${nameOf(after, hostId)} recebeu o ex-técnico de pé, com mosaico e placa.`));
    next = { ...next, homecomings: { ...next.homecomings, [hostId]: after.season } };
  }
  return next;
}

/** The club that knew the player best besides his own: where he played most games, free on the day. */
function farewellOpponent(state: GameState, playerId: string, clubId: string, date: IsoDate): string | null {
  const clubs = Object.entries(state.history.players)
    .flatMap(([id, players]) => (id !== clubId && players[playerId] ? [[id, players[playerId].apps] as const] : []))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return clubs.find(([id]) => state.clubs[id] && state.finances[id] && isFree(state, id, date))?.[0] ?? null;
}

/** An idol of the coach's club who retires: the tribute on the day he goes, and the farewell match booked when he announces it. */
function honourIdols(seat: Seat, moments: CareerMoments, found: Found): CareerMoments {
  const story = storyIn(seat.after);
  const { before, after, today } = seat;
  let next = moments;
  for (const event of seat.events) {
    if (event.type === "playerRetired" && event.clubId === before.coachClubId && isIdolPlayerAt(before, event.playerId, event.clubId)) {
      const mark = before.history.players[event.clubId]?.[event.playerId];
      found.moments.push({ id: `idolRetired:${event.playerId}`, kind: "idolRetired", date: today, clubId: event.clubId, playerId: event.playerId, name: event.name, apps: mark?.apps ?? 0, goals: mark?.goals ?? 0 });
    }
    if (event.type === "playerWantsToRetire" && event.clubId === after.coachClubId && !next.farewells[event.playerId] && isIdolPlayerAt(after, event.playerId, event.clubId)) {
      const date = freeFriendlyDates(after).find((free) => free >= addDays(today, FAREWELL_NOTICE_DAYS));
      const opponentId = date ? farewellOpponent(after, event.playerId, event.clubId, date) : null;
      if (!date || !opponentId) continue;
      const friendly: Friendly = { id: `farewell-${event.playerId}`, date, homeId: event.clubId, awayId: opponentId, fee: 0, result: null, farewellOf: { playerId: event.playerId, name: event.name } };
      found.friendlies.push(friendly);
      found.news.push(story(today, [event.clubId, opponentId], `Jogo de despedida de ${event.name} marcado`, `${nameOf(after, event.clubId)} e ${nameOf(after, opponentId)} jogam em ${date.slice(8, 10)}/${date.slice(5, 7)}. A renda vai para o ídolo.`));
      next = { ...next, farewells: { ...next.farewells, [event.playerId]: friendly.id } };
    }
    if (event.type === "friendlyPlayed" && event.friendly.farewellOf && Object.values(next.farewells).includes(event.friendly.id) && event.friendly.result) {
      const { playerId, name } = event.friendly.farewellOf;
      const mark = after.history.players[event.friendly.homeId]?.[playerId];
      const { homeGoals, awayGoals } = event.friendly.result;
      found.moments.push({ id: `testimonial:${playerId}`, kind: "testimonial", date: today, clubId: event.friendly.homeId, playerId, name, homeId: event.friendly.homeId, awayId: event.friendly.awayId, homeGoals, awayGoals, apps: mark?.apps ?? 0, goals: mark?.goals ?? 0 });
    }
  }
  return next;
}

/** The club's results under its current coach this season, from `since`: games and points. */
function resultsSince(state: GameState, clubId: string, since: IsoDate): Tally {
  let tally: Tally = EMPTY_TALLY;
  for (const fixture of state.fixtures) {
    if (!fixture.result || fixture.date < since || (fixture.homeId !== clubId && fixture.awayId !== clubId)) continue;
    const isHome = fixture.homeId === clubId;
    tally = tallied(tally, isHome ? fixture.result.homeGoals : fixture.result.awayGoals, isHome ? fixture.result.awayGoals : fixture.result.homeGoals);
  }
  return tally;
}

/** The story going on at the clubs he left: the papers set his successor's points per game beside his. */
function compareSuccessors(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): CareerMoments {
  const story = storyIn(seat.after);
  const { after, today } = seat;
  const playedToday = new Set(seat.events.flatMap((event) => (event.type === "matchPlayed" ? [event.fixture.homeId, event.fixture.awayId] : [])));
  let next = moments;
  for (const stint of coach.record.stints) {
    const clubId = stint.clubId;
    if (!stint.until || !playedToday.has(clubId) || clubId === after.coachClubId || isHumanClub(after, clubId) || next.compared[clubId] === after.season) continue;
    if (Number(stint.until.slice(0, 4)) < after.season - COMPARE_SEASONS || coach.record.stints.findLast((s) => s.clubId === clubId) !== stint) continue;
    const successor = after.coaches ? coachesByClub(after.coaches).get(clubId) : undefined;
    const since = successor?.stints.at(-1)?.from;
    const yours = next.games[clubId];
    if (!successor || !since || since < stint.until || !yours || yours[0] + yours[1] + yours[2] < COMPARE_AFTER_GAMES) continue;
    const theirs = resultsSince(after, clubId, since);
    if (theirs[0] + theirs[1] + theirs[2] < COMPARE_AFTER_GAMES) continue;
    const [mine, his] = [ppgOf(yours), ppgOf(theirs)];
    const club = nameOf(after, clubId);
    const coachName = coachNameIn(after);
    const numbers = `${mine.toFixed(2).replace(".", ",")} pontos por jogo com ${coachName}, ${his.toFixed(2).replace(".", ",")} com ${successor.name}.`;
    const isMissed = his < mine - PPG_GAP;
    if (isMissed) found.news.push(story(today, [clubId], `“Com ${coachName} era diferente”`, `A torcida do ${club} canta o nome do ex-técnico. ${numbers}`));
    else if (his > mine + PPG_GAP) found.news.push(story(today, [clubId], `${successor.name} faz o ${club} esquecer ${coachName}`, numbers));
    else continue;
    next = { ...next, compared: { ...next.compared, [clubId]: after.season }, ...(isMissed ? { missed: { ...next.missed, [clubId]: after.season } } : {}) };
  }
  return next;
}

/** A former club that has him as an idol calls him back when its job opens, more surely when it is in crisis. */
function callBack(seat: Seat, coach: HumanCoach, moments: CareerMoments, found: Found): void {
  const story = storyIn(seat.after);
  const { before, after, today } = seat;
  const opened = after.coaches?.openJobs ?? {};
  if (after.coach.retiredOn) return;
  for (const clubId of moments.idolOf) {
    if (opened[clubId] !== today || before.coaches?.openJobs[clubId] === today || clubId === after.coachClubId || isHumanClub(after, clubId)) continue;
    if (isCoolingDown(after.coach, clubId, after.season) || !(clubId in after.boards)) continue;
    const standing = idolStandingOf(after, coach, clubId);
    if (standing.points < IDOL_LINE) continue;
    const board = after.boards[clubId];
    const isInCrisis = !!board && board.position > CRISIS_SHARE * board.tableSize;
    const isMissed = (moments.missed?.[clubId] ?? -Infinity) >= after.season - 1;
    const roll = keyedStream(after.seed ^ MOMENTS_SALT, `comeBack:${humanKey(coach.name)}:${clubId}:${today}`)();
    if (roll >= (isInCrisis ? COME_BACK_CHANCE_IN_CRISIS : isMissed ? COME_BACK_CHANCE_MISSED : COME_BACK_CHANCE)) continue;
    const yours = moments.games[clubId];
    const fired = before.coaches ? coachesByClub(before.coaches).get(clubId) : undefined;
    const since = fired?.stints.at(-1)?.from;
    const theirs = since ? resultsSince(before, clubId, since) : null;
    found.moments.push({
      id: `comeBack:${clubId}:${today}`,
      kind: "comeBack",
      date: today,
      clubId,
      standing: meterOf(standing),
      position: board?.position ?? null,
      tableSize: board?.tableSize ?? null,
      successor: fired?.name ?? null,
      ppg: yours && theirs ? { yours: ppgOf(yours), theirs: ppgOf(theirs) } : null,
    });
    found.news.push(story(today, [clubId], `Volta, ${coachNameIn(after)}`, `A torcida do ${nameOf(after, clubId)} faz campanha nas redes e na porta da sede pela volta do ex-técnico.`));
    // The offer lapses the day the club would hire anyway, so the AI coaches' market keeps its own days.
    if (!after.coach.offers.some((offer) => offer.clubId === clubId)) found.offers.push({ type: "jobOffered", offer: { ...jobOffer(after, clubId), expiresOn: addDays(today, OFFER_DAYS), isComeBack: true } });
  }
}

/** The coach's players' achievements: the season's awards on the night they are given, the World Cup squad when it is called. */
function applaudPlayers(seat: Seat, found: Found): void {
  const { before, after, today } = seat;
  const clubId = before.coachClubId;
  if (!clubId) return;
  const add = (award: AwardKind, players: { playerId: string; name: string; apps: number; goals: number }[], season: number) => {
    if (players.length) found.moments.push({ id: `${award}:${season}:${players.map((p) => p.playerId).join("+")}`, kind: "playerAward", date: today, clubId, award, players, season });
  };
  for (const event of seat.events) {
    if (event.type !== "seasonAwarded") continue;
    const { bolaDeOuro, ballonDor, topScorer } = event.awards;
    if (bolaDeOuro?.clubId === clubId) add("bolaDeOuro", [{ playerId: bolaDeOuro.playerId, name: bolaDeOuro.name, apps: bolaDeOuro.apps, goals: bolaDeOuro.goals }], event.season);
    const best = ballonDor[0];
    if (best?.clubId === clubId) add("ballonDor", [{ playerId: best.playerId, name: best.name, apps: best.apps ?? 0, goals: best.goals ?? 0 }], event.season);
    if (topScorer?.clubId === clubId) add("topScorer", [{ playerId: topScorer.playerId, name: topScorer.name, apps: 0, goals: topScorer.goals }], event.season);
  }
  const worldCup = worldCupOf(after.season);
  if (!worldCup || today < addDays(worldCup.from, -WORLD_CUP_CALL_DAYS) || today > worldCup.until) return;
  const called = seat.events.flatMap((event) => (event.type === "calledUp" && event.clubId === clubId && after.players[event.playerId] ? [event.playerId] : []));
  const players = [...new Set(called)].map((playerId) => ({ playerId, name: after.players[playerId]?.name ?? playerId, apps: 0, goals: 0 }));
  add("worldCup", players, after.season);
}

/** One coach's moments of the day (the one in the seat of `seat.after`), into his record; and the offers and friendlies they bring. */
function seatMoments(seat: Seat): { state: GameState; offers: JobOffered[] } {
  const { after, before } = seat;
  if (after.coach.retiredOn && before.coach.retiredOn) return { state: after, offers: [] };
  const coach: HumanCoach = { name: after.coachName, record: after.history.coach };
  const opened = after.history.coach.moments ?? openMoments(before, { name: before.coachName, record: before.history.coach });
  const found: Found = { moments: [], news: [], offers: [], friendlies: [] };
  let moments = countMatches(seat, opened);
  moments = watchPressure(seat, moments, found);
  moments = leave(seat, coach, moments, found);
  moments = celebrate(seat, coach, moments, found);
  moments = crown(seat, coach, moments, found);
  moments = markMilestones(seat, coach, moments, found);
  moments = homecoming(seat, coach, moments, found);
  moments = honourIdols(seat, moments, found);
  moments = compareSuccessors(seat, coach, moments, found);
  callBack(seat, coach, moments, found);
  applaudPlayers(seat, found);
  if (found.moments.length) moments = { ...moments, queue: [...moments.queue, ...found.moments] };
  let state: GameState = { ...after, history: { ...after.history, coach: { ...after.history.coach, moments } } };
  if (found.news.length) {
    const memory = eventMemoryOf(state);
    const oldest = addDays(seat.today, -NEWS_DAYS);
    state = { ...state, eventMemory: { ...memory, news: [...memory.news.filter((item) => item.date >= oldest), ...found.news] } };
  }
  if (found.offers.length) state = { ...state, coach: { ...state.coach, offers: [...state.coach.offers, ...found.offers.map((event) => event.offer)] } };
  if (found.friendlies.length) state = { ...state, friendlies: [...(state.friendlies ?? []), ...found.friendlies] };
  return { state, offers: found.offers };
}

/**
 * The career moments of the day played from `before` to `after`, for every human coach: the seated one's,
 * then each waiting coach's into his own record. Reads the game and the day's events; draws only from its
 * own streams, so no match, event or market result moves. The come-back offers it makes come back as the
 * day's job offers, in `events` and each waiting coach's `waitingEvents`.
 */
export function runMoments(after: GameState, before: GameState, events: readonly DayEvent[]): { state: GameState; events: JobOffered[]; waitingEvents: JobOffered[][] } {
  const today = before.date;
  const seated = seatMoments({ before, after, events, today });
  let state = seated.state;
  const waitingEvents: JobOffered[][] = [];
  for (let index = 0; index < waitingCoachesOf(state).length; index++) {
    const own = asWaitingCoach(state, index, (seat) => {
      const done = seatMoments({ before: swapSeatOf(before, index), after: seat, events, today });
      return { state: done.state, offers: done.offers };
    });
    state = own.state;
    waitingEvents.push(own.offers);
  }
  return { state, events: seated.offers, waitingEvents };
}

/** `before` with the waiting coach at `index` in the seat, when the day began with him waiting there. */
function swapSeatOf(before: GameState, index: number): GameState {
  return index < waitingCoachesOf(before).length ? swapSeat(before, index) : before;
}
