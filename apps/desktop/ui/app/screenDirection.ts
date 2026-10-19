import { navIndexOf } from "./screens.js";

/** Which way a screen change travels: along the bar, or into and out of the screens off it. */
export type ScreenDirection = "next" | "previous" | "deeper" | "back";

/** The start menu is the top; the bar's screens and the menus one step in; a match, a player or a turning point one more. */
function depthOf(pathname: string): number {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/squad/")) return 2;
  return navIndexOf(pathname) >= 0 || pathname === "/new-game" ? 1 : 2;
}

export function screenDirection(from: string, to: string): ScreenDirection {
  const fromBar = navIndexOf(from);
  const toBar = navIndexOf(to);
  if (fromBar >= 0 && toBar >= 0 && fromBar !== toBar) return toBar > fromBar ? "next" : "previous";
  return depthOf(to) < depthOf(from) ? "back" : "deeper";
}
