import { LOGO_GLYPHS, type Glyph } from "./logoGlyphs.js";

/** Whose colour language a drawn logo speaks: the CBF's or a state federation's, CONMEBOL's, UEFA's, FIFA's, or a country's federation. */
export type Organiser = "state" | "cbf" | "conmebol" | "uefa" | "fifa" | "federation";

/**
 * The emblem a drawn logo is built on: a federation's shield, CONMEBOL's medallion, UEFA's ellipse, FIFA's orbit
 * (a World Cup or Super Mundial), or a roundel.
 */
export type Motif = "shield" | "medallion" | "ellipse" | "orbit" | "roundel";

/** What a drawn logo says and how: its emblem, its colours (a host's or a state's flag, first the strongest) and three lines of lettering. */
export type LogoSpec = {
  /** The competition or edition id the logo belongs to; its small variations come from it, so a logo never changes. */
  id: string;
  organiser: Organiser;
  motif: Motif;
  colours: readonly string[];
  /** The small line over the name: "CAMPEONATO", "CONMEBOL", "UEFA". */
  kicker: string;
  title: string;
  /** The line under the name: the year, or the host and the year. */
  subtitle: string;
  /** Up to three characters the emblem carries: a state's letters, an edition's year. */
  monogram?: string;
  /** What the emblem holds: a trophy (an edition, a cup) or a ball (a league, a qualifier). */
  holds: "cup" | "vase" | "globe" | "ball";
};

/** The organisers' inks and metals: CONMEBOL's navy and gold, UEFA's navy and silver, FIFA's navy and gold, the CBF's flag. */
const HOUSE: Record<Organiser, { ink: string; metal: string; light: string }> = {
  state: { ink: "#13241A", metal: "#C9A04A", light: "#F2EAD9" },
  cbf: { ink: "#002776", metal: "#FFDF00", light: "#FFFFFF" },
  conmebol: { ink: "#0E1F3D", metal: "#C8A04A", light: "#ECD59A" },
  uefa: { ink: "#0A1F5C", metal: "#B9C3CF", light: "#E8EDF3" },
  fifa: { ink: "#12285A", metal: "#C9A04A", light: "#EED79B" },
  federation: { ink: "#14231A", metal: "#C9A04A", light: "#F2EAD9" },
};

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/** A small deterministic stream from the logo's id: its variations (a band's angle, a ring's ticks) never change between runs. */
function streamOf(id: string): () => number {
  let state = 2166136261;
  for (const char of id) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative luminance, for lettering that reads on a fill. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
const inkOn = (fill: string, ink: string) => (luminance(fill) > 0.42 ? ink : "#FFFFFF");

type Style = "heavy" | "narrow";

/** The characters a line can draw: capitals Archivo has, accents dropped from any it lacks. */
function lettersOf(text: string, style: Style): string[] {
  const glyphs = LOGO_GLYPHS[style];
  return [...text.toUpperCase()].map((char) => (char in glyphs ? char : char.normalize("NFD").replace(/\p{M}/gu, ""))).filter((char) => char in glyphs);
}

function widthOf(letters: readonly string[], style: Style, size: number, tracking: number): number {
  const glyphs = LOGO_GLYPHS[style];
  const units = letters.reduce((sum, char) => sum + (glyphs[char]?.advance ?? 0), 0);
  return (units * size) / LOGO_GLYPHS.unitsPerEm + tracking * Math.max(0, letters.length - 1);
}

/** A line of outlined lettering centred on `x`, its baseline at `y`, shrunk to `maxWidth` when it would run past it. */
function line(text: string, style: Style, x: number, y: number, size: number, fill: string, maxWidth: number, tracking = 0): string {
  const letters = lettersOf(text, style);
  if (!letters.length) return "";
  const natural = widthOf(letters, style, size, tracking);
  const fit = natural > maxWidth ? maxWidth / natural : 1;
  const scale = (size * fit) / LOGO_GLYPHS.unitsPerEm;
  const glyphs: Record<string, Glyph> = LOGO_GLYPHS[style];
  let pen = 0;
  const paths = letters.map((char) => {
    const glyph = glyphs[char];
    const at = pen;
    pen += (glyph?.advance ?? 0) + (tracking * fit) / scale;
    return glyph?.d ? `<path transform="translate(${n(at)} 0)" d="${glyph.d}"/>` : "";
  });
  const width = natural * fit;
  return `<g fill="${fill}" transform="translate(${n(x - width / 2)} ${n(y)}) scale(${scale.toFixed(4)})">${paths.join("")}</g>`;
}

function polygon(cx: number, cy: number, r: number, sides: number, rotation: number): string {
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    return `${n(cx + r * Math.cos(angle))} ${n(cy + r * Math.sin(angle))}`;
  });
  return `M${points.join(" L")}Z`;
}

