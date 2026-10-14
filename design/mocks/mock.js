// Shared data and drawing helpers for the Boleiro mocks.
// Clubs use their real kit colours; crests are generic shapes in those colours, not real badges.
// Squads and ages come from data/players.csv (2026 Série A–D); wages and season stats are illustrative.

const CLUBS = {
  FLA: { n: 'Flamengo', c1: '#C8102E', c2: '#111111', p: 'hstripes', bg: '#C8102E', fg: '#FFFFFF', st: 'Maracanã' },
  PAL: { n: 'Palmeiras', c1: '#006437', c2: '#FFFFFF', p: 'solid', bg: '#006437', fg: '#FFFFFF', st: 'Allianz Parque' },
  COR: { n: 'Corinthians', c1: '#FFFFFF', c2: '#111111', p: 'band', bg: '#FFFFFF', fg: '#111111', st: 'Neo Química Arena' },
  SAO: { n: 'São Paulo', c1: '#FFFFFF', c2: '#D0021B', c3: '#111111', p: 'band', bg: '#FFFFFF', fg: '#C8102E', st: 'MorumBIS' },
  GRE: { n: 'Grêmio', c1: '#0D80BF', c2: '#111111', c3: '#FFFFFF', p: 'vstripes', bg: '#0D80BF', fg: '#FFFFFF', st: 'Arena do Grêmio' },
  INT: { n: 'Internacional', c1: '#D00000', c2: '#FFFFFF', p: 'solid', bg: '#D00000', fg: '#FFFFFF', st: 'Beira-Rio' },
  CAM: { n: 'Atlético-MG', c1: '#111111', c2: '#FFFFFF', p: 'vstripes', bg: '#111111', fg: '#FFFFFF', st: 'Arena MRV' },
  CRU: { n: 'Cruzeiro', c1: '#1C3F94', c2: '#FFFFFF', p: 'stars', bg: '#1C3F94', fg: '#FFFFFF', st: 'Mineirão' },
  BOT: { n: 'Botafogo', c1: '#111111', c2: '#FFFFFF', p: 'star', bg: '#111111', fg: '#FFFFFF', st: 'Nilton Santos' },
  FLU: { n: 'Fluminense', c1: '#7A1E3A', c2: '#FFFFFF', c3: '#00694A', p: 'tri', bg: '#7A1E3A', fg: '#FFFFFF', st: 'Maracanã' },
  BAH: { n: 'Bahia', c1: '#0050A0', c2: '#E30613', c3: '#FFFFFF', p: 'halves', bg: '#0050A0', fg: '#FFFFFF', st: 'Fonte Nova' },
  VIT: { n: 'Vitória', c1: '#C4161C', c2: '#111111', p: 'hstripes', bg: '#C4161C', fg: '#FFFFFF', st: 'Barradão' },
  SAN: { n: 'Santos', c1: '#FFFFFF', c2: '#111111', p: 'vstripes', bg: '#FFFFFF', fg: '#111111', st: 'Vila Belmiro' },
  VAS: { n: 'Vasco', c1: '#111111', c2: '#FFFFFF', c3: '#D0021B', p: 'sash', bg: '#111111', fg: '#FFFFFF', st: 'São Januário' },
  CAP: { n: 'Athletico-PR', c1: '#B8001F', c2: '#111111', p: 'hstripes', bg: '#111111', fg: '#FF5A6A', st: 'Ligga Arena' },
  CFC: { n: 'Coritiba', c1: '#00543C', c2: '#FFFFFF', p: 'hstripes', bg: '#00543C', fg: '#FFFFFF', st: 'Couto Pereira' },
  RBB: { n: 'Bragantino', c1: '#FFFFFF', c2: '#C8102E', p: 'chevron', bg: '#FFFFFF', fg: '#C8102E', st: 'Nabi Abi Chedid' },
  MIR: { n: 'Mirassol', c1: '#FFE500', c2: '#0B6E2E', p: 'solid', bg: '#FFE500', fg: '#0B6E2E', st: 'Maião' },
  CHA: { n: 'Chapecoense', c1: '#00A651', c2: '#FFFFFF', p: 'solid', bg: '#00A651', fg: '#FFFFFF', st: 'Arena Condá' },
  REM: { n: 'Remo', c1: '#0A1F5C', c2: '#FFFFFF', p: 'solid', bg: '#0A1F5C', fg: '#FFFFFF', st: 'Baenão' },
  FOR: { n: 'Fortaleza', c1: '#0A3A86', c2: '#D0021B', c3: '#FFFFFF', p: 'hstripes', bg: '#0A3A86', fg: '#FFFFFF', st: 'Castelão' },
  CEA: { n: 'Ceará', c1: '#111111', c2: '#FFFFFF', p: 'vstripes', bg: '#FFFFFF', fg: '#111111', st: 'Castelão' },
  SPT: { n: 'Sport', c1: '#C8102E', c2: '#111111', p: 'hstripes', bg: '#1A1A1A', fg: '#FF5A6A', st: 'Ilha do Retiro' },
  NAU: { n: 'Náutico', c1: '#FFFFFF', c2: '#C8102E', p: 'vstripes', bg: '#FFFFFF', fg: '#C8102E', st: 'Aflitos' },
  GOI: { n: 'Goiás', c1: '#00693E', c2: '#FFFFFF', p: 'solid', bg: '#00693E', fg: '#FFFFFF', st: 'Serrinha' },
  VNO: { n: 'Vila Nova', c1: '#C8102E', c2: '#FFFFFF', p: 'solid', bg: '#C8102E', fg: '#FFFFFF', st: 'OBA' },
  JUV: { n: 'Juventude', c1: '#00843D', c2: '#FFFFFF', p: 'vstripes', bg: '#00843D', fg: '#FFFFFF', st: 'Alfredo Jaconi' },
  CRI: { n: 'Criciúma', c1: '#FFD200', c2: '#111111', p: 'vstripes', bg: '#FFD200', fg: '#111111', st: 'Heriberto Hülse' },
  AME: { n: 'América-MG', c1: '#007A3D', c2: '#111111', p: 'sash', bg: '#007A3D', fg: '#FFFFFF', st: 'Independência' },
  CUI: { n: 'Cuiabá', c1: '#006B3F', c2: '#FFD100', p: 'halves', bg: '#006B3F', fg: '#FFD100', st: 'Arena Pantanal' },
  AVA: { n: 'Avaí', c1: '#0066B3', c2: '#FFFFFF', p: 'vstripes', bg: '#0066B3', fg: '#FFFFFF', st: 'Ressacada' },
  PON: { n: 'Ponte Preta', c1: '#FFFFFF', c2: '#111111', p: 'sash', bg: '#FFFFFF', fg: '#111111', st: 'Moisés Lucarelli' },
  CRB: { n: 'CRB', c1: '#D1121B', c2: '#FFFFFF', p: 'hstripes', bg: '#D1121B', fg: '#FFFFFF', st: 'Rei Pelé' },
  NOV: { n: 'Novorizontino', c1: '#FFD200', c2: '#111111', p: 'solid', bg: '#FFD200', fg: '#111111', st: 'Jorjão' },
  RIV: { n: 'River Plate', c1: '#FFFFFF', c2: '#E30613', p: 'sash', bg: '#FFFFFF', fg: '#E30613', st: 'Monumental' },
  BOC: { n: 'Boca Juniors', c1: '#003C8F', c2: '#FFD100', p: 'band', bg: '#003C8F', fg: '#FFD100', st: 'La Bombonera' },
  PEN: { n: 'Peñarol', c1: '#FFD100', c2: '#111111', p: 'vstripes', bg: '#111111', fg: '#FFD100', st: 'Campeón del Siglo' },
  LDU: { n: 'LDU Quito', c1: '#FFFFFF', c2: '#1B3F9E', c3: '#D0021B', p: 'band', bg: '#FFFFFF', fg: '#1B3F9E', st: 'Rodrigo Paz Delgado' },
  BOL: { n: 'Bolívar', c1: '#5BB4E5', c2: '#FFFFFF', p: 'solid', bg: '#5BB4E5', fg: '#0B2340', st: 'Hernando Siles' },
  CCO: { n: 'Colo-Colo', c1: '#FFFFFF', c2: '#111111', p: 'solid', bg: '#FFFFFF', fg: '#111111', st: 'Monumental David Arellano' },
  BRA: { n: 'Brasil', c1: '#FFCC00', c2: '#0B7A3B', c3: '#1B3F9E', p: 'solid', bg: '#FFCC00', fg: '#0B4F27', st: 'Maracanã' },
};

