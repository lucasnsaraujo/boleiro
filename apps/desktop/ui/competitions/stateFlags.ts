import type { State } from "@boleiro/data/clubs";

// The field a state's shield shows under its chief, in the emblem's 160 x 160 box: x 20 to 140, y 48 to 154.
const [X, Y, W, H] = [20, 48, 120, 106];
const at = (fx: number, fy: number) => `${X + fx * W} ${Y + fy * H}`;

const rect = (fx: number, fy: number, fw: number, fh: number, fill: string) => `<rect x="${X + fx * W}" y="${Y + fy * H}" width="${fw * W}" height="${fh * H}" fill="${fill}"/>`;
const poly = (fill: string, ...points: [number, number][]) => `<path d="M${points.map(([fx, fy]) => at(fx, fy)).join(" L")}Z" fill="${fill}"/>`;
const circle = (fx: number, fy: number, r: number, fill: string) => `<circle cx="${X + fx * W}" cy="${Y + fy * H}" r="${r}" fill="${fill}"/>`;

function star(fx: number, fy: number, r: number, fill: string): string {
  const [cx, cy] = [X + fx * W, Y + fy * H];
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `<path d="M${points.join(" L")}Z" fill="${fill}"/>`;
}

/** `count` horizontal stripes cycling through `fills`. */
const stripes = (count: number, ...fills: string[]) => Array.from({ length: count }, (_, i) => rect(0, i / count, 1, 1 / count + 0.002, fills[i % fills.length] ?? "#FFFFFF")).join("");
const vertical = (...fills: string[]) => fills.map((fill, i) => rect(i / fills.length, 0, 1 / fills.length + 0.002, 1, fill)).join("");
const canton = (fill: string, fw = 0.42, fh = 0.5) => rect(0, 0, fw, fh, fill);
const diamond = (fill: string, size = 0.42) => poly(fill, [0.5, 0.5 - size], [0.5 + size, 0.5], [0.5, 0.5 + size], [0.5 - size, 0.5]);
const checker = (a: string, b: string, n = 4) =>
  Array.from({ length: n * n }, (_, i) => rect((i % n) / n, Math.floor(i / n) / n, 1 / n + 0.002, 1 / n + 0.002, ((i % n) + Math.floor(i / n)) % 2 === 0 ? a : b)).join("");

const GREEN = "#00843D";
const YELLOW = "#F7D116";
const BLUE = "#0033A0";
const RED = "#C8102E";
const WHITE = "#FFFFFF";
const BLACK = "#1A1A1A";

/**
 * Each state's flag as its federation's shield shows it: the flag's own layout simplified to its main shapes (stripes,
 * canton, diamond, triangle, band, star), its coat of arms and lettering left out.
 */