function star(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))}`;
  });
  return `M${points.join(" L")}Z`;
}

/**
 * A football as its classic panels show it face on: the middle pentagon, the five cut at the rim around it, the seams
 * from one to the other and the hexagons' outer edges between the rim ones.
 */
function ball(cx: number, cy: number, r: number, ink: string, clip: string, turn: number): string {
  const at = (angle: number, distance: number, from: [number, number] = [cx, cy]): [number, number] => [from[0] + distance * Math.cos(angle), from[1] + distance * Math.sin(angle)];
  const point = ([x, y]: [number, number]) => `${n(x)} ${n(y)}`;
  const up = -Math.PI / 2 + turn;
  const step = (2 * Math.PI) / 5;
  const inner = r * 0.3;
  const rimCentre = r * 0.9;
  const rimRadius = r * 0.29;
  const rims = Array.from({ length: 5 }, (_, i) => at(up + i * step, rimCentre));
  const rimVertex = (i: number, k: number) => at(up + i * step + Math.PI + k * step, rimRadius, rims[i]);
  const seams = Array.from({ length: 5 }, (_, i) => `M${point(at(up + i * step, inner))} L${point(rimVertex(i, 0))}`).join("");
  const edges = Array.from({ length: 5 }, (_, i) => `M${point(rimVertex(i, -1))} L${point(rimVertex((i + 1) % 5, 1))}`).join("");
  const rimPanels = rims.map((centre, i) => polygon(centre[0], centre[1], rimRadius, 5, up + i * step + Math.PI)).join("");
  return (
    `<clipPath id="${clip}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#FFFFFF"/>` +
    `<g clip-path="url(#${clip})"><path d="${polygon(cx, cy, inner, 5, up)}${rimPanels}" fill="${ink}"/>` +
    `<path d="${seams}${edges}" stroke="${ink}" stroke-width="${n(r * 0.075)}" stroke-linecap="round" fill="none"/></g>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.96)}" fill="none" stroke="${ink}" stroke-width="${n(r * 0.08)}"/>`
  );
}

/** A two-handled cup, as most national cups' trophies: bowl, handles, stem and a two-step base, `h` tall. */
function cup(cx: number, top: number, h: number, metal: string, ink: string): string {
  const s = h / 100;
  const x = (v: number) => n(cx + v * s);
  const y = (v: number) => n(top + v * s);
  return (
    `<g fill="${metal}" stroke="${ink}" stroke-width="${n(2.2 * s)}" stroke-linejoin="round">` +
    `<path d="M${x(-30)} ${y(0)} H${x(30)} C${x(30)} ${y(30)} ${x(18)} ${y(48)} ${x(0)} ${y(52)} C${x(-18)} ${y(48)} ${x(-30)} ${y(30)} ${x(-30)} ${y(0)}Z"/>` +
    `<path d="M${x(-29)} ${y(8)} C${x(-48)} ${y(6)} ${x(-48)} ${y(36)} ${x(-16)} ${y(42)}" fill="none" stroke="${metal}" stroke-width="${n(7 * s)}" stroke-linecap="round"/>` +
    `<path d="M${x(29)} ${y(8)} C${x(48)} ${y(6)} ${x(48)} ${y(36)} ${x(16)} ${y(42)}" fill="none" stroke="${metal}" stroke-width="${n(7 * s)}" stroke-linecap="round"/>` +
    `<path d="M${x(-6)} ${y(52)} H${x(6)} L${x(9)} ${y(72)} H${x(-9)}Z"/>` +
    `<path d="M${x(-20)} ${y(72)} H${x(20)} L${x(24)} ${y(84)} H${x(-24)}Z"/>` +
    `<rect x="${x(-28)}" y="${y(84)}" width="${n(56 * s)}" height="${n(14 * s)}" rx="${n(2 * s)}"/>` +
    `</g>` +
    `<path d="M${x(-22)} ${y(6)} C${x(-22)} ${y(26)} ${x(-14)} ${y(40)} ${x(-4)} ${y(45)}" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="${n(3 * s)}" stroke-linecap="round"/>`
  );
}