// Flamengo 2026 (real squad). [pos, name, side, strength, energy, wage, value, goals, traits, age, gc, assists, rating, flag]
const SQUAD = [
  ['G', 'Rossi', 'D', 79, 100, '420 mil', '60 mi', 0, 'Ref/Col', 31, 24, 0, '7.0'],
  ['G', 'Andrew', 'D', 73, 100, '160 mil', '30 mi', 0, 'Ref/Sai', 25, 4, 0, '6.6'],
  ['L', 'Emerson Royal', 'D', 74, 91, '350 mil', '30 mi', 1, 'Vel/Mar', 27, 0, 3, '6.8'],
  ['L', 'Varela', 'D', 73, 100, '280 mil', '6 mi', 1, 'Mar/Pas', 33, 0, 4, '6.8'],
  ['L', 'Ayrton Lucas', 'E', 75, 86, '310 mil', '24 mi', 2, 'Vel/Cru', 29, 0, 5, '7.0'],
  ['L', 'Alex Sandro', 'E', 70, 100, '480 mil', '6 mi', 0, 'Pas/Mar', 35, 0, 1, '6.7'],
  ['Z', 'Léo Ortiz', 'D', 80, 100, '480 mil', '72 mi', 2, 'Des/Pas', 30, 0, 1, '7.2'],
  ['Z', 'Léo Pereira', 'E', 80, 78, '450 mil', '72 mi', 3, 'Cab/Des', 30, 0, 0, '7.1'],
  ['Z', 'Vitão', 'D', 76, 100, '300 mil', '60 mi', 0, 'Des/Cab', 26, 0, 0, '6.9'],
  ['Z', 'Danilo', 'D', 71, 100, '600 mil', '9 mi', 1, 'Mar/Lid', 35, 0, 1, '6.8'],
  ['M', 'Jorginho', 'D', 77, 100, '720 mil', '21 mi', 2, 'Pas/Lid', 34, 0, 6, '7.3'],
  ['M', 'Pulgar', 'D', 76, 92, '330 mil', '27 mi', 1, 'Des/Pas', 32, 0, 2, '6.8'],
  ['M', 'Evertton Araújo', 'D', 76, 100, '180 mil', '84 mi', 1, 'Des/Mar', 23, 0, 1, '6.9'],
  ['M', 'Paquetá', 'E', 80, 100, '1,4 mi', '162 mi', 6, 'Dri/Pas', 29, 0, 7, '7.6'],
  ['M', 'Carrascal', 'D', 78, 64, '620 mil', '90 mi', 7, 'Dri/Fin', 28, 0, 13, '7.5'],
  ['M', 'Arrascaeta', 'E', 78, 100, '890 mil', '84 mi', 5, 'Pas/Fin', 32, 0, 7, '7.4'],
  ['M', 'De la Cruz', 'E', 73, 100, '690 mil', '42 mi', 0, 'Pas/Des', 29, 0, 2, '6.7'],
  ['A', 'Samuel Lino', 'E', 82, 97, '700 mil', '120 mi', 9, 'Vel/Dri', 26, 0, 7, '7.8'],
  ['A', 'Pedro', 'D', 76, 100, '760 mil', '132 mi', 11, 'Fin/Cab', 29, 0, 2, '7.3'],
  ['A', 'Plata', 'D', 76, 100, '380 mil', '54 mi', 4, 'Vel/Dri', 25, 0, 4, '7.0'],
  ['A', 'Luiz Araújo', 'D', 75, 100, '420 mil', '42 mi', 2, 'Dri/Vel', 30, 0, 3, '6.9'],
  ['A', 'Bruno Henrique', 'E', 69, 71, '560 mil', '4,5 mi', 3, 'Vel/Fin', 35, 0, 2, '6.8'],
  ['A', 'Joaquín Freitas', 'D', 68, 100, '90 mil', '12 mi', 0, 'Fin/Vel', 19, 0, 0, '--'],
];