export const STATE_FLAG_FIELDS: Readonly<Record<State, string>> = {
  AC: poly(YELLOW, [0, 0], [1, 0], [0, 1]) + poly(GREEN, [1, 0], [1, 1], [0, 1]) + star(0.22, 0.24, 9, RED),
  AL: vertical(RED, WHITE, BLUE),
  AP: rect(0, 0, 1, 0.48, BLUE) + rect(0, 0.48, 1, 0.08, YELLOW) + rect(0, 0.56, 1, 0.44, GREEN) + rect(0, 0.62, 0.22, 0.16, BLACK),
  AM: stripes(3, WHITE, RED, WHITE) + canton(BLUE, 0.45, 0.48) + [0.12, 0.27, 0.42].flatMap((fx) => [0.14, 0.34].map((fy) => star(fx * 0.95, fy, 3.4, WHITE))).join(""),
  BA: stripes(8, WHITE, RED) + canton(BLUE, 0.42, 0.5) + poly(WHITE, [0.21, 0.08], [0.33, 0.4], [0.09, 0.4]),
  CE: rect(0, 0, 1, 1, GREEN) + diamond(YELLOW, 0.44) + circle(0.5, 0.5, 15, WHITE),
  DF: rect(0, 0, 1, 1, WHITE) + rect(0.27, 0.22, 0.46, 0.56, GREEN) + rect(0.46, 0.27, 0.08, 0.46, YELLOW) + rect(0.32, 0.46, 0.36, 0.08, YELLOW),
  ES: stripes(3, "#3A6FB7", WHITE, "#E8A2B4"),
  GO: stripes(8, GREEN, YELLOW) + canton(BLUE, 0.42, 0.5) + [[0.21, 0.12], [0.11, 0.25], [0.31, 0.25], [0.15, 0.39], [0.27, 0.39]].map(([fx, fy]) => star(fx ?? 0, fy ?? 0, 3.4, WHITE)).join(""),
  MA: stripes(9, RED, WHITE, BLACK) + canton(BLUE, 0.42, 0.45) + star(0.21, 0.22, 8, WHITE),
  MT: rect(0, 0, 1, 1, BLUE) + diamond(WHITE, 0.4) + circle(0.5, 0.5, 18, GREEN) + star(0.5, 0.5, 9, YELLOW),
  MS: poly(WHITE, [0, 0], [1, 0], [0, 1]) + poly(GREEN, [1, 0], [1, 1], [0, 1]) + poly(BLUE, [0.72, 0], [1, 0], [1, 0.12], [0.28, 1], [0, 1], [0, 0.88]) + star(0.24, 0.24, 8, YELLOW),
  MG: rect(0, 0, 1, 1, WHITE) + poly(RED, [0.5, 0.14], [0.8, 0.72], [0.2, 0.72]) + poly(WHITE, [0.5, 0.36], [0.64, 0.62], [0.36, 0.62]),
  PA: rect(0, 0, 1, 1, RED) + poly(WHITE, [0, 0.12], [0.12, 0], [1, 0.88], [0.88, 1]) + star(0.5, 0.5, 11, BLUE),
  PB: rect(0, 0, 0.36, 1, BLACK) + rect(0.36, 0, 0.64, 1, RED),
  PR: rect(0, 0, 1, 1, GREEN) + poly(WHITE, [0, 0.82], [0, 1], [0.1, 1], [1, 0.18], [1, 0], [0.9, 0]) + circle(0.5, 0.5, 17, BLUE) + star(0.5, 0.42, 3.2, WHITE),
  PE: rect(0, 0, 1, 0.62, BLUE) + rect(0, 0.62, 1, 0.38, WHITE) + circle(0.5, 0.42, 9, YELLOW) + star(0.5, 0.14, 6, YELLOW) + rect(0.46, 0.66, 0.08, 0.3, RED) + rect(0.38, 0.74, 0.24, 0.08, RED),
  PI: stripes(8, GREEN, YELLOW) + canton(BLUE, 0.42, 0.5) + star(0.21, 0.25, 8, WHITE),
  RJ: checker(BLUE, WHITE),
  RN: rect(0, 0, 1, 0.5, GREEN) + rect(0, 0.5, 1, 0.5, WHITE) + circle(0.5, 0.5, 13, YELLOW),
  RS: poly(GREEN, [0, 0], [0.62, 0], [0, 0.62]) + poly(RED, [0.62, 0], [1, 0], [1, 0.38], [0.38, 1], [0, 1], [0, 0.62]) + poly(YELLOW, [1, 0.38], [1, 1], [0.38, 1]),
  RO: rect(0, 0, 1, 0.5, BLUE) + poly(YELLOW, [0, 0.5], [1, 0.5], [0.5, 1]) + poly(GREEN, [0, 0.5], [0.5, 1], [0, 1]) + poly(GREEN, [1, 0.5], [1, 1], [0.5, 1]) + star(0.5, 0.3, 9, WHITE),
  RR: rect(0, 0, 1, 0.42, BLUE) + rect(0, 0.42, 1, 0.24, WHITE) + rect(0, 0.66, 1, 0.34, GREEN) + rect(0, 0.64, 1, 0.04, RED) + star(0.5, 0.26, 9, YELLOW),
  SC: stripes(3, RED, WHITE, RED) + diamond(GREEN, 0.3),
  SP: stripes(13, BLACK, WHITE) + canton(RED, 0.44, 0.54) + circle(0.22, 0.27, 9, WHITE) + circle(0.22, 0.27, 5, BLUE),
  SE: stripes(4, GREEN, YELLOW) + canton(BLUE, 0.42, 0.5) + [[0.21, 0.12], [0.1, 0.25], [0.32, 0.25], [0.15, 0.39], [0.27, 0.39]].map(([fx, fy]) => star(fx ?? 0, fy ?? 0, 3.4, WHITE)).join(""),
  TO: poly(BLUE, [0, 0], [0.7, 0], [0, 0.7]) + poly(WHITE, [0.7, 0], [1, 0], [1, 0.3], [0.3, 1], [0, 1], [0, 0.7]) + poly(YELLOW, [1, 0.3], [1, 1], [0.3, 1]) + circle(0.5, 0.5, 9, YELLOW),
};
