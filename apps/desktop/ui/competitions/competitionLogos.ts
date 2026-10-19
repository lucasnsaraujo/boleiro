import manifestJson from "@boleiro/data/pack/competitions/assets.json?raw";
import { competitionLogoFileOf, parseAssetManifest } from "@boleiro/data/assetManifest";
import type { State } from "@boleiro/data/clubs";
import type { EditionHost } from "@boleiro/engine/sim/hosts/venue";
import { competitionKeyName } from "@boleiro/game-client/format/competitionName";
import { nationalTeamName } from "@boleiro/game-client/format/nationalTeamName";
import { FLAG_COLOURS, STATE_FLAG_COLOURS } from "./flagColours.js";
import { generatedLogoSvg, type LogoSpec } from "./generatedLogo.js";

// Every competition's real logo the pipeline found, by competition key or, for a logo that names its year, by edition
// id (pipeline/fetch_competition_logos.py, data/competition-logos.csv), WebP in the 64, 128 and 256 px boxes.
const ASSETS = parseAssetManifest(manifestJson);
const FILES = import.meta.glob<string>("./logo/*.webp", {
  base: "../../../../packages/data/pack/competitions/assets/",
  eager: true,
  query: "?url",
  import: "default",
});

/** A competition's logo for a height in CSS pixels: its file, its width at that height, and whether it is the real one or drawn by the game. */
export type CompetitionLogo = { url: string; width: number; height: number; isReal: boolean };

// The world packs' country ids, by the national teams' that name the same country's flag.
const COUNTRY_TEAMS: Readonly<Record<string, string>> = {
  ar: "argentina", bo: "bolivia", cl: "chile", co: "colombia", ec: "ecuador", py: "paraguay", pe: "peru", uy: "uruguay", ve: "venezuela",
  "gb-eng": "england", es: "spain", it: "italy", de: "germany", fr: "france", pt: "portugal", nl: "netherlands", tr: "turkiye", be: "belgium",
  "gb-sct": "scotland", at: "austria", gr: "greece", cz: "czechia", hr: "croatia", ua: "ukraine", pl: "poland", no: "norway", sk: "slovakia",
  si: "slovenia", hu: "hungary", bg: "bulgaria", cy: "cyprus", am: "armenia", il: "israel", az: "azerbaijan", sa: "saudi-arabia",
  us: "united-states", mx: "mexico",
};

/** The colours of the hosts' flags, each host's strongest first: what a drawn edition logo is themed in. */
function hostColours(countries: readonly string[]): string[] {
  const flags = countries.map((country) => FLAG_COLOURS[country] ?? []);
  const ordered = [0, 1, 2].flatMap((i) => flags.map((flag) => flag[i]).filter((colour): colour is string => colour !== undefined));
  return [...new Set(ordered)].slice(0, 5);
}

/** The hosts as the logo prints them: up to three names, "ESPANHA · PORTUGAL · MARROCOS". */
function hostLine(countries: readonly string[]): string {
  return countries.slice(0, 3).map((country) => nationalTeamName(country)).join(" · ");
}

const isState = (code: string): code is State => code in STATE_FLAG_COLOURS;

