import type { Role } from "@boleiro/data/players";
import { SHINE, type AlbumPage, type KeptClub, type KeptMatch } from "@boleiro/engine/sim/album/album";
import { fileAlbumPages } from "@boleiro/engine/sim/album/fileAlbumPages";
import type { WaitingCoach } from "@boleiro/engine/sim/coach/humanCoaches";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import { clubHistory } from "@boleiro/engine/sim/history/clubHistory";
import { competitionKey, NO_RECORDS, type ClubRecords, type CoachRecord, type CompetitionKey, type PlayerAtClub, type SeasonRecord } from "@boleiro/engine/sim/history/history";
import { rivalryOf } from "@boleiro/engine/sim/rivalries/rivalryOf";
import { eggAlbumOf, type EggAlbum, type EggSticker } from "../eggs/eggAlbum.js";
import { competitionKeyName } from "../format/competitionName.js";
import type { EditionHost } from "@boleiro/engine/sim/hosts/venue";

export type StickerShine = keyof typeof SHINE;

/** A player's sticker on a season's page. `isInGame` when his player page still opens. */
export type AlbumSticker = {
  playerId: string;
  /** Its number on the page, from 1. */
  number: number;
  name: string;
  role: Role;
  apps: number;
  goals: number;
  shines: StickerShine[];
  /** What he won that season, as the album captions it. */
  honours: string[];
  isInGame: boolean;
};

/**
 * A season of the coach at one club: `printed` at the season's close, `live` while it is played, or
 * `unprinted` for a season played before the album, which kept only its award winners and top scorers.
 * `since` is the day a printed page's count began, when it began after the season did.
 */
export type AlbumSeason = {
  season: number;
  clubId: string;
  status: "printed" | "live" | "unprinted";
  since: IsoDate | null;
  stickers: AlbumSticker[];
  /** The club's league finish that season; null while it is played or when the club played no national league. */
  finish: { division: string; position: number } | null;
  /** The titles he won at the club that season, as `TitlePage.id`s. */
  titleIds: string[];
  /** The rare stickers the club found that season while he ran it. */
  eggs: EggSticker[];
};

export type Goal = { name: string; clubId: string; minute: number; kind: GoalKind | null };

/** The match that gave a title: a final's deciding leg, or the match after which nobody could catch his club in a league. */
export type TitleDecider = {
  /** The match page's reference. */
  ref: string;
  kind: KeptMatch["kind"];
  date: IsoDate;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  penaltyWinnerId: string | null;
  isAfterExtraTime: boolean;
  firstLeg: { homeId: string; awayId: string; homeGoals: number; awayGoals: number } | null;
  /** Both clubs as they were, by id: one from abroad may be gone from the game since. */
  clubs: Record<string, KeptClub>;
  goals: Goal[];
  stadium: string | null;
  crowd: number | null;
};

/** What the career already recorded about a title when he won it. */
export type TitleStory = {
  /** His titles so far, this one included: 1 for his first anywhere. */
  careerTitle: number;
  /** His season at the club when he won it, from 1. */
  seasonAtClub: number;
  /** The club's last win of the competition before this one, as far as the game's history goes back; null when it never won it there. */
  clubLastWon: number | null;
  /** The first season the game's history knows. */
  historyFrom: number;
  /** The seasons he lost a final of the competition with the club before this title. */
  lostFinals: number[];
  /** The derby's name, when the title was decided against a rival. */
  derby: string | null;
};

/** A title's special page; `decider` is null for a title won before the album kept its finals. */
/** A title's special page: `host` is where its edition was played, which a tournament's logo is drawn for. */
export type TitlePage = { id: string; season: number; competition: CompetitionKey; name: string; host: EditionHost | null; clubId: string; decider: TitleDecider | null; story: TitleStory };

export type PlayerMark = { playerId: string; name: string; clubId: string; count: number; season?: number };

/** The coach's career records, from his album, and the records and idols of each club he ran. */
export type AlbumRecords = {
  titles: number;
  seasons: number;
  clubs: number;
  /** The most goals one player scored in a season for him. */
  topSeasonScorer: PlayerMark | null;
  /** The player who played the most games for him. */
  mostApps: PlayerMark | null;
  bestFinish: { season: number; clubId: string; division: string; position: number } | null;
  byClub: { clubId: string; records: ClubRecords; idols: (PlayerAtClub & { playerId: string })[] }[];
};

