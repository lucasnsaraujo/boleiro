// Turns the PNGs the screens spec wrote into docs/screens/{light,dark}/*.webp and docs/screens/README.md,
// and the film's WebM into docs/video/boleiro-live-round.mp4. Needs cwebp and ffmpeg on the PATH.
//
// Usage: node docs-capture/publish.mjs [shotsDir=/tmp/boleiro-shots] [videoDir=/tmp/boleiro-video]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const shotsDir = process.argv[2] ?? "/tmp/boleiro-shots";
const videoDir = process.argv[3] ?? "/tmp/boleiro-video";
const screensOut = join(root, "docs/screens");
const videoOut = join(root, "docs/video");
const QUALITY = "55";
const THEMES = ["light", "dark"];

const TITLES = {
  "01-start-menu": ["Start", "Start menu"],
  "02-new-game": ["Start", "New game"],
  "03-new-game-club-picked": ["Start", "New game, a club picked"],
  "04-new-game-formats": ["Start", "New game, calendar and formats (Personalizar)"],
  "05-new-game-hot-seat": ["Start", "New game, two coaches on one computer"],
  "10-hub": ["Club", "Hub (Times)"],
  "11-hub-paper": ["Club", "Hub, the paper open"],
  "20-market-search": ["Market", "Market, search"],
  "21-market-buy": ["Market", "Market, a player picked to buy"],
  "22-market-sell": ["Market", "Market, players put up for sale"],
  "23-market-auction": ["Market", "Market, a player at auction"],
  "30-finances": ["Club", "Finances"],
  "31-stadium": ["Club", "Stadium"],
  "32-youth": ["Club", "Youth"],
  "33-sponsors": ["Club", "Sponsors"],
  "34-chemistry": ["Club", "Chemistry"],
  "35-assistant": ["Club", "Assistant coach"],
  "36-national-team": ["Club", "National team"],
  "37-newspaper": ["Club", "Newspaper"],
  "38-calendar": ["Club", "Calendar"],
  "40-squad": ["Club", "Squad"],
  "41-player": ["Club", "Player"],
  "50-tables-state": ["Tables", "Tables, state championship"],
  "51-tables-serie-a": ["Tables", "Tables, Série A"],
  "52-tables-cup-bracket": ["Tables", "Tables, Copa do Brasil bracket"],
  "53-tables-libertadores": ["Tables", "Tables, Libertadores"],
  "54-tables-mundial": ["Tables", "Tables, world cups"],
  "55-tables-others": ["Tables", "Tables, other leagues"],
  "60-coaches": ["Coaches", "Coaches"],
  "61-coaches-cbf": ["Coaches", "Coaches, CBF ranking"],
  "62-coaches-world": ["Coaches", "Coaches, world ranking"],
  "63-coaches-places": ["Coaches", "Coaches, places in cups"],
  "70-options": ["Options and saves", "Options"],
  "71-options-credits": ["Options and saves", "Options, credits"],
  "72-saves": ["Options and saves", "Saves"],
  "80-lineup": ["Match day", "Lineup"],
  "81-tactics": ["Match day", "Tactics"],
  "82-match-plan": ["Match day", "Match plan"],
  "90-live-round": ["Match day", "Live round on the board"],
  "92-match-panel": ["Match day", "Match panel over the live round"],
  "93-match-page-summary": ["Match day", "Match page, summary"],
  "94-match-page-lineups": ["Match day", "Match page, lineups"],
  "95-match-page-stats": ["Match day", "Match page, stats"],
  "96-match-page-head-to-head": ["Match day", "Match page, head to head"],
  "97-live-round-end": ["Match day", "Live round at full time"],
  "100-hub-event": ["Events", "A club event waiting in the hub"],
  "101-press-conference": ["Events", "Press conference"],
  "110-moment-title": ["Moments", "Career moment, a title"],
  "111-moment-sacked": ["Moments", "Career moment, a sacking"],
  "112-moment-sacked-end": ["Moments", "Career moment, the morning after"],
  "113-offers": ["Moments", "Job offers"],
  "120-season-end": ["Season end", "End of the season"],
  "121-trajectory": ["Season end", "Trajectory"],
  "122-awards": ["Season end", "Awards"],
  "123-history-club": ["History and album", "History, club"],
  "124-album-season-page": ["History and album", "Album, a season's page"],
  "125-history-trophies": ["History and album", "History, trophies"],
  "126-history-records": ["History and album", "History, records"],
  "127-history-champions": ["History and album", "History, champions"],
  "128-history-scorers": ["History and album", "History, top scorers"],
  "129-history-career": ["History and album", "History, career"],
  "130-history-rarities": ["History and album", "History, rarities"],
  "140-start-menu-with-save": ["Options and saves", "Start menu with a saved game"],
  "141-saved-games": ["Options and saves", "Saved games"],
  "150-hot-seat-hub": ["Hot seat", "Hot-seat hub"],
  "151-hot-seat-turn": ["Hot seat", "Hot-seat turn screen"],
};