// ---------- Crests ----------
let __id = 0;
function star(cx, cy, r, fill) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`; }
  return `<path d="${d}Z" fill="${fill}"/>`;
}
function patternSVG(c, w, h) {
  const c2 = c.c2, c3 = c.c3 || c.c2;
  switch (c.p) {
    case 'hstripes': { let s = `<rect width="${w}" height="${h}" fill="${c.c1}"/>`; for (let y = h / 7; y < h; y += (2 * h) / 7) s += `<rect y="${y}" width="${w}" height="${h / 7}" fill="${c2}"/>`; return s; }
    case 'vstripes': { let s = `<rect width="${w}" height="${h}" fill="${c.c1}"/>`; for (let x = w / 7; x < w; x += (2 * w) / 7) s += `<rect x="${x}" width="${w / 7}" height="${h}" fill="${c2}"/>`; if (c.c3) s += `<rect x="${w * 3 / 7}" width="${w / 7}" height="${h}" fill="${c.c3}"/>`; return s; }
    case 'band': return `<rect width="${w}" height="${h}" fill="${c.c1}"/><rect y="${h * 0.36}" width="${w}" height="${h * 0.12}" fill="${c2}"/><rect y="${h * 0.48}" width="${w}" height="${h * 0.12}" fill="${c3}"/>`;
    case 'sash': return `<rect width="${w}" height="${h}" fill="${c.c1}"/><path d="M0 ${h * 0.2} L${w * 0.2} 0 L${w} ${h * 0.8} L${w * 0.8} ${h} Z" fill="${c2}"/>${c.c3 ? `<path d="M${w * 0.62} ${h * 0.36} h${w * 0.14} v${h * 0.06} h-${w * 0.14}z M${w * 0.66} ${h * 0.31} h${w * 0.06} v${h * 0.16} h-${w * 0.06}z" fill="${c.c3}"/>` : ''}`;
    case 'halves': return `<rect width="${w}" height="${h}" fill="${c.c1}"/><rect x="${w / 2}" width="${w / 2}" height="${h}" fill="${c2}"/>${c.c3 ? `<rect y="${h * 0.42}" width="${w}" height="${h * 0.16}" fill="${c.c3}"/>` : ''}`;
    case 'tri': return `<rect width="${w}" height="${h}" fill="${c.c1}"/><rect x="${w / 3}" width="${w / 3}" height="${h}" fill="${c2}"/><rect x="${(2 * w) / 3}" width="${w / 3}" height="${h}" fill="${c3}"/>`;
    case 'chevron': return `<rect width="${w}" height="${h}" fill="${c.c1}"/><path d="M0 ${h * 0.3} L${w / 2} ${h * 0.62} L${w} ${h * 0.3} L${w} ${h * 0.5} L${w / 2} ${h * 0.82} L0 ${h * 0.5} Z" fill="${c2}"/>`;
    case 'star': return `<rect width="${w}" height="${h}" fill="${c.c1}"/>${star(w / 2, h * 0.47, w * 0.26, c2)}`;
    case 'stars': return `<rect width="${w}" height="${h}" fill="${c.c1}"/>${star(w * 0.5, h * 0.25, w * 0.1, c2)}${star(w * 0.3, h * 0.45, w * 0.1, c2)}${star(w * 0.7, h * 0.45, w * 0.1, c2)}${star(w * 0.42, h * 0.66, w * 0.08, c2)}${star(w * 0.58, h * 0.66, w * 0.08, c2)}`;
    default: return `<rect width="${w}" height="${h}" fill="${c.c1}"/><circle cx="${w / 2}" cy="${h * 0.46}" r="${w * 0.18}" fill="none" stroke="${c2}" stroke-width="${w * 0.06}"/>`;
  }
}
// style: 'round' (default, sticker disc) | 'shield'
function crest(code, size, style = 'round', ring = '#FFFFFF') {
  const c = CLUBS[code]; const id = 'cr' + (++__id);
  if (style === 'shield') {
    const s = 'M2 1.5 H22 V13 C22 20 16.5 24.5 12 27 C7.5 24.5 2 20 2 13 Z';
    return `<svg class="crest" width="${Math.round(size * 24 / 28)}" height="${size}" viewBox="0 0 24 28"><defs><clipPath id="${id}"><path d="${s}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs><g clip-path="url(#${id})">${patternSVG(c, 24, 28)}<rect width="24" height="28" fill="url(#${id}g)"/></g><path d="${s}" fill="none" stroke="${ring}" stroke-width="1.4"/></svg>`;
  }
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 28 28"><defs><clipPath id="${id}"><circle cx="14" cy="14" r="11"/></clipPath></defs><circle cx="14" cy="14.6" r="13.6" fill="rgba(20,35,26,.18)"/><circle cx="14" cy="14" r="13.6" fill="${ring}"/><g clip-path="url(#${id})"><g transform="translate(3 3)">${patternSVG(c, 22, 22)}</g></g><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".6"/></svg>`;
}

