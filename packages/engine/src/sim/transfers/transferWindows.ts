import type { Coach } from "../coach/coach.js";
import { addDays, daysBetween } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";

type TransferWindow = { opens: string; closes: string; isMidSeason?: true };

// CBF 2026 registration windows: 5 January to 3 March, and 20 July to 11 September (Band,
// https://www.band.com.br/esportes/janela-internacional-de-transferencias-abre-hoje-veja-detalhes-202607191440;
// Itatiaia, "veja todas as datas do novo calendário do futebol brasileiro em 2026"). The same days
// are used every season. The restricted complementary window of March is left out.
export const TRANSFER_WINDOWS: readonly TransferWindow[] = [
  { opens: "01-05", closes: "03-03" },
  { opens: "07-20", closes: "09-11", isMidSeason: true },
];
// guess: AI clubs do their business once a week while a window is open, not every day.
const DAYS_BETWEEN_MARKET_DAYS = 7;
// guess: ten days, a week and a half of business with two or three match days in it: long enough to
// sign a few players, short enough that a mid-season move stays an emergency and not a second window.
export const PERSONAL_WINDOW_DAYS = 10;

/** The game's own windows, which every club shares. */
export type GameWindows = Pick<GameState, "hasMidSeasonWindow">;
/** The windows of the coach in the seat: the game's, and his own window after a move outside them. */
export type CoachWindows = GameWindows & { coach: Pick<Coach, "personalWindowUntil"> };

/** The windows the game opens every season; a game started without the mid-season window has only the other. */
export function transferWindowsOf(game: GameWindows): readonly TransferWindow[] {
  return game.hasMidSeasonWindow === false ? TRANSFER_WINDOWS.filter((w) => !w.isMidSeason) : TRANSFER_WINDOWS;
}

function windowOf(game: GameWindows, date: IsoDate): { opens: IsoDate; closes: IsoDate } | null {
  const day = date.slice(5);
  const found = transferWindowsOf(game).find((w) => day >= w.opens && day <= w.closes);
  return found ? { opens: `${date.slice(0, 4)}-${found.opens}`, closes: `${date.slice(0, 4)}-${found.closes}` } : null;
}

/** The last day of the window open for the coach on `date`, or null when none is; his own window counts until it ends. */
export function windowClosesOn(rules: CoachWindows, date: IsoDate): IsoDate | null {
  const closes = windowOf(rules, date)?.closes ?? null;
  const own = rules.coach.personalWindowUntil;
  if (own === undefined || own < date) return closes;
  return closes && closes > own ? closes : own;
}

export const isWindowOpen = (rules: CoachWindows, date: IsoDate): boolean => windowClosesOn(rules, date) !== null;

/** The first day of the game's next window after `date`. */
export function nextWindowOpensOn(game: GameWindows, date: IsoDate): IsoDate {
  const day = date.slice(5);
  const year = Number(date.slice(0, 4));
  const windows = transferWindowsOf(game);
  const next = windows.find((w) => day < w.opens);
  return next ? `${year}-${next.opens}` : `${year + 1}-${windows[0]?.opens ?? "01-01"}`;
}

/**
 * The last day of the window a coach who takes a new club on `date` gets for himself, or undefined
 * when the game's window is open. A game window that opens before his would end carries it on to its close.
 */
export function personalWindowEnd(game: GameWindows, date: IsoDate): IsoDate | undefined {
  if (windowOf(game, date)) return undefined;
  const last = addDays(date, PERSONAL_WINDOW_DAYS - 1);
  const opens = nextWindowOpensOn(game, date);
  return opens <= last ? (windowOf(game, opens)?.closes ?? last) : last;
}

/** Whether AI clubs trade today: the game window's first day and every week after it. A coach's own window is never one. */
export function isMarketDay(game: GameWindows, date: IsoDate): boolean {
  const window = windowOf(game, date);
  return window !== null && daysBetween(window.opens, date) % DAYS_BETWEEN_MARKET_DAYS === 0;
}