/** A tall vase on a plinth, as UEFA's trophies are, `h` tall. */
function vase(cx: number, top: number, h: number, metal: string, ink: string): string {
  const s = h / 100;
  const x = (v: number) => n(cx + v * s);
  const y = (v: number) => n(top + v * s);
  return (
    `<g fill="${metal}" stroke="${ink}" stroke-width="${n(2.2 * s)}" stroke-linejoin="round">` +
    `<path d="M${x(-13)} ${y(0)} H${x(13)} C${x(11)} ${y(10)} ${x(9)} ${y(20)} ${x(17)} ${y(40)} C${x(23)} ${y(56)} ${x(14)} ${y(70)} ${x(7)} ${y(74)} V${y(82)} H${x(-7)} V${y(74)} C${x(-14)} ${y(70)} ${x(-23)} ${y(56)} ${x(-17)} ${y(40)} C${x(-9)} ${y(20)} ${x(-11)} ${y(10)} ${x(-13)} ${y(0)}Z"/>` +
    `<path d="M${x(-12)} ${y(6)} C${x(-26)} ${y(10)} ${x(-28)} ${y(30)} ${x(-17)} ${y(40)}" fill="none" stroke="${metal}" stroke-width="${n(4 * s)}" stroke-linecap="round"/>` +
    `<path d="M${x(12)} ${y(6)} C${x(26)} ${y(10)} ${x(28)} ${y(30)} ${x(17)} ${y(40)}" fill="none" stroke="${metal}" stroke-width="${n(4 * s)}" stroke-linecap="round"/>` +
    `<path d="M${x(-16)} ${y(82)} H${x(16)} L${x(19)} ${y(100)} H${x(-19)}Z"/>` +
    `</g>` +
    `<path d="M${x(-8)} ${y(30)} C${x(-12)} ${y(44)} ${x(-11)} ${y(58)} ${x(-4)} ${y(68)}" fill="none" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="${n(2.6 * s)}" stroke-linecap="round"/>`
  );
}

