/**
 * The career moments' motion, as functions of the milliseconds since a scene started: easing curves with the
 * Álbum tokens' shapes, and the canvas parts (paper confetti, a halftone crowd, a fan mosaic) drawn so any
 * frame can be computed directly. A skipped scene draws its last frame at once.
 */

export type Tick = (t: number) => void;

function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
  const c = (p1: number) => 3 * p1;
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (!s) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    return at(t, y1, y2);
  };
}

/** The tokens' curves: `out` for arrivals, `inOut` for walks and page turns, `slap` for stickers landing, `peel` for things falling away. */
export const ease = {
  out: bezier(0.16, 1, 0.3, 1),
  inOut: bezier(0.65, 0, 0.35, 1),
  slap: bezier(0.34, 1.56, 0.64, 1),
  peel: bezier(0.5, 0, 0.75, 0),
  cubicInOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};

export const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** How far `t` is through the stretch from `from` lasting `length` ms, 0 to 1. */
export const span = (t: number, from: number, length: number) => clamp((t - from) / length);

/** Seeded numbers, so every frame of a scene draws the same paper and the same crowd. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type Surface = { g: CanvasRenderingContext2D; w: number; h: number };

/** A canvas at the screen's resolution times the stage's scale, drawn in its own CSS pixels. */
export function surfaceOf(canvas: HTMLCanvasElement, scale: number): Surface | null {
  const g = canvas.getContext("2d");
  if (!g) return null;
  const ratio = (window.devicePixelRatio || 1) * scale;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { g, w, h };
}

export type ConfettiOptions = { at: number; colours: readonly string[]; count?: number; origin?: [number, number]; spread?: number; speed?: number; seed?: number; life?: number };

/**
 * Paper in the clubs' colours. Each strip leaves the origin with its own speed, falls under gravity with air
 * drag (in closed form, so any frame is computed directly), sways once it reaches its terminal speed and
 * turns over in 3D with its back printed darker. Paper, never sparkle.
 */
export function confetti({ g, w, h }: Surface, { at, colours, count = 140, origin = [0.5, 0.4], spread = 1.1, speed = 900, seed = 7, life = 5200 }: ConfettiOptions): Tick {
  const random = seeded(seed);
  const drag = 1.9;
  const gravity = 1400;
  const strips = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (random() - 0.5) * 2 * spread;
    const v = speed * (0.45 + random() * 0.75);
    return {
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      delay: random() * 140,
      w: 7 + random() * 7,
      h: 3 + random() * 3,
      spin: (random() - 0.5) * 9,
      flip: 4 + random() * 9,
      phase: random() * 6.28,
      sway: 14 + random() * 26,
      swayRate: 2 + random() * 3,
      colour: colours[Math.floor(random() * colours.length)] ?? "#FFCC00",
    };
  });
  const ox = origin[0] * w;
  const oy = origin[1] * h;
  return (t) => {
    g.clearRect(0, 0, w, h);
    for (const p of strips) {
      const s = (t - at - p.delay) / 1000;
      if (s <= 0 || s * 1000 > life) continue;
      const e = 1 - Math.exp(-drag * s);
      const x = ox + (p.vx / drag) * e + Math.sin(p.swayRate * s + p.phase) * p.sway * e;
      const y = oy + ((p.vy - gravity / drag) / drag) * e + (gravity / drag) * s;
      if (y > h + 20) continue;
      const turn = Math.cos(p.flip * s + p.phase);
      g.save();
      g.translate(x, y);
      g.rotate(p.spin * s + p.phase);
      g.scale(1, Math.max(0.08, Math.abs(turn)));
      g.globalAlpha = clamp((life - s * 1000) / 600);
      g.fillStyle = p.colour;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (turn < 0) {
        g.fillStyle = "rgba(0,0,0,.22)";
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      g.restore();
    }
  };
}

export type CrowdOptions = { colours: readonly string[]; gap?: number; seed?: number; rise?: number; shade?: number; stand?: (t: number, x: number, y: number) => number };