/** A coach's album: his seasons and title pages, newest first, his records and the rare stickers his clubs found. */
export type Album = {
  coachName: string;
  /** The human coaches whose albums open, the one in the seat first; one in a one-coach game. */
  coaches: string[];
  shown: number;
  seasons: AlbumSeason[];
  titles: TitlePage[];
  records: AlbumRecords;
  eggs: EggAlbum;
};

const NO_TABLES: SeasonRecord["tables"] = { A: [], B: [], C: [], D: [] };
const IDOLS_KEPT = 4;

const shinesOf = (bits: number): StickerShine[] => (Object.keys(SHINE) as StickerShine[]).filter((shine) => bits & SHINE[shine]);

/** What a season's awards and top scorers gave each player. */
function honoursOf(record: SeasonRecord | undefined): Map<string, string[]> {
  const honours = new Map<string, string[]>();
  const add = (playerId: string | undefined, honour: string) => playerId && honours.set(playerId, [...(honours.get(playerId) ?? []), honour]);
  const awards = record?.awards;
  if (awards) {
    add(awards.bolaDeOuro?.playerId, "Bola de Ouro");
    for (const player of awards.bolaDePrata) add(player.playerId, "Bola de Prata");
    add(awards.bestYoung?.playerId, "Revelação do Brasileirão");
    add(awards.ballonDor[0]?.playerId, "Ballon d'Or");
  }
  for (const [key, scorer] of Object.entries(record?.topScorers ?? {})) add(scorer.playerId, `Artilheiro · ${competitionKeyName(key)}`);
  return honours;
}

function seasonOf(state: GameState, page: AlbumPage, status: AlbumSeason["status"], titleIds: string[], eggs: EggSticker[]): AlbumSeason {
  const record = state.history.seasons.find((s) => s.season === page.season);
  const honours = honoursOf(record);
  const finish = record ? (Object.entries(record.tables).find(([, order]) => order.includes(page.clubId)) ?? null) : null;
  return {
    season: page.season,
    clubId: page.clubId,
    status,
    since: page.since ?? null,
    stickers: page.stickers.map(([playerId, name, role, apps, goals, shine], index) => ({
      playerId,
      number: index + 1,
      name,
      role,
      apps,
      goals,
      shines: shinesOf(shine),
      honours: honours.get(playerId) ?? [],
      isInGame: playerId in state.players,
    })),
    finish: finish ? { division: finish[0], position: finish[1].indexOf(page.clubId) + 1 } : null,
    titleIds,
    eggs,
  };
}

/** A season played before the album: only the players its awards and top scorers name at the club, with no games or goals. */
function unprintedPage(state: GameState, season: number, clubId: string): AlbumPage {
  const record = state.history.seasons.find((s) => s.season === season);
  const named = new Map<string, [name: string, role: Role, shine: number]>();
  const name = (playerId: string, playerName: string, role: Role, shine: number) => {
    const known = named.get(playerId);
    named.set(playerId, [playerName, known?.[1] ?? role, (known?.[2] ?? 0) | shine]);
  };
  const awards = record?.awards;
  const picked = awards ? [awards.bolaDeOuro, ...awards.bolaDePrata, awards.bestYoung] : [];
  for (const player of picked) if (player?.clubId === clubId) name(player.playerId, player.name, player.role, SHINE.award);
  for (const scorer of Object.values(record?.topScorers ?? {})) if (scorer.clubId === clubId) name(scorer.playerId, scorer.name, roleOf(state, scorer.playerId), SHINE.topScorer);
  return { season, clubId, stickers: [...named].map(([id, [playerName, role, shine]]) => [id, playerName, role, 0, 0, shine]) };
}

// guess: a top scorer the game no longer has played up front.
const roleOf = (state: GameState, playerId: string): Role => {
  const player = state.players[playerId];
  return player?.positions?.[0] ?? (player?.group === "GK" ? "goleiro" : player?.group === "DEF" ? "zagueiro" : player?.group === "MID" ? "meia" : "atacante");
};

