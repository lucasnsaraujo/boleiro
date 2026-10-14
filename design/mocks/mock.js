// Shared data and drawing helpers for the Boleiro mocks.
// Clubs carry their real crest (tm: assets/crests id, img: img/crests file) and kit colours for name plates.

const CLUBS = {
  FLA: { n: 'Flamengo', tm: 614, bg: '#C8102E', fg: '#FFFFFF' },
  PAL: { n: 'Palmeiras', tm: 1023, bg: '#006437', fg: '#FFFFFF' },
  COR: { n: 'Corinthians', tm: 199, bg: '#FFFFFF', fg: '#111111' },
  SAO: { n: 'São Paulo', tm: 585, bg: '#FFFFFF', fg: '#C8102E' },
  GRE: { n: 'Grêmio', tm: 210, bg: '#0D80BF', fg: '#FFFFFF' },
  INT: { n: 'Internacional', tm: 6600, bg: '#D00000', fg: '#FFFFFF' },
  CAM: { n: 'Atlético-MG', tm: 330, bg: '#111111', fg: '#FFFFFF' },
  CRU: { n: 'Cruzeiro', tm: 609, bg: '#1C3F94', fg: '#FFFFFF' },
  BOT: { n: 'Botafogo', tm: 537, bg: '#111111', fg: '#FFFFFF' },
  FLU: { n: 'Fluminense', tm: 2462, bg: '#7A1E3A', fg: '#FFFFFF' },
  BAH: { n: 'Bahia', tm: 10010, bg: '#0050A0', fg: '#FFFFFF' },
  VIT: { n: 'Vitória', tm: 2125, bg: '#C4161C', fg: '#FFFFFF' },
  SAN: { n: 'Santos', tm: 221, bg: '#FFFFFF', fg: '#111111' },
  VAS: { n: 'Vasco', tm: 978, bg: '#111111', fg: '#FFFFFF' },
  CAP: { n: 'Athletico-PR', tm: 679, bg: '#111111', fg: '#FF5A6A' },
  CFC: { n: 'Coritiba', tm: 776, bg: '#00543C', fg: '#FFFFFF' },
  RBB: { n: 'Bragantino', tm: 8793, bg: '#FFFFFF', fg: '#C8102E' },
  MIR: { n: 'Mirassol', tm: 3876, bg: '#FFE500', fg: '#0B6E2E' },
  CHA: { n: 'Chapecoense', tm: 17776, bg: '#00A651', fg: '#FFFFFF' },
  REM: { n: 'Remo', tm: 10997, bg: '#0A1F5C', fg: '#FFFFFF' },
  FOR: { n: 'Fortaleza', tm: 10870, bg: '#0A3A86', fg: '#FFFFFF' },
  CEA: { n: 'Ceará', tm: 2029, bg: '#FFFFFF', fg: '#111111' },
  SPT: { n: 'Sport', tm: 8718, bg: '#1A1A1A', fg: '#FF5A6A' },
  NAU: { n: 'Náutico', tm: 2646, bg: '#FFFFFF', fg: '#C8102E' },
  GOI: { n: 'Goiás', tm: 3197, bg: '#00693E', fg: '#FFFFFF' },
  VNO: { n: 'Vila Nova', tm: 5677, bg: '#C8102E', fg: '#FFFFFF' },
  JUV: { n: 'Juventude', tm: 10492, bg: '#00843D', fg: '#FFFFFF' },
  CRI: { n: 'Criciúma', tm: 7178, bg: '#FFD200', fg: '#111111' },
  AME: { n: 'América-MG', tm: 2863, bg: '#007A3D', fg: '#FFFFFF' },
  CUI: { n: 'Cuiabá', tm: 28022, bg: '#006B3F', fg: '#FFD100' },
  AVA: { n: 'Avaí', tm: 2035, bg: '#0066B3', fg: '#FFFFFF' },
  PON: { n: 'Ponte Preta', tm: 1134, bg: '#FFFFFF', fg: '#111111' },
  CRB: { n: 'CRB', tm: 11449, bg: '#D1121B', fg: '#FFFFFF' },
  NOV: { n: 'Novorizontino', tm: 37474, bg: '#FFD200', fg: '#111111' },
  OPE: { n: 'Operário-PR', tm: 27214, bg: '#FFFFFF', fg: '#111111' },
  ATH: { n: 'Athletic', tm: 64918, bg: '#111111', fg: '#FFFFFF' },
  BFS: { n: 'Botafogo-SP', tm: 9030, bg: '#FFFFFF', fg: '#111111' },
  SBE: { n: 'São Bernardo', tm: 16439, bg: '#FFE100', fg: '#111111' },
  EST: { n: 'Estudiantes', img: 'estudiantes.png', bg: '#FFFFFF', fg: '#D0021B' },
  UCA: { n: 'U. Católica', img: 'universidad-catolica.png', bg: '#FFFFFF', fg: '#0A3A86' },
  ROS: { n: 'Rosario Central', img: 'rosario-central.png', bg: '#0A3A86', fg: '#FFD100' },
  TOL: { n: 'Tolima', img: 'deportes-tolima.png', bg: '#8E1F2F', fg: '#FFD100' },
  IDV: { n: 'Ind. del Valle', img: 'independiente-del-valle.png', bg: '#111111', fg: '#FFFFFF' },
  IRV: { n: 'Ind. Rivadavia', img: 'independiente-rivadavia.png', bg: '#0A3A86', fg: '#FFFFFF' },
  PLA: { n: 'Platense', img: 'platense.png', bg: '#FFFFFF', fg: '#5B3A1E' },
  COQ: { n: 'Coquimbo', img: 'coquimbo-unido.png', bg: '#FFD100', fg: '#111111' },
  CER: { n: 'Cerro Porteño', img: 'cerro-porteno.png', bg: '#0A3A86', fg: '#FFFFFF' },
  LDU: { n: 'LDU Quito', img: 'ldu-quito.png', bg: '#FFFFFF', fg: '#1B3F9E' },
  DIM: { n: 'Ind. Medellín', img: 'independiente-medellin.png', bg: '#C8102E', fg: '#FFFFFF' },
  CUS: { n: 'Cusco', img: 'cusco.png', bg: '#FFD100', fg: '#111111' },
  DEF: { n: 'Defensor Sporting', img: 'defensor-sporting.png', bg: '#5B2C83', fg: '#FFFFFF' },
  BEN: { n: 'Benfica', img: 'benfica.png', bg: '#E30613', fg: '#FFFFFF' },
  AVL: { n: 'Aston Villa', img: 'aston-villa.png', bg: '#670E36', fg: '#FFFFFF' },
  ROM: { n: 'Roma', img: 'roma.png', bg: '#8E1F2F', fg: '#FFFFFF' },
  ZEN: { n: 'Zenit', img: 'zenit.png', bg: '#0A6FB7', fg: '#FFFFFF' },
  PSG: { n: 'PSG', img: 'psg.png', bg: '#0A2A5E', fg: '#FFFFFF' },
  ARS: { n: 'Arsenal', img: 'arsenal.png', bg: '#D0021B', fg: '#FFFFFF' },
  MCI: { n: 'Manchester City', img: 'manchester-city.png', bg: '#6CABDD', fg: '#0B2340' },
  NFO: { n: 'Nottingham Forest', img: 'nottingham-forest.png', bg: '#C8102E', fg: '#FFFFFF' },
  MUN: { n: 'Manchester United', img: 'manchester-united.png', bg: '#C8102E', fg: '#FFFFFF' },
  JUVE: { n: 'Juventus', img: 'juventus.png', bg: '#111111', fg: '#FFFFFF' },
  RMA: { n: 'Real Madrid', img: 'real-madrid.png', bg: '#FFFFFF', fg: '#3D195B' },
  BAR: { n: 'Barcelona', img: 'barcelona.png', bg: '#A50044', fg: '#FFFFFF' },
  CHE: { n: 'Chelsea', img: 'chelsea.png', bg: '#034694', fg: '#FFFFFF' },
  BRA: { n: 'Brasil', img: 'brasil.svg', bg: '#FFCC00', fg: '#0B4F27' },
  JPN: { n: 'Japão', img: 'japao.png', bg: '#FFFFFF', fg: '#BC002D' },
  SGP: { n: 'Singapura', img: 'singapura.png', bg: '#EF3340', fg: '#FFFFFF' },
  URU: { n: 'Uruguai', img: 'uruguai.png', bg: '#5CBFEB', fg: '#FFFFFF' },
};