// ---------- Ball ----------
function pent(cx, cy, r, rot) {
  let d = '';
  for (let i = 0; i < 5; i++) { const a = rot + (i * 2 * Math.PI) / 5; d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`; }
  return d + 'Z';
}
function ball(size, ink = '#14231A') {
  const id = 'b' + (++__id), cx = 50, cy = 50, R = 48, rot = -Math.PI / 2, pr = R * 0.3;
  let patches = `<path d="${pent(cx, cy, pr, rot)}" fill="${ink}"/>`, seams = '';
  const outer = [];
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * 2 * Math.PI) / 5, oa = a + Math.PI / 5, ox = cx + R * Math.cos(oa), oy = cy + R * Math.sin(oa), orot = oa + Math.PI;
    patches += `<path d="${pent(ox, oy, R * 0.29, orot)}" fill="${ink}"/>`;
    const vs = []; for (let k = 0; k < 5; k++) { const b = orot + (k * 2 * Math.PI) / 5; vs.push([ox + R * 0.29 * Math.cos(b), oy + R * 0.29 * Math.sin(b)]); }
    outer.push(vs);
  }
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * 2 * Math.PI) / 5, vx = cx + pr * Math.cos(a), vy = cy + pr * Math.sin(a), sx = cx + R * 0.62 * Math.cos(a), sy = cy + R * 0.62 * Math.sin(a);
    seams += `M${vx.toFixed(2)} ${vy.toFixed(2)}L${sx.toFixed(2)} ${sy.toFixed(2)}`;
    for (const vs of [outer[i], outer[(i + 4) % 5]]) {
      let best = vs[0], bd = 1e9; for (const v of vs) { const d = (v[0] - sx) ** 2 + (v[1] - sy) ** 2; if (d < bd) { bd = d; best = v; } }
      seams += `M${sx.toFixed(2)} ${sy.toFixed(2)}L${best[0].toFixed(2)} ${best[1].toFixed(2)}`;
    }
  }
  return `<svg class="ball" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="48"/></clipPath><radialGradient id="${id}s" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".65" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="#fff"/><g clip-path="url(#${id})">${patches}<path d="${seams}" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="50" cy="50" r="48" fill="url(#${id}s)"/></g></svg>`;
}

// ---------- Window chrome ----------
function chrome(os, title) {
  if (os === 'win') {
    return `<div class="chrome win"><img src="../logo/boleiro-icon-small.svg" width="16" height="16" alt=""><span class="ttl">${title}</span>
      <span class="caps"><span class="cap"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor"/></svg></span><span class="cap"><svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor"/></svg></span><span class="cap x"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor"/></svg></span></span></div>`;
  }
  return `<div class="chrome mac"><span class="lights"><i></i><i></i><i></i></span><span class="ttl">${title}</span></div>`;
}

