/** The desktop the game runs on: it decides the window chrome and how shortcuts are printed. */
export type Platform = "mac" | "windows" | "other";

/** Whose window controls sit in the game's header: macOS's traffic lights, the game's own Windows buttons, or none. */
export type WindowChrome = "mac" | "windows" | "none";

export function platformOf(userAgent: string): Platform {
  if (/Mac OS X|Macintosh/.test(userAgent)) return "mac";
  return /Windows/.test(userAgent) ? "windows" : "other";
}

/**
 * The desktop app draws no title bar of its own: the game's header takes its place. A browser tab
 * has its own window, so it gets none, unless the dev server is asked for a preview with
 * `?chrome=mac` or `?chrome=windows` (`search` is empty outside dev builds).
 */
export function windowChrome(platform: Platform, isDesktopApp: boolean, search: string): WindowChrome {
  const preview = new URLSearchParams(search).get("chrome");
  if (preview === "mac" || preview === "windows") return preview;
  if (!isDesktopApp || platform === "other") return "none";
  return platform;
}
