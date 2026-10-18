import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../motion/reducedMotion.js";

type Strip = { x: number; y: number; vx: number; vy: number; w: number; h: number; spin: number; angle: number; flip: number; flipRate: number; sway: number; colour: string; shade: string };

const GRAVITY = 1500;
// Air drag per second: paper reaches its terminal speed of a few hundred pixels a second within half a second.
const DRAG = 2.6;
const SWAY = 70;
const LIFE_MS = 3200;

/** A colour a quarter darker: the back of the paper, in shade as it turns. */
function darker(hex: string): string {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * 0.72);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function burst(width: number, height: number, colours: readonly string[], count: number): Strip[] {
  return Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const speed = 900 + Math.random() * 700;
    // Two cannons at the page's lower corners, aimed up and in, 20 to 50 degrees off the vertical.
    const lean = 0.35 + Math.random() * 0.5;
    const colour = colours[i % colours.length] ?? "#FFCC00";
    return {
      x: fromLeft ? width * 0.08 : width * 0.92,
      y: height * 0.92,
      vx: (fromLeft ? 1 : -1) * Math.sin(lean) * speed,
      vy: -Math.cos(lean) * speed,
      w: 6 + Math.random() * 5,
      h: 10 + Math.random() * 9,
      spin: (Math.random() - 0.5) * 9,
      angle: Math.random() * Math.PI,
      flip: Math.random() * Math.PI * 2,
      flipRate: 7 + Math.random() * 9,
      sway: Math.random() * Math.PI * 2,
      colour,
      shade: darker(colour),
    };
  });
}

/**
 * Paper thrown up from the page's corners in the club's colours: each strip leaves with its own speed,
 * falls under gravity with air drag, sways once it slows, and turns over in 3D with its back printed
 * darker. Nothing with less motion asked for.
 */
export function PaperConfetti({ colours, count = 120 }: { colours: readonly string[]; count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element || prefersReducedMotion()) return;
    const context = element.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = element.getBoundingClientRect();
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    const strips = burst(width, height, colours, count);
    let last = performance.now();
    const start = last;
    let frame = requestAnimationFrame(function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const age = now - start;
      context.clearRect(0, 0, width, height);
      const fade = Math.min(1, Math.max(0, (LIFE_MS - age) / 600));
      for (const s of strips) {
        const drag = Math.exp(-DRAG * dt);
        s.vx *= drag;
        s.vy = s.vy * drag + GRAVITY * dt * drag;
        // Slowed down, a strip rocks from side to side as it falls.
        const slow = Math.max(0, 1 - Math.abs(s.vy) / 900);
        s.x += (s.vx + Math.sin(age / 260 + s.sway) * SWAY * slow) * dt;
        s.y += s.vy * dt;
        s.angle += s.spin * dt;
        s.flip += s.flipRate * dt;
        const turn = Math.cos(s.flip);
        context.save();
        context.globalAlpha = fade;
        context.translate(s.x, s.y);
        context.rotate(s.angle);
        context.scale(1, Math.max(0.08, Math.abs(turn)));
        context.fillStyle = turn >= 0 ? s.colour : s.shade;
        context.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        context.restore();
      }
      if (age < LIFE_MS) frame = requestAnimationFrame(step);
      else context.clearRect(0, 0, width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [colours, count]);

  return <canvas ref={canvas} className="ab-confetti" aria-hidden="true" />;
}