const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "ignore", "inherit"] });
const sizeKb = (file) => Math.round(statSync(file).size / 1024);

rmSync(screensOut, { recursive: true, force: true });
const done = new Map();
for (const theme of THEMES) {
  const source = join(shotsDir, theme);
  if (!existsSync(source)) continue;
  mkdirSync(join(screensOut, theme), { recursive: true });
  for (const file of readdirSync(source).filter((name) => name.endsWith(".png"))) {
    const slug = file.replace(/\.png$/, "");
    run("cwebp", ["-quiet", "-q", QUALITY, "-m", "6", join(source, file), "-o", join(screensOut, theme, `${slug}.webp`)]);
    done.set(slug, (done.get(slug) ?? []).concat(theme));
  }
}

const slugs = [...done.keys()].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
const unknown = slugs.filter((slug) => !TITLES[slug]);
if (unknown.length) throw new Error(`no title for ${unknown.join(", ")}`);
const groups = [...new Set(slugs.map((slug) => TITLES[slug][0]))];
const lines = [
  "# Screens",
  "",
  `Every screen and major dialog of the game, in the light and the dark theme, at 1280×800, as WebP (quality ${QUALITY}). They ship in the repository only, not in the app. ${slugs.length} screens, ${[...done.values()].flat().length} images.`,
  "",
  "Regenerate with the docs capture, from `apps/desktop`:",
  "",
  "```sh",
  "SHOT_THEME=light pnpm docs:screens && SHOT_THEME=dark pnpm docs:screens   # writes PNGs to /tmp/boleiro-shots",
  "node docs-capture/publish.mjs                                              # converts them into docs/screens",
  "```",
  "",
  "The capture plays a game of Flamengo from world seed 53 in the e2e build (`VITE_E2E=1`), reaching each screen with the same helpers the e2e specs use. A coach's name, a squad or a match can differ when the game's data or engine changes.",
];
for (const group of groups) {
  lines.push("", `## ${group}`, "", "| Screen | Light | Dark |", "|---|---|---|");
  for (const slug of slugs.filter((s) => TITLES[s][0] === group)) {
    const cell = (theme) => (done.get(slug).includes(theme) ? `<img src="${theme}/${slug}.webp" width="380" alt="${TITLES[slug][1]}, ${theme}">` : "not captured");
    lines.push(`| ${TITLES[slug][1]} | ${cell("light")} | ${cell("dark")} |`);
  }
}
writeFileSync(join(screensOut, "README.md"), `${lines.join("\n")}\n`);
const total = THEMES.flatMap((theme) => (existsSync(join(screensOut, theme)) ? readdirSync(join(screensOut, theme)).map((f) => sizeKb(join(screensOut, theme, f))) : [])).reduce((a, b) => a + b, 0);
console.log(`${slugs.length} screens, ${total} KB of WebP`);

const webm = existsSync(videoDir) ? readdirSync(videoDir).find((name) => name.endsWith(".webm")) : undefined;
if (webm) {
  mkdirSync(videoOut, { recursive: true });
  const target = join(videoOut, "boleiro-live-round.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-i", join(videoDir, webm), "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart", target]);
  console.log(`video ${sizeKb(target)} KB`);
}