/** The clubs a coach ran, each with the seasons he was there, in the order he ran them. */
function seasonsAt(record: CoachRecord, lastSeason: number): [number, string][] {
  return record.stints.flatMap((stint) => {
    const from = Number(stint.from.slice(0, 4));
    const until = stint.until ? Number(stint.until.slice(0, 4)) : lastSeason;
    return Array.from({ length: until - from + 1 }, (_, i): [number, string] => [from + i, stint.clubId]);
  });
}

function deciderOf(match: KeptMatch): TitleDecider {
  const { fixture } = match;
  const names = new Map(match.players.map(([id, name]) => [id, name]));
  return {
    ref: fixture.id,
    kind: match.kind,
    date: fixture.date,
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: fixture.result.homeGoals,
    awayGoals: fixture.result.awayGoals,
    penaltyWinnerId: fixture.result.penaltyWinnerId ?? null,
    isAfterExtraTime: fixture.result.isAfterExtraTime === true,
    firstLeg: match.firstLeg ? { homeId: match.firstLeg.homeId, awayId: match.firstLeg.awayId, homeGoals: match.firstLeg.result.homeGoals, awayGoals: match.firstLeg.result.awayGoals } : null,
    clubs: { [fixture.homeId]: match.sides.home, [fixture.awayId]: match.sides.away },
    goals: match.events.flatMap((e): Goal[] => (e.type === "goal" ? [{ name: names.get(e.playerId) ?? e.playerId, clubId: e.clubId, minute: e.minute, kind: e.kind ?? null }] : [])),
    stadium: match.stadium,
    crowd: match.crowd,
  };
}

const titleId = (season: number, competition: CompetitionKey, clubId: string) => `${season}:${competition}:${clubId}`;

function titlePages(state: GameState, record: CoachRecord): TitlePage[] {
  const kept = record.keptMatches ?? [];
  const historyFrom = state.history.seasons[0]?.season ?? state.season;
  return record.trophies.map((trophy, index): TitlePage => {
    const key = trophy.competition;
    const decider = kept.find((m) => m.isWon && m.season === trophy.season && m.clubId === trophy.clubId && competitionKey(m.fixture.competitionId) === key);
    const stint = record.stints.find((s) => s.clubId === trophy.clubId && s.from <= `${trophy.season}-12-31` && (s.until === null || s.until >= `${trophy.season}-01-01`));
    const clubLastWon = state.history.seasons.filter((s) => s.season < trophy.season && s.champions[key] === trophy.clubId).at(-1)?.season ?? null;
    const lostFinals = kept.filter((m) => m.kind === "final" && !m.isWon && m.clubId === trophy.clubId && m.season < trophy.season && competitionKey(m.fixture.competitionId) === key).map((m) => m.season);
    return {
      id: titleId(trophy.season, key, trophy.clubId),
      season: trophy.season,
      competition: key,
      name: competitionKeyName(key),
      host: state.hosts?.[`${key}-${trophy.season}`] ?? null,
      clubId: trophy.clubId,
      decider: decider ? deciderOf(decider) : null,
      story: {
        careerTitle: index + 1,
        seasonAtClub: stint ? trophy.season - Number(stint.from.slice(0, 4)) + 1 : 1,
        clubLastWon,
        historyFrom,
        lostFinals,
        derby: decider ? (rivalryOf(decider.fixture.homeId, decider.fixture.awayId)?.name ?? null) : null,
      },
    };
  });
}

