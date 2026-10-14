/** One row of assets/sounds/CREDITS.md: a sound file and where it came from. */
export type Credit = { file: string; sound: string; author: string; licence: string; source: string; edit: string };

/** The licences the game may ship: CC0, the Pixabay licence, or CC BY with credit (no NC, SA or ND). */
export function isFreeLicence(licence: string): boolean {
  return /^(CC0 1\.0|Pixabay Content License|CC BY \d\.\d)$/.test(licence);
}

/** The rows of the credits table; the header and its separator are skipped. */
export function parseCredits(markdown: string): Credit[] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length === 6 && cells[0] !== "File" && !cells[0]?.startsWith("-"))
    .map(([file = "", sound = "", author = "", licence = "", source = "", edit = ""]) => ({ file, sound, author, licence, source, edit }));
}