// Flamengo's 27 players in data/players.csv: name, position, age and strength from there, value = market value
// (EUR) × 5,61, the ECB rate of 13 Oct 2026. Goals, assists and goals conceded are their real Série A 2026
// numbers after 30 rounds (ESPN). Energy, wages, traits and ratings are game state.
// [pos, name, side, strength, energy, wage, value, goals, traits, age, gc, assists, rating]
const SQUAD = [
  ['G', 'Rossi', 'D', 79, 100, '1,5 mi', '56 mi', 0, 'Ref/Col', 31, 25, 0, '7.0'],
  ['G', 'Andrew', 'D', 73, 100, '560 mil', '28 mi', 0, 'Ref/Sai', 25, 0, 0, '--'],
  ['G', 'Dyogo Alves', 'D', 67, 100, '150 mil', '2,2 mi', 0, 'Ref/Sai', 22, 0, 0, '--'],
  ['L', 'Emerson Royal', 'D', 74, 91, '1,2 mi', '28 mi', 0, 'Vel/Mar', 27, 0, 1, '6.7'],
  ['L', 'Varela', 'D', 73, 100, '980 mil', '5,6 mi', 1, 'Mar/Pas', 33, 0, 3, '6.8'],
  ['L', 'Ayrton Lucas', 'E', 75, 86, '1,1 mi', '22 mi', 0, 'Vel/Cru', 29, 0, 2, '6.9'],
  ['L', 'Alex Sandro', 'E', 70, 100, '1,7 mi', '5,6 mi', 0, 'Pas/Mar', 35, 0, 0, '6.7'],
  ['Z', 'Léo Ortiz', 'D', 80, 100, '1,7 mi', '67 mi', 1, 'Des/Pas', 30, 0, 1, '7.2'],
  ['Z', 'Léo Pereira', 'E', 80, 78, '1,6 mi', '67 mi', 2, 'Cab/Des', 30, 0, 1, '7.1'],
  ['Z', 'Vitão', 'D', 76, 100, '1,1 mi', '56 mi', 0, 'Des/Cab', 26, 0, 0, '6.8'],
  ['Z', 'Danilo', 'D', 71, 100, '2,1 mi', '8,4 mi', 1, 'Mar/Lid', 35, 0, 0, '6.8'],
  ['Z', 'João Souza', 'D', 66, 100, '120 mil', '4,5 mi', 0, 'Des/Cab', 19, 0, 0, '--'],
  ['M', 'Jorginho', 'D', 77, 100, '2,5 mi', '20 mi', 2, 'Pas/Lid', 34, 0, 3, '7.2'],
  ['M', 'Pulgar', 'D', 76, 92, '1,2 mi', '25 mi', 2, 'Des/Pas', 32, 0, 0, '6.8'],
  ['M', 'Evertton Araújo', 'D', 76, 100, '630 mil', '79 mi', 0, 'Des/Mar', 23, 0, 1, '6.9'],
  ['M', 'Paquetá', 'E', 80, 100, '4,9 mi', '151 mi', 6, 'Dri/Pas', 29, 0, 1, '7.4'],
  ['M', 'Carrascal', 'D', 78, 64, '2,2 mi', '84 mi', 6, 'Dri/Fin', 28, 0, 8, '7.4'],
  ['M', 'Arrascaeta', 'E', 78, 100, '3,1 mi', '79 mi', 3, 'Pas/Fin', 32, 0, 4, '7.3'],
  ['M', 'De la Cruz', 'E', 73, 100, '2,4 mi', '39 mi', 0, 'Pas/Des', 29, 0, 0, '6.6'],
  ['M', 'Saúl', 'D', 70, 100, '1,8 mi', '5,6 mi', 0, 'Pas/Mar', 31, 0, 1, '6.5'],
  ['A', 'Samuel Lino', 'E', 82, 97, '2,5 mi', '112 mi', 9, 'Vel/Dri', 26, 0, 7, '7.6'],
  ['A', 'Pedro', 'D', 76, 100, '2,7 mi', '123 mi', 16, 'Fin/Cab', 29, 0, 6, '7.5'],
  ['A', 'Plata', 'D', 76, 100, '1,3 mi', '50 mi', 2, 'Vel/Dri', 25, 0, 3, '6.8'],
  ['A', 'Luiz Araújo', 'D', 75, 100, '1,5 mi', '39 mi', 2, 'Dri/Vel', 30, 0, 1, '6.7'],
  ['A', 'Bruno Henrique', 'E', 69, 100, '2 mi', '4,2 mi', 2, 'Vel/Fin', 35, 0, 3, '6.7'],
  ['A', 'Anthony Valencia', 'D', 70, 100, '390 mil', '10 mi', 0, 'Vel/Dri', 23, 0, 0, '--'],
  ['A', 'Joaquín Freitas', 'D', 68, 100, '320 mil', '11 mi', 0, 'Fin/Vel', 19, 0, 1, '--'],
];