function recordsOf(state: GameState, record: CoachRecord, seasons: readonly AlbumSeason[], titles: number): AlbumRecords {
  let topSeasonScorer: PlayerMark | null = null;
  const apps = new Map<string, PlayerMark>();
  for (const page of seasons) {
    for (const sticker of page.stickers) {
      if (sticker.goals > (topSeasonScorer?.count ?? 0)) topSeasonScorer = { playerId: sticker.playerId, name: sticker.name, clubId: page.clubId, count: sticker.goals, season: page.season };
      const so = apps.get(sticker.playerId);
      apps.set(sticker.playerId, { playerId: sticker.playerId, name: sticker.name, clubId: so?.clubId ?? page.clubId, count: (so?.count ?? 0) + sticker.apps });
    }
  }
  const mostApps = [...apps.values()].reduce<PlayerMark | null>((best, mark) => (mark.count > (best?.count ?? 0) ? mark : best), null);
  const finishes = seasons.flatMap((page) => (page.finish ? [{ season: page.season, clubId: page.clubId, ...page.finish }] : []));
  const bestFinish = finishes.reduce<AlbumRecords["bestFinish"]>((best, f) => (!best || f.division < best.division || (f.division === best.division && f.position < best.position) ? f : best), null);
  const clubIds = [...new Set(record.stints.map((stint) => stint.clubId))];
  return {
    titles,
    seasons: new Set(seasons.map((page) => page.season)).size,
    clubs: clubIds.length,
    topSeasonScorer,
    mostApps,
    bestFinish,
    byClub: clubIds.map((clubId) => {
      const past = clubHistory(state, clubId);
      return { clubId, records: state.history.clubs[clubId] ?? NO_RECORDS, idols: past.idols.slice(0, IDOLS_KEPT) };
    }),
  };
}

/** The eggs the coach's clubs found while he ran them, or only those of one club in one season. */
function eggsOf(state: GameState, record: CoachRecord, at?: { clubId: string; season: number }): EggAlbum {
  const isHis = (clubId: string, date: IsoDate) => record.stints.some((s) => s.clubId === clubId && s.from <= date && (s.until === null || date <= s.until));
  const isAt = (clubId: string, date: IsoDate) => !at || (clubId === at.clubId && date.startsWith(String(at.season)));
  return eggAlbumOf({ eggs: { log: (state.eggs?.log ?? []).filter((find) => isHis(find.clubId, find.date) && isAt(find.clubId, find.date)) } });
}

/** The human coaches in seat order: the one in the seat, then the waiting ones. */
function seatsOf(state: GameState): { name: string; record: CoachRecord; clubId: string | null; waiting: WaitingCoach | null }[] {
  return [
    { name: state.coachName ?? "", record: state.history.coach, clubId: state.coachClubId, waiting: null },
    ...(state.waitingCoaches ?? []).map((waiting) => ({ name: waiting.name, record: waiting.record, clubId: waiting.clubId, waiting })),
  ];
}

/**
 * The album of the human coach at `seat` (0 the one in the seat, then the waiting ones in turn order):
 * every season and club he ran, newest first, as printed at its close, the season under way as it
 * stands, and the seasons played before the album with what the history kept of them.
 */
export function albumOf(state: GameState, seat = 0): Album {
  const seats = seatsOf(state);
  const shown = seats[seat] ? seat : 0;
  const coach = seats[shown];
  if (!coach) throw new Error("the game has no coach");
  const { record } = coach;
  const titles = titlePages(state, record);
  const titleIdsOf = (season: number, clubId: string) => titles.filter((t) => t.season === season && t.clubId === clubId).map((t) => t.id);
  const live = fileAlbumPages(state, { season: state.season, champions: {}, topScorers: {}, promoted: NO_TABLES, relegated: NO_TABLES, tables: NO_TABLES });
  const liveRecord = shown === 0 ? live.coach : live.waitingCoaches?.[shown - 1]?.record;
  const livePages = (liveRecord?.album ?? []).filter((page) => page.season === state.season);
  const printed = record.album ?? [];
  const isPrinted = (season: number, clubId: string) => printed.some((page) => page.season === season && page.clubId === clubId);
  const filed = new Set(state.history.seasons.map((s) => s.season));
  const unprinted = seasonsAt(record, state.season).filter(([season, clubId]) => filed.has(season) && !isPrinted(season, clubId));
  const season = (page: AlbumPage, status: AlbumSeason["status"]) => seasonOf(state, page, status, titleIdsOf(page.season, page.clubId), eggsOf(state, record, page).found);
  const seasons = [
    ...livePages.map((page) => season(page, "live")),
    ...printed.map((page) => season(page, "printed")),
    ...unprinted.map(([year, clubId]) => season(unprintedPage(state, year, clubId), "unprinted")),
  ].sort((a, b) => b.season - a.season);
  return {
    coachName: coach.name,
    coaches: seats.map((s) => s.name),
    shown,
    seasons,
    titles: titles.toReversed(),
    records: recordsOf(state, record, seasons, titles.length),
    eggs: eggsOf(state, record),
  };
}
