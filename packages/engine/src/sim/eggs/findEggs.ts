import { keyedStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import { addDays } from "../dates.js";
import { eventMemoryOf, type NewsItem } from "../events/eventMemory.js";
import { fillSlots } from "../events/fillSlots.js";
import type { Fixture, GameState, IsoDate, MatchResult } from "../gameState.js";
import type { CoachRecord } from "../history/history.js";
import type { LiveMatch } from "../live/liveDay.js";
import { eggBookOf, eggsOfMatch, type EggFind, type EggFound } from "./eggBook.js";
import { EGG_BANK } from "./eggBank.js";
import type { EggHit, EggLook, EggRarity, EggType, MatchEgg, MatchTale } from "./eggType.js";
import { matchTaleOf } from "./matchTale.js";

// Eggs draw from streams of their own per day, club and egg, so finding one never moves another draw of the game.
const EGG_SALT = 0xe995;
// guess: the newspaper's archive keeps about five months of stories, as runEvents does.
const NEWS_DAYS = 150;

type Human = { name: string; clubId: string; record: CoachRecord };

/** Every human coach with a club: his name (empty when the game doesn't know it), his club and his career. */
function humansOf(state: GameState): Human[] {
  const seated = { name: state.coachName || eggBookOf(state).coachName || "", clubId: state.coachClubId, record: state.history.coach };
  const waiting = waitingCoachesOf(state).map((coach) => ({ name: coach.name, clubId: coach.clubId, record: coach.record }));
  return [seated, ...waiting].filter((human): human is Human => human.clubId !== null);
}

type Found = { egg: EggType; hit: EggHit; fixture?: Fixture & { result: MatchResult } };
type Played = Fixture & { result: MatchResult };

/** A match egg's hits a human coach's club finds: those about the club itself, not about the opponent it played. */
const humanHitsOf = (egg: MatchEgg, tale: MatchTale, humanIds: ReadonlySet<string>): EggHit[] => egg.find(tale).filter((hit) => humanIds.has(hit.clubId));

/** The names a find's texts take: its club, the opponent, the club's coach, the score and goals of its match, and the egg's own. */
function slotsOf(state: GameState, hit: EggHit, fixture: Played | undefined, humans: readonly Human[]): Record<string, string> {
  const clubName = (clubId: string) => state.clubs[clubId]?.shortName ?? clubId;
  const opponentId = fixture ? (fixture.homeId === hit.clubId ? fixture.awayId : fixture.homeId) : "";
  return {
    club: clubName(hit.clubId),
    opponent: opponentId ? clubName(opponentId) : "",
    coach: humans.find((human) => human.clubId === hit.clubId)?.name || "o técnico",
    score: fixture ? `${clubName(fixture.homeId)} ${fixture.result.homeGoals} × ${fixture.result.awayGoals} ${clubName(fixture.awayId)}` : "",
    goals: fixture ? String(fixture.result.homeGoals + fixture.result.awayGoals) : "",
    ...hit.slots,
  };
}

/** The game with the day's finds written down: the book, the newspaper, and the kids named after coaches. */
function record(state: GameState, date: IsoDate, finds: readonly Found[], humans: readonly Human[]): { state: GameState; events: EggFound[] } {
  const book = eggBookOf(state);
  const log = [...book.log];
  const stories: NewsItem[] = [];
  const events: EggFound[] = [];
  let prospects = state.youth?.prospects;
  for (const { egg, hit, fixture } of finds) {
    const isKnown = log.some((find) => find.eggId === egg.id && find.clubId === hit.clubId && (egg.once === "club" || (egg.once === "player" && find.playerId === hit.playerId)));
    if (isKnown) continue;
    const opponentId = fixture ? (fixture.homeId === hit.clubId ? fixture.awayId : fixture.homeId) : "";
    const slots = slotsOf(state, hit, fixture, humans);
    const random = keyedStream(state.seed ^ EGG_SALT, `${date}:${egg.id}:${fixture?.id ?? hit.clubId}:text`);
    const text = egg.texts[Math.floor(random() * egg.texts.length)] ?? egg.texts[0];
    if (!text) throw new Error(`egg ${egg.id} has no text`);
    const headline = fillSlots(text.headline, slots);
    const body = fillSlots(text.body, slots);
    stories.push({ date, kind: "egg", clubIds: [hit.clubId, ...(opponentId ? [opponentId] : [])], headline, body });
    const find: EggFind = { eggId: egg.id, date, clubId: hit.clubId, ...(fixture ? { fixtureId: fixture.id } : {}), ...(hit.playerId ? { playerId: hit.playerId } : {}), headline };
    log.push(find);
    events.push({ type: "eggFound", eggId: egg.id, clubId: hit.clubId, title: egg.title, look: egg.look, headline, body });
    for (const { prospectId, name } of hit.rename ?? []) {
      const kid = prospects?.[prospectId];
      if (kid && prospects) prospects = { ...prospects, [prospectId]: { ...kid, name } };
    }
  }
  if (!events.length) return { state, events };
  const memory = eventMemoryOf(state);
  const oldest = addDays(date, -NEWS_DAYS);
  const youth = state.youth && prospects !== state.youth.prospects && prospects ? { youth: { ...state.youth, prospects } } : {};
  return {
    state: { ...state, ...youth, eggs: { ...book, log }, eventMemory: { ...memory, news: [...memory.news.filter((item) => item.date >= oldest), ...stories] } },
    events,
  };
}

/** An egg a match laid, as its page tapes it beside the match. */
export type EggNote = { eggId: string; title: string; rarity: EggRarity; look: EggLook; text: string };

/**
 * The eggs of a played match for its page: those its real story lays about a human coach's club (its
 * timeline and play, read against `history` as it stood before the match), then any other the book wrote
 * down for it. A match told again from its seed (`story` null) has scorers drawn anew, so only the book
 * speaks for it.
 */
export function matchEggNotes(state: GameState, history: GameState["history"], fixture: Played, story: Parameters<typeof matchTaleOf>[3] | null, bank: readonly EggType[] = EGG_BANK): EggNote[] {
  const humans = humansOf(state);
  const humanIds = new Set(humans.map((human) => human.clubId));
  const isHumans = humanIds.has(fixture.homeId) || humanIds.has(fixture.awayId);
  const tale: MatchTale | null = story && isHumans ? matchTaleOf(state, history, fixture, story, humans.map((human) => human.name).filter(Boolean)) : null;
  const notes: EggNote[] = [];
  for (const egg of bank) {
    const hit = tale && egg.on === "match" ? humanHitsOf(egg, tale, humanIds)[0] : undefined;
    if (egg.on === "match" && hit) notes.push({ eggId: egg.id, title: egg.title, rarity: egg.rarity, look: egg.look, text: fillSlots(egg.note, slotsOf(state, hit, fixture, humans)) });
  }
  for (const find of eggsOfMatch(state, fixture.id)) {
    const egg = bank.find((type) => type.id === find.eggId);
    if (egg && !notes.some((note) => note.eggId === egg.id)) notes.push({ eggId: egg.id, title: egg.title, rarity: egg.rarity, look: egg.look, text: find.headline });
  }
  return notes;
}

/**
 * The game after the coach in the seat found a coach egg on the screen; a coach egg goes into the
 * book once a career, without a newspaper story. Null without a club to find it for, or found before.
 */
export function findCoachEgg(state: GameState, eggId: string, bank: readonly EggType[] = EGG_BANK): { state: GameState; event: EggFound | null } {
  const egg = bank.find((type) => type.id === eggId);
  if (egg?.on !== "coach") throw new Error(`no coach egg ${eggId}`);
  const clubId = state.coachClubId;
  const book = eggBookOf(state);
  const [text] = egg.texts;
  if (!clubId || !text || book.log.some((find) => find.eggId === eggId)) return { state, event: null };
  const find: EggFind = { eggId, date: state.date, clubId, headline: text.headline };
  return {
    state: { ...state, eggs: { ...book, log: [...book.log, find] } },
    event: { type: "eggFound", eggId, clubId, title: egg.title, look: egg.look, headline: text.headline, body: text.body },
  };
}

/**
 * The eggs of day `date`, looked for on the game after it (`before` is the game as the day began): each
 * human coach's matches, told from the day's live matches, and the day's calendar, academy and season
 * for each human coach's club. A club finds only the eggs about itself. A find goes into the egg book,
 * the newspaper and the day's events; nothing a match or the season plays on changes.
 */
export function findEggs(state: GameState, before: GameState, date: IsoDate, events: readonly DayEvent[], matches: readonly LiveMatch[], bank: readonly EggType[] = EGG_BANK): { state: GameState; events: EggFound[] } {
  const humans = humansOf(state);
  if (!humans.length) return { state, events: [] };
  const humanIds = new Set(humans.map((human) => human.clubId));
  const coachNames = humans.map((human) => human.name).filter(Boolean);
  const played = events.flatMap((event) => (event.type === "matchPlayed" ? [event.fixture] : []));
  const finds: Found[] = [];
  for (const fixture of played) {
    const { result } = fixture;
    const match = matches.find((m) => m.fixtureId === fixture.id);
    if (!result || !match || (!humanIds.has(fixture.homeId) && !humanIds.has(fixture.awayId))) continue;
    const tale = matchTaleOf(state, before.history, { ...fixture, result }, { events: match.events, play: match.play ?? null }, coachNames);
    for (const egg of bank) {
      if (egg.on === "match") for (const hit of humanHitsOf(egg, tale, humanIds)) finds.push({ egg, hit, fixture: { ...fixture, result } });
    }
  }
  for (const human of humans) {
    const otherCoachNames = humans.filter((other) => other !== human).map((other) => other.name).filter(Boolean);
    for (const egg of bank) {
      if (egg.on !== "day") continue;
      let random: (() => number) | null = null;
      const draw = () => (random ??= keyedStream(state.seed ^ EGG_SALT, `${date}:${human.clubId}:${egg.id}`))();
      const hit = egg.find({ before, state, date, clubId: human.clubId, coach: { name: human.name, record: human.record }, otherCoachNames, played, events, random: draw });
      if (hit) finds.push({ egg, hit });
    }
  }
  return finds.length ? record(state, date, finds, humans) : { state, events: [] };
}