// ---------- Crests ----------
// Real badges: Brazilian clubs from the game's own assets/crests/{tm_id}.png, the rest from img/crests/.
// The white die-cut edge and the printed shadow come from .crest in album.css.
function crestSrc(code) {
  const c = CLUBS[code];
  return c.tm ? `../../assets/crests/${c.tm}.png` : `img/crests/${c.img}`;
}
function crest(code, size, cls = '') {
  const cut = size < 26 ? 1 : size < 50 ? 1.5 : 2.5;
  return `<img class="crest ${cls}" src="${crestSrc(code)}" width="${size}" height="${size}" style="--cut:${cut}px" alt="${CLUBS[code].n}">`;
}

// Real brand and competition marks from img/logos/ and img/competitions/, sized by height.
function logo(file, h, cls = '') {
  return `<img class="logo ${cls}" src="img/${file}" style="height:${h}px" alt="">`;
}

let __id = 0;

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
    return `<div class="chrome win"><img src="../logo/boleiro-icon-16.svg" width="16" height="16" alt=""><span class="ttl">${title}</span>
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
  const date = right ?? `<div class="date"><b>Dom, 18 out</b><span>Temporada 2026</span></div>`;
  return `<nav class="bar">${items}<div class="bar-r">${date}</div></nav>`;
}

// ---------- Declarative fills ----------
// <span data-crest="FLA" data-size="40"></span>, <span data-logo="logos/betano.svg" data-h="14"></span>, <span data-ball="24"></span>,
// <div data-chrome="mac" data-title="..."></div>, <div data-bar="times"></div>
function fill(root = document) {
  root.querySelectorAll('[data-chrome]').forEach((e) => { e.outerHTML = chrome(e.dataset.chrome, e.dataset.title || 'Boleiro'); });
  root.querySelectorAll('[data-bar]').forEach((e) => { e.outerHTML = topbar(e.dataset.bar, e.innerHTML.trim() || undefined); });
  root.querySelectorAll('[data-crest]').forEach((e) => { e.outerHTML = crest(e.dataset.crest, +(e.dataset.size || 20), e.className); });
  root.querySelectorAll('[data-logo]').forEach((e) => { e.outerHTML = logo(e.dataset.logo, +(e.dataset.h || 14), e.className); });
  root.querySelectorAll('[data-ball]').forEach((e) => { e.outerHTML = ball(+e.dataset.ball); });
}
document.addEventListener('DOMContentLoaded', () => fill());
