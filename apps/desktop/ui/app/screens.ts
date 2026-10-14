/** Every screen's path. The coach sets his eleven on the round screen before kick-off. */
export const SCREEN_PATHS = [
  "/",
  "/new-game",
  "/hub",
  "/round",
  "/tables",
  "/market",
  "/finances",
  "/calendar",
  "/history",
  "/season-end",
  "/offers",
  "/sacked",
  "/options",
  "/saves",
] as const;

export type ScreenPath = (typeof SCREEN_PATHS)[number];

/**
 * Brasfoot's nine buttons, left to right, each on its F-key. A button with no screen yet has no path
 * and shows disabled. `paths` are the screens that light the button up besides its own.
 */
export const NAV = [
  { id: "agenda", label: "Agenda", icon: "calendar-dots", key: "F1", path: "/calendar", paths: [] },
  { id: "tabelas", label: "Tabelas", icon: "table", key: "F2", path: "/tables", paths: [] },
  { id: "estadio", label: "Estádio", icon: "ticket", key: "F3", path: null, paths: [] },
  { id: "base", label: "Base", icon: "plant", key: "F4", path: null, paths: [] },
  { id: "times", label: "Times", icon: "t-shirt", key: "F5", path: "/hub", paths: ["/finances", "/squad"] },
  { id: "busca", label: "Busca", icon: "magnifying-glass", key: "F6", path: "/market", paths: [] },
  { id: "tecnicos", label: "Técnicos", icon: "chalkboard-teacher", key: "F7", path: "/offers", paths: [] },
  { id: "historico", label: "Histórico", icon: "book-open-text", key: "F8", path: "/history", paths: [] },
  { id: "opcoes", label: "Opções", icon: "gear-six", key: "F9", path: "/options", paths: ["/saves"] },
] as const satisfies readonly NavItem[];

type NavItem = { id: string; label: string; icon: string; key: string; path: ScreenPath | null; paths: readonly string[] };

export type NavId = (typeof NAV)[number]["id"];

/** The bar button a screen belongs to; a player's own screen sits under Times with the squad. */
export function navIndexOf(pathname: string): number {
  return NAV.findIndex(({ path, paths }) => path === pathname || paths.some((other) => pathname === other || pathname.startsWith(`${other}/`)));
}

// The start menu, a new game, the live round and the turning points fill the window on their own.
const WITHOUT_BAR: ReadonlySet<string> = new Set(["/", "/new-game", "/round", "/season-end", "/sacked"]);

/** Whether the green bar sits over the screen: only inside an open game, and never over a moment that fills the window. */
export function showsBar(pathname: string, isGameOpen: boolean): boolean {
  return isGameOpen && !WITHOUT_BAR.has(pathname);
}