/** A globe held up by a slim column on a ringed base, as FIFA's cups are, `h` tall; the base's rings in the host's colours. */
function globe(cx: number, top: number, h: number, metal: string, ink: string, rings: readonly string[], clip: string): string {
  const s = h / 100;
  const x = (v: number) => n(cx + v * s);
  const y = (v: number) => n(top + v * s);
  const r = 22 * s;
  const gy = top + 23 * s;
  const meridians = [-0.55, 0, 0.55].map((k) => `<ellipse cx="${n(cx)}" cy="${n(gy)}" rx="${n(Math.abs(k) * r || 0.6 * s)}" ry="${n(r)}"/>`).join("");
  const parallels = [-0.5, 0.5].map((k) => `<path d="M${n(cx - r)} ${n(gy + k * r)} H${n(cx + r)}"/>`).join("");
  const bands = rings.slice(0, 2).map((colour, i) => `<rect x="${x(-17)}" y="${y(80 + i * 6)}" width="${n(34 * s)}" height="${n(5 * s)}" fill="${colour}"/>`).join("");
  return (
    `<g fill="${metal}" stroke="${ink}" stroke-width="${n(2.2 * s)}" stroke-linejoin="round">` +
    `<path d="M${x(-12)} ${y(42)} C${x(-6)} ${y(56)} ${x(-9)} ${y(68)} ${x(-14)} ${y(78)} H${x(14)} C${x(9)} ${y(68)} ${x(6)} ${y(56)} ${x(12)} ${y(42)}Z"/>` +
    `<path d="M${x(-19)} ${y(78)} H${x(19)} L${x(21)} ${y(100)} H${x(-21)}Z"/>` +
    `<circle cx="${n(cx)}" cy="${n(gy)}" r="${n(r)}"/>` +
    `</g>` +
    `<clipPath id="${clip}"><circle cx="${n(cx)}" cy="${n(gy)}" r="${n(r)}"/></clipPath>` +
    `<g clip-path="url(#${clip})" fill="none" stroke="${ink}" stroke-opacity=".55" stroke-width="${n(1.4 * s)}">${meridians}${parallels}</g>` +
    bands +
    `<path d="M${n(cx - r * 0.55)} ${n(gy - r * 0.5)} A${n(r * 0.8)} ${n(r * 0.8)} 0 0 1 ${n(cx + r * 0.1)} ${n(gy - r * 0.85)}" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="${n(2.4 * s)}" stroke-linecap="round"/>`
  );
}

function held(spec: LogoSpec, cx: number, top: number, h: number, metal: string, ink: string, clip: string, turn: number): string {
  if (spec.holds === "cup") return cup(cx, top, h, metal, ink);
  if (spec.holds === "vase") return vase(cx, top, h, metal, ink);
  if (spec.holds === "globe") return globe(cx, top, h, metal, ink, spec.colours, clip);
  return ball(cx, top + h / 2, h / 2, ink, clip, turn);
}

const colourAt = (spec: LogoSpec, i: number, fallback: string) => spec.colours[i % Math.max(1, spec.colours.length)] ?? fallback;

/** A state federation's or a country's shield: the flag's colour, a band across it, the state's letters on its chief and a ball or trophy in a white roundel. */
function shield(spec: LogoSpec, random: () => number): string {
  const house = HOUSE[spec.organiser];
  const field = colourAt(spec, 0, house.ink);
  const chief = colourAt(spec, 1, house.metal);
  const band = colourAt(spec, 2, house.light);
  const outline = "M20 12 H140 V76 C140 116 113 140 80 154 C47 140 20 116 20 76Z";
  const inner = "M27 19 H133 V76 C133 111 109 132 80 145 C51 132 27 111 27 76Z";
  const angle = [-28, -18, 18, 28][Math.floor(random() * 4)] ?? -24;
  const stars = Math.floor(random() * 3) + 1;
  const starRow = (y: number) => Array.from({ length: stars }, (_, i) => `<path d="${star(80 + (i - (stars - 1) / 2) * 14, y, 4.6)}"/>`).join("");
  return (
    `<path d="${outline}" fill="${house.ink}"/>` +
    `<clipPath id="${spec.id}-shield"><path d="${inner}"/></clipPath>` +
    `<g clip-path="url(#${spec.id}-shield)">` +
    `<rect x="20" y="12" width="120" height="142" fill="${field}"/>` +
    `<rect x="-20" y="88" width="200" height="22" fill="${band}" transform="rotate(${angle} 80 99)"/>` +
    `<rect x="20" y="12" width="120" height="${spec.monogram ? 36 : 28}" fill="${chief}"/>` +
    `</g>` +
    (spec.monogram ? line(spec.monogram, "heavy", 80, 42, 26, inkOn(chief, house.ink), 90, 1) : `<g fill="${inkOn(chief, house.ink)}">${starRow(31)}</g>`) +
    `<circle cx="80" cy="96" r="29" fill="#FFFFFF" stroke="${house.ink}" stroke-width="3"/>` +
    held(spec, 80, 72, spec.holds === "ball" ? 48 : 46, house.metal, house.ink, `${spec.id}-held`, random() * 0.6) +
    (spec.monogram ? `<g fill="${inkOn(field, house.ink)}">${starRow(136)}</g>` : "")
  );
}