/** A halftone crowd: rows of printed dots in the club's colours; `stand` says how far up each spot is, so a wave can travel along the stand. */
export function crowd({ g, w, h }: Surface, { colours, gap = 7, seed = 3, rise = 5, shade = 0, stand = () => 0 }: CrowdOptions): Tick {
  const random = seeded(seed);
  const cols = Math.ceil(w / gap) + 1;
  const rows = Math.ceil(h / gap) + 1;
  const dots: { x: number; y: number; colour: string; size: number }[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      dots.push({ x: x * gap + (y % 2 ? gap / 2 : 0) + (random() - 0.5) * 2, y: y * gap + (random() - 0.5) * 2, colour: colours[Math.floor(random() * colours.length)] ?? "#333", size: 0.55 + random() * 0.4 });
    }
  return (t) => {
    g.clearRect(0, 0, w, h);
    for (const d of dots) {
      const up = stand(t, d.x / w, d.y / h);
      g.fillStyle = d.colour;
      g.globalAlpha = 1 - shade * (1 - d.y / h);
      g.beginPath();
      g.arc(d.x, d.y - up * rise, (gap / 2) * d.size * (1 + up * 0.15), 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
  };
}

export type MosaicOptions = { cell?: number; draw: (g: CanvasRenderingContext2D, cols: number, rows: number) => void; back?: string; at: number; wave?: number; flip?: number; direction?: (x: number, y: number) => number };

/**
 * A fan mosaic of cards: the face is drawn off-screen at one pixel per card; each card flips (scaled on X
 * through zero) from the stand's dark back to its face when the diagonal wave reaches it.
 */
export function mosaic({ g, w, h }: Surface, { cell = 8, draw, back = "#2A0E10", at, wave = 1800, flip = 340, direction = (x, y) => x * 0.8 + y * 0.2 }: MosaicOptions): Tick {
  const cols = Math.max(1, Math.floor(w / cell));
  const rows = Math.max(1, Math.floor(h / cell));
  let pixels: Uint8ClampedArray | null = null;
  return (t) => {
    if (!pixels) {
      const off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      const og = off.getContext("2d", { willReadFrequently: true });
      if (!og) return;
      draw(og, cols, rows);
      pixels = og.getImageData(0, 0, cols, rows).data;
    }
    g.clearRect(0, 0, w, h);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const p = span(t, at + direction(x / cols, y / rows) * wave, flip);
        const width = (cell - 1) * Math.max(0.06, Math.abs(Math.cos(p * Math.PI)));
        g.fillStyle = p >= 0.5 ? `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})` : back;
        g.fillRect(x * cell + (cell - width) / 2, y * cell, width, cell - 1);
      }
  };
}

/** A mosaic's face: the club's colours in hoops or a plain field, its words in the middle. */
export function mosaicFace(colours: { primary: string; secondary: string }, words: readonly string[], fontSize: number, hoops: number): (g: CanvasRenderingContext2D, w: number, h: number) => void {
  return (g, w, h) => {
    for (let y = 0; y < h; y++) {
      g.fillStyle = Math.floor(y / hoops) % 2 ? shadeOf(colours.primary) : colours.primary;
      g.fillRect(0, y, w, 1);
    }
    g.fillStyle = colours.primary;
    g.fillRect(Math.round(w * 0.03), 2, Math.round(w * 0.94), h - 4);
    g.fillStyle = readableOn(colours.primary, colours.secondary);
    g.font = `900 condensed ${fontSize}px Archivo`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lineHeight = fontSize * 1.05;
    words.forEach((line, index) => g.fillText(line, w / 2, h / 2 + 1 + (index - (words.length - 1) / 2) * lineHeight));
  };
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The colour a third darker: the shade between a mosaic's hoops. */
export function shadeOf(hex: string): string {
  const [r, g, b] = channels(hex);
  return `rgb(${Math.round(r * 0.62)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.62)})`;
}

const lightness = (hex: string) => {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** The club's second colour on its first when it reads, else white or ink. */
export function readableOn(background: string, preferred: string): string {
  if (Math.abs(lightness(background) - lightness(preferred)) > 0.35) return preferred;
  return lightness(background) > 0.6 ? "#14231A" : "#FFFFFF";
}

/** Colours for a club's paper and crowd: its two kit colours, a darker shade and white. */
export function clubPaper(colours: { primary: string; secondary: string }): string[] {
  return [colours.primary, colours.primary, colours.secondary, shadeOf(colours.primary), "#FFFFFF"];
}