// ---------- Top bar (Brasfoot's nine buttons) ----------
const NAV = [
  ['agenda', 'ph-calendar-dots', 'Agenda'], ['tabelas', 'ph-table', 'Tabelas'], ['estadio', 'ph-ticket', 'Estádio'],
  ['base', 'ph-plant', 'Base'], ['times', 'ph-t-shirt', 'Times'], ['busca', 'ph-magnifying-glass', 'Busca'],
  ['tecnicos', 'ph-chalkboard-teacher', 'Técnicos'], ['historico', 'ph-book-open-text', 'Histórico'], ['opcoes', 'ph-gear-six', 'Opções'],
];
function topbar(active, right) {
  const items = NAV.map(([k, ic, l], i) => k === active
    ? `<a class="ic on" title="F${i + 1}"><span><i class="ph-fill ${ic}"></i>${l}</span></a>`
    : `<a class="ic" title="F${i + 1}"><i class="ph-bold ${ic}"></i>${l}</a>`).join('');
  const date = right ?? `<div class="date"><b>Dom, 25 out</b><span>Temporada 2026</span></div>`;
  return `<nav class="bar">${items}<div class="bar-r">${date}</div></nav>`;
}

// ---------- Declarative fills ----------
// <span data-crest="FLA" data-size="40" data-style="shield"></span>, <span data-ball="24"></span>,
// <div data-chrome="mac" data-title="..."></div>, <div data-bar="times"></div>
function fill(root = document) {
  root.querySelectorAll('[data-chrome]').forEach((e) => { e.outerHTML = chrome(e.dataset.chrome, e.dataset.title || 'Boleiro'); });
  root.querySelectorAll('[data-bar]').forEach((e) => { e.outerHTML = topbar(e.dataset.bar, e.innerHTML.trim() || undefined); });
  root.querySelectorAll('[data-crest]').forEach((e) => { e.outerHTML = crest(e.dataset.crest, +(e.dataset.size || 20), e.dataset.style || 'round', e.dataset.ring || '#FFFFFF'); });
  root.querySelectorAll('[data-ball]').forEach((e) => { e.outerHTML = ball(+e.dataset.ball); });
}
document.addEventListener('DOMContentLoaded', () => fill());