/** CONMEBOL's medallion: a navy disc in a gold ring dotted with its ten members, the host's colours as a sash, the trophy over it. */
function medallion(spec: LogoSpec, random: () => number): string {
  const house = HOUSE[spec.organiser];
  const dots = Array.from({ length: 10 }, (_, i) => {
    const angle = (-90 + (i - 4.5) * 14) * (Math.PI / 180);
    return `<circle cx="${n(80 + 72.6 * Math.cos(angle))}" cy="${n(84 + 72.6 * Math.sin(angle))}" r="1.9"/>`;
  }).join("");
  const sashes = spec.colours.slice(0, 3).map((colour, i) => `<rect x="-20" y="${n(112 + i * 11)}" width="200" height="11" fill="${colour}"/>`).join("");
  const tilt = random() > 0.5 ? -14 : 14;
  return (
    `<circle cx="80" cy="84" r="76" fill="${house.ink}"/>` +
    `<circle cx="80" cy="84" r="68.5" fill="none" stroke="${house.metal}" stroke-width="2.4"/>` +
    `<g fill="${house.metal}">${dots}</g>` +
    `<clipPath id="${spec.id}-disc"><circle cx="80" cy="84" r="62"/></clipPath>` +
    `<g clip-path="url(#${spec.id}-disc)"><g transform="rotate(${tilt} 80 84)">${sashes}</g></g>` +
    `<circle cx="80" cy="84" r="62" fill="none" stroke="${house.metal}" stroke-width="1.6"/>` +
    held(spec, 80, 34, 92, house.metal, house.ink, `${spec.id}-held`, random() * 0.6)
  );
}

/** UEFA's ellipse: a mosaic of the host's colours (UEFA's navy and silver for a cup without a host) around a white field, the trophy standing in it. */
function ellipse(spec: LogoSpec, random: () => number): string {
  const house = HOUSE[spec.organiser];
  const colours = spec.colours.length ? spec.colours : [house.ink, house.metal, "#5A6F9C"];
  const size = 13;
  const shift = Math.floor(random() * colours.length);
  const tiles: string[] = [];
  for (let row = 0; row * size < 170; row++) {
    for (let column = 0; column * size < 180; column++) {
      const colour = colours[(row * 2 + column + shift) % colours.length] ?? house.ink;
      const x = column * size - 10;
      const y = row * size - 4;
      const half = size / 2;
      tiles.push(`<path d="M${n(x + half)} ${n(y)} L${n(x + size)} ${n(y + half)} L${n(x + half)} ${n(y + size)} L${n(x)} ${n(y + half)}Z" fill="${colour}"/>`);
    }
  }
  return (
    `<ellipse cx="80" cy="82" rx="58" ry="76" fill="${house.ink}"/>` +
    `<clipPath id="${spec.id}-oval"><ellipse cx="80" cy="82" rx="53" ry="71"/></clipPath>` +
    `<g clip-path="url(#${spec.id}-oval)"><rect x="0" y="0" width="160" height="164" fill="${house.light}"/>${tiles.join("")}</g>` +
    `<ellipse cx="80" cy="82" rx="35" ry="53" fill="${house.ink}" stroke="#FFFFFF" stroke-width="3"/>` +
    held(spec, 80, spec.holds === "ball" ? 58 : 34, spec.holds === "ball" ? 48 : 94, house.metal, house.ink, `${spec.id}-held`, random() * 0.6)
  );
}

