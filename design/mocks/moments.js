// Clock and drawing helpers for the career-moment mocks.
// Every animation is either a CSS animation, all started together when the scene is ready, or a tick function of the
// elapsed milliseconds. So `?t=1800` freezes that exact frame, `?t=end` the last one, and prefers-reduced-motion
// shows the last frame without playing anything.

const Moment = (() => {
  const ticks = [];
  let total = 0;
  let t0 = 0;
  let raf = 0;
  const query = new URLSearchParams(location.search);
  const isReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick(fn) { ticks.push(fn); }
  function frame(t) { for (const f of ticks) f(t); }
  function seek(t) {
    cancelAnimationFrame(raf);
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; });
    frame(t);
  }
  let isLooping = false;
  function loop() {
    const t = performance.now() - t0;
    frame(isLooping ? t : Math.min(t, total + 1000));
    if (isLooping || t < total + 1000) raf = requestAnimationFrame(loop);
  }
  function play() {
    document.getAnimations().forEach((a) => { a.currentTime = 0; a.play(); });
    t0 = performance.now();
    loop();
  }

  // Start the scene once fonts and images are in. `ms` is the length of the whole choreography; `keepTicking` keeps
  // the tick functions running after it, for sheets whose small animations loop.
  async function run(ms, keepTicking = false) {
    total = ms;
    isLooping = keepTicking && !isReduced;
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    document.body.classList.add('go');
    const at = query.get('t');
    if (at !== null) seek(at === 'end' ? total + 1000 : +at);
    else if (isReduced) seek(total + 1000);
    else play();
    document.querySelectorAll('[data-replay]').forEach((b) => b.addEventListener('click', play));
    document.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => seek(total + 1000)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') seek(total + 1000); });
    window.momentReady = true;
  }

  // ---------- Easing: the same curves as the tokens ----------
  function bezier(x1, y1, x2, y2) {
    const a = (p1, p2) => 1 - 3 * p2 + 3 * p1, b = (p1, p2) => 3 * p2 - 6 * p1, c = (p1) => 3 * p1;
    const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
    const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const s = slope(t, x1, x2); if (!s) break; t -= (at(t, x1, x2) - x) / s; }
      return at(t, y1, y2);
    };
  }
  const ease = {
    out: bezier(0.16, 1, 0.3, 1),
    inOut: bezier(0.65, 0, 0.35, 1),
    slap: bezier(0.34, 1.56, 0.64, 1),
    peel: bezier(0.5, 0, 0.75, 0),
    linear: (x) => x,
  };
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const span = (t, from, len) => clamp((t - from) / len);

  // A number that counts from `from` to `to` between `at` and `at + len`.
  function count(el, { from = 0, to, at, len, curve = ease.out, fmt = (n) => Math.round(n).toLocaleString('pt-BR') }) {
    tick((t) => { el.textContent = fmt(from + (to - from) * curve(span(t, at, len))); });
  }

  // Seeded random numbers, so every frame of a render is the same.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Canvas at device resolution.
  function canvas(el) {
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth, h = el.clientHeight;
    el.width = w * dpr; el.height = h * dpr;
    const g = el.getContext('2d');
    g.scale(dpr, dpr);
    return { g, w, h };
  }

  // Paper confetti in club colours. Each strip leaves `origin` with its own speed, falls under gravity with air drag
  // (closed form, so any frame can be computed directly), sways as it reaches terminal speed and flips in 3D.
  function confetti(el, { at, colors, count: n = 140, origin = [0.5, 0.4], spread = 1.1, speed = 900, seed = 7, life = 5200 }) {
    const { g, w, h } = canvas(el);
    const r = rng(seed);
    const k = 1.9, grav = 1400;
    const bits = Array.from({ length: n }, () => {
      const ang = -Math.PI / 2 + (r() - 0.5) * 2 * spread;
      const v = speed * (0.45 + r() * 0.75);
      return {
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, delay: r() * 140,
        w: 7 + r() * 7, h: 3 + r() * 3, spin: (r() - 0.5) * 9, flip: 4 + r() * 9, ph: r() * 6.28,
        sway: 14 + r() * 26, sw: 2 + r() * 3, c: colors[Math.floor(r() * colors.length)],
      };
    });
    const ox = origin[0] * w, oy = origin[1] * h;
    tick((t) => {
      g.clearRect(0, 0, w, h);
      for (const p of bits) {
        const s = (t - at - p.delay) / 1000;
        if (s <= 0 || s * 1000 > life) continue;
        const e = 1 - Math.exp(-k * s);
        const x = ox + (p.vx / k) * e + Math.sin(p.sw * s + p.ph) * p.sway * e;
        const y = oy + ((p.vy - grav / k) / k) * e + (grav / k) * s;
        if (y > h + 20) continue;
        const fade = clamp((life - s * 1000) / 600);
        const fl = Math.cos(p.flip * s + p.ph);
        g.save();
        g.translate(x, y);
        g.rotate(p.spin * s + p.ph);
        g.scale(1, Math.max(0.08, Math.abs(fl)));
        g.globalAlpha = fade;
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        if (fl < 0) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        g.restore();
      }
    });
  }

  // A halftone crowd: rows of printed dots in the club's colours. `stand(t)` returns 0..1 per column, so a wave of
  // people getting up can travel along the stand.
  function crowd(el, { colors, gap = 7, seed = 3, stand = () => 0, rise = 5, shade = 0 }) {
    const { g, w, h } = canvas(el);
    const r = rng(seed);
    const cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1;
    const dots = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      dots.push({ x: x * gap + (y % 2 ? gap / 2 : 0) + (r() - 0.5) * 2, y: y * gap + (r() - 0.5) * 2, c: colors[Math.floor(r() * colors.length)], s: 0.55 + r() * 0.4, col: x });
    }
    tick((t) => {
      g.clearRect(0, 0, w, h);
      for (const d of dots) {
        const up = stand(t, d.x / w, d.y / h);
        g.fillStyle = d.c;
        g.globalAlpha = 1 - shade * (1 - d.y / h);
        g.beginPath();
        g.arc(d.x, d.y - up * rise, (gap / 2) * d.s * (1 + up * 0.15), 0, 6.283);
        g.fill();
      }
      g.globalAlpha = 1;
    });
  }

  // A fan mosaic: one card per cell, drawn from text and stripes rendered off-screen at grid size. Each card flips
  // from its back (the plain stand colour) to its face when the wave reaches it.
  function mosaic(el, { cell = 8, draw, back = '#2A0E10', at, wave = 1800, flip = 340, dir = (x, y) => x * 0.8 + y * 0.2 }) {
    const { g, w, h } = canvas(el);
    const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
    let px = null;
    tick((t) => {
      if (!px) {
        const off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        const og = off.getContext('2d', { willReadFrequently: true });
        draw(og, cols, rows);
        px = og.getImageData(0, 0, cols, rows).data;
      }
      g.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const p = span(t, at + dir(x / cols, y / rows) * wave, flip);
        const sx = Math.abs(Math.cos(p * Math.PI));
        const face = p >= 0.5;
        g.fillStyle = face ? `rgb(${px[i]},${px[i + 1]},${px[i + 2]})` : back;
        const cw = (cell - 1) * Math.max(0.06, sx);
        g.fillRect(x * cell + (cell - cw) / 2, y * cell, cw, cell - 1);
      }
    });
  }

  return { run, tick, seek, ease, span, clamp, count, rng, canvas, confetti, crowd, mosaic };
})();