/** What the game draws for a competition without a real logo: its organiser's emblem, colours and lettering. */
export function logoSpecOf(key: string, season: number | null, host: EditionHost | null = null): LogoSpec {
  const id = season === null ? key : `${key}-${season}`;
  const year = season === null ? "" : String(season);
  const hosts = host?.countries ?? [];
  const withHost = [hostLine(hosts), year].filter(Boolean).join(" ");
  const state = /^state-([a-z]{2})$/.exec(key)?.[1]?.toUpperCase() ?? "";
  if (isState(state)) {
    return { id, organiser: "state", motif: "shield", colours: STATE_FLAG_COLOURS[state], kicker: "CAMPEONATO", title: competitionKeyName(key), subtitle: year, monogram: state, holds: "ball" };
  }
  switch (key) {
    case "world-cup":
      return { id, organiser: "fifa", motif: "orbit", colours: hostColours(hosts), kicker: "FIFA", title: "COPA DO MUNDO", subtitle: withHost, holds: "globe" };
    case "club-world-cup":
      return { id, organiser: "fifa", motif: "orbit", colours: ["#C9A04A", "#EED79B", ...hostColours(hosts).slice(0, 2)], kicker: "FIFA", title: "SUPER MUNDIAL", subtitle: withHost, holds: "globe" };
    case "copa-america":
      return { id, organiser: "conmebol", motif: "medallion", colours: hostColours(hosts), kicker: "CONMEBOL", title: "COPA AMÉRICA", subtitle: withHost, holds: "cup" };
    case "euro":
      return { id, organiser: "uefa", motif: "ellipse", colours: hostColours(hosts), kicker: "UEFA", title: `EURO ${year}`, subtitle: hostLine(hosts), holds: "vase" };
    case "qualifiers-conmebol":
      return { id, organiser: "conmebol", motif: "medallion", colours: [], kicker: "CONMEBOL", title: "ELIMINATÓRIAS", subtitle: `COPA DO MUNDO ${year}`.trim(), holds: "ball" };
    case "qualifiers-uefa":
      return { id, organiser: "uefa", motif: "ellipse", colours: [], kicker: "UEFA", title: "ELIMINATÓRIAS", subtitle: `COPA DO MUNDO ${year}`.trim(), holds: "ball" };
    case "nations-league":
      return { id, organiser: "uefa", motif: "ellipse", colours: [], kicker: "UEFA", title: "LIGA DAS NAÇÕES", subtitle: year, holds: "ball" };
    case "friendlies":
      return { id, organiser: "fifa", motif: "roundel", colours: ["#12285A", "#C9A04A"], kicker: "INTERNACIONAIS", title: "AMISTOSOS", subtitle: year, holds: "ball" };
    case "libertadores":
    case "sul-americana":
    case "recopa":
      return { id, organiser: "conmebol", motif: "medallion", colours: [], kicker: "CONMEBOL", title: competitionKeyName(key), subtitle: year, holds: "cup" };
    case "intercontinental-cup":
      return { id, organiser: "fifa", motif: "orbit", colours: ["#C9A04A", "#EED79B"], kicker: "FIFA", title: competitionKeyName(key), subtitle: year, holds: "globe" };
    case "champions-league":
    case "europa-league":
    case "uefa-super-cup":
      return { id, organiser: "uefa", motif: "ellipse", colours: [], kicker: "UEFA", title: competitionKeyName(key), subtitle: year, holds: "vase" };
  }
  if (key === "copa-do-brasil" || /^serie-[a-d]$/.test(key)) {
    return { id, organiser: "cbf", motif: "shield", colours: FLAG_COLOURS.brazil ?? [], kicker: "CBF", title: competitionKeyName(key), subtitle: year, holds: key === "copa-do-brasil" ? "cup" : "ball" };
  }
  const country = /^(.+)-(?:\d+|cup)$/.exec(key)?.[1] ?? "";
  const team = COUNTRY_TEAMS[country] ?? "";
  return {
    id,
    organiser: "federation",
    motif: "shield",
    colours: FLAG_COLOURS[team] ?? [],
    kicker: team ? nationalTeamName(team) : "",
    title: competitionKeyName(key),
    subtitle: year,
    holds: key.endsWith("-cup") ? "cup" : "ball",
  };
}

// Under this height a drawn logo shows its emblem alone, as its lettering would read under 8 px; every screen but the
// title celebration prints the competition's name beside it anyway.
const MARK_ONLY_BELOW = 100;
const drawn = new Map<string, string>();

function drawnUrl(spec: LogoSpec, layout: "full" | "mark"): string {
  const cacheKey = `${layout}:${spec.id}:${spec.subtitle}`;
  const known = drawn.get(cacheKey);
  if (known) return known;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedLogoSvg(spec, layout))}`;
  drawn.set(cacheKey, url);
  return url;
}

// A logo fills a slot `box` pixels tall and up to this much wider, so a wide wordmark doesn't outgrow a tall crest beside it.
const WIDEST = 1.3;

/** The pack's logo of an edition (`state-sp-2026`) or of the competition whatever its season (`serie-a`), fitted to `box` at twice its pixels. */
function realLogoOf(key: string, season: number | null, box: number): CompetitionLogo | null {
  for (const id of season === null ? [key] : [`${key}-${season}`, key]) {
    const image = ASSETS.images[ASSETS.competitions[id]?.logo ?? ""];
    if (!image) continue;
    const height = Math.round(Math.min(box, (box * WIDEST * image.height) / image.width));
    const width = Math.min(Math.round((height * image.width) / image.height), Math.floor(box * WIDEST));
    const file = competitionLogoFileOf(ASSETS, id, 2 * Math.max(width, height), "webp");
    const url = file ? FILES[`./${file}`] : undefined;
    if (url) return { url, width, height, isReal: true };
  }
  return null;
}

/**
 * A competition's logo fitted to a slot `box` CSS pixels tall (and up to 1.3 times as wide): its real one where the
 * pipeline found it, the edition's own for a logo that names its year, else one the game draws in its organiser's
 * colours, themed by `host` for a tournament's edition.
 */
export function competitionLogoOf(key: string, season: number | null, box: number, host: EditionHost | null = null): CompetitionLogo {
  const real = realLogoOf(key, season, box);
  if (real) return real;
  const layout = box < MARK_ONLY_BELOW ? "mark" : "full";
  const url = drawnUrl(logoSpecOf(key, season, host), layout);
  return { url, width: layout === "mark" ? box : Math.round((box * 200) / 260), height: box, isReal: false };
}