/** FIFA's orbit: the host's colours as ribbons circling a navy field, a gold rim, the globe trophy at the centre. */
function orbit(spec: LogoSpec, random: () => number): string {
  const house = HOUSE[spec.organiser];
  const colours = spec.colours.length ? spec.colours.slice(0, 4) : [house.metal, house.light];
  const start = random() * 360;
  const arc = (radius: number, from: number, sweep: number) => {
    const a = (from * Math.PI) / 180;
    const b = ((from + sweep) * Math.PI) / 180;
    return `M${n(80 + radius * Math.cos(a))} ${n(84 + radius * Math.sin(a))} A${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${n(80 + radius * Math.cos(b))} ${n(84 + radius * Math.sin(b))}`;
  };
  const ribbons = colours.map((colour, i) => {
    const radius = 66 - i * 9;
    const from = start + i * 47;
    return `<path d="${arc(radius, from, 250 - i * 22)}" fill="none" stroke="${colour}" stroke-width="6.4" stroke-linecap="round"/>`;
  }).join("");
  return (
    `<circle cx="80" cy="84" r="78" fill="${house.ink}"/>` +
    `<circle cx="80" cy="84" r="74" fill="none" stroke="${house.metal}" stroke-width="2"/>` +
    ribbons +
    held(spec, 80, 34, 96, house.metal, house.ink, `${spec.id}-held`, 0)
  );
}

/** A roundel cut in two colours, a ball in its middle: friendlies and any competition whose organiser has no mark of its own. */
function roundel(spec: LogoSpec, random: () => number): string {
  const house = HOUSE[spec.organiser];
  const [a, b] = [colourAt(spec, 0, house.ink), colourAt(spec, 1, house.metal)];
  const angle = [-35, -20, 20, 35][Math.floor(random() * 4)] ?? 30;
  return (
    `<circle cx="80" cy="84" r="76" fill="${house.ink}"/>` +
    `<clipPath id="${spec.id}-round"><circle cx="80" cy="84" r="69"/></clipPath>` +
    `<g clip-path="url(#${spec.id}-round)" transform="rotate(${angle} 80 84)"><rect x="0" y="0" width="160" height="84" fill="${a}"/><rect x="0" y="84" width="160" height="90" fill="${b}"/></g>` +
    `<circle cx="80" cy="84" r="69" fill="none" stroke="#FFFFFF" stroke-width="2.4"/>` +
    held(spec, 80, spec.holds === "ball" ? 50 : 38, spec.holds === "ball" ? 68 : 90, house.metal, house.ink, `${spec.id}-held`, random() * 0.6)
  );
}

const EMBLEMS: Record<Motif, (spec: LogoSpec, random: () => number) => string> = { shield, medallion, ellipse, orbit, roundel };

/** The emblem's drawing, in a 160 x 160 box. */
function emblemOf(spec: LogoSpec): string {
  return EMBLEMS[spec.motif](spec, streamOf(spec.id));
}

/**
 * A logo drawn for a competition without a real one, as an SVG document: `full` is the emblem over its lettering
 * (kicker, name, year or host), 200 x 260 as most real logos stand; `mark` the emblem alone, 160 x 160, for the
 * smallest sizes. The same spec always draws the same logo.
 */
export function generatedLogoSvg(spec: LogoSpec, layout: "full" | "mark"): string {
  const house = HOUSE[spec.organiser];
  const ids = spec.id.replace(/[^a-z0-9-]/gi, "-");
  const safe = { ...spec, id: `l-${ids}` };
  const emblem = emblemOf(safe);
  if (layout === "mark") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">${emblem}</svg>`;
  const kicker = spec.organiser === "conmebol" ? `- ${spec.kicker} -` : spec.kicker;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">` +
    `<g transform="translate(20 2)">${emblem}</g>` +
    line(kicker, "narrow", 100, 190, 13, house.ink, 176, 2.6) +
    line(spec.title, "heavy", 100, 220, 27, house.ink, 190, 0.4) +
    line(spec.subtitle, "narrow", 100, 243, 15, house.ink, 176, 2) +
    `</svg>`
  );
}
