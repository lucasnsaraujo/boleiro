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

declare global {
  interface Navigator {
    /** Chromium's client hints; WebView2 has them, WebKit doesn't. */
    readonly userAgentData?: { getHighEntropyValues(hints: readonly string[]): Promise<{ platformVersion?: string }> };
  }
}

/** Windows' version as client hints report it, or null where the browser doesn't say. */
export async function windowsVersion(): Promise<string | null> {
  const values = await navigator.userAgentData?.getHighEntropyValues(["platformVersion"]);
  return values?.platformVersion ?? null;
}

/**
 * Mica fills the see-through window only on Windows 11, which client hints report as version 13 or
 * later; Windows 10 has nothing behind the page, so the paper must stay opaque there.
 */
export function hasMica(platformVersion: string | null): boolean {
  return Number(platformVersion?.split(".")[0] ?? 0) >= 13;
}
