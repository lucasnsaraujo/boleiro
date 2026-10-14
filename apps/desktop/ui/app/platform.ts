/** The desktop the game runs on: it decides the window chrome and how shortcuts are printed. */
export type Platform = "mac" | "windows" | "other";

export function platformOf(userAgent: string): Platform {
  if (/Mac OS X|Macintosh/.test(userAgent)) return "mac";
  return /Windows/.test(userAgent) ? "windows" : "other";
}
