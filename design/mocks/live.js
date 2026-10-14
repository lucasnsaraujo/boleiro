// Live round board: your match as the hero band, every match of the round below (Brasfoot's soul).
// Row: [stadium, crowd, home, away, homeGoals, awayGoals, event, kind]
const ROUND = [
  { title: 'Brasileirão Série A · 30ª rodada', rows: [
    ['Maracanã', '61.832', 'FLA', 'PAL', 2, 1, ['gol', 'Pedro', "63'"], 'human'],
    ['Neo Química Arena', '44.120', 'COR', 'SAO', 1, 0, ['gol', 'Garro', "66'"], 'flash'],
    ['Arena do Grêmio', '50.004', 'GRE', 'INT', 0, 0, ['var', 'pênalti em Carlos Vinícius']],
    ['Arena MRV', '44.590', 'CAM', 'CRU', 1, 1, ['am', 'Lyanco', "64'"]],
    ['Nilton Santos', '38.201', 'BOT', 'FLU', 2, 0, ['gol', 'Arthur Cabral', "59'"]],
    ['Fonte Nova', '47.880', 'BAH', 'VIT', 3, 1, ['vm', 'Luan Cândido', "61'"]],
    ['Vila Belmiro', '15.420', 'SAN', 'VAS', 1, 2, ['gol', 'Andrés Gómez', "57'"]],
    ['Ligga Arena', '37.100', 'CAP', 'CFC', 1, 0, ['gol', 'Kevin Viveros', "34'"]],
    ['Nabi Abi Chedid', '9.870', 'RBB', 'MIR', 0, 1, ['pen', 'Alesson vai bater']],
    ['Arena Condá', '14.302', 'CHA', 'REM', 0, 0, null],
  ]},
  { title: 'Brasileirão Série B · 30ª rodada', rows: [
    ['Castelão', '52.310', 'FOR', 'CEA', 1, 1, ['gol', 'Paulo Baya', "55'"]],
    ['Ilha do Retiro', '22.400', 'SPT', 'NAU', 2, 0, null],
    ['Serrinha', '11.300', 'GOI', 'VNO', 0, 0, ['am', 'Lucas Lima', "48'"]],
    ['Alfredo Jaconi', '8.940', 'JUV', 'CRI', 1, 0, null],
    ['Independência', '7.650', 'AME', 'CUI', 0, 1, ['gol', 'Eliel', "62'"]],
    ['Ressacada', '9.120', 'AVA', 'PON', 2, 2, ['gol', 'Léo Gamalho', "66'"]],
    ['Rei Pelé', '18.770', 'CRB', 'NOV', 0, 0, null],
  ]},
];

function eventHTML(ev) {
  if (!ev) return '';
  const [k, who, min] = ev;
  if (k === 'gol') return `<i class="ph-fill ph-soccer-ball"></i>${who} <span class="mn">${min}</span>`;
  if (k === 'am') return `<span class="yc"></span>${who} <span class="mn">${min}</span>`;
  if (k === 'vm') return `<span class="rc"></span>Expulso: ${who} <span class="mn">${min}</span>`;
  if (k === 'var') return `<span class="var"><i class="ph-fill ph-monitor-play"></i>VAR</span>Checando ${who}`;
  if (k === 'pen') return `<span class="pen">Pênalti</span>${who}`;
  return '';
}

function renderLive({ os = 'mac', varPause = false } = {}) {
  const rows = ROUND.map((gp) => `<div class="g">${gp.title}</div>` + gp.rows.map(([st, pub, h, a, hg, ag, ev, kind]) => {
    const H = CLUBS[h], A = CLUBS[a];
    const box = (v, lead) => `<div class="sbox ${kind === 'flash' && lead ? 'lead' : ''}">${v}</div>`;
    const evh = (kind === 'flash' ? '<span class="gol">Gol</span>' : '') + eventHTML(varPause && kind === 'human' ? ['var', 'gol de Pedro'] : ev);
    return `<div class="r ${kind || ''}"><div class="std">${st} <span>· ${pub}</span></div>
      <div class="plate" style="background:${H.bg};color:${H.fg}">${crest(h, 17)}${H.n}</div>${box(hg, hg > ag)}${box(ag, ag > hg)}
      <div class="plate" style="background:${A.bg};color:${A.fg}">${crest(a, 17)}${A.n}</div><div class="ev">${evh}</div></div>`;
  }).join('')).join('');

  const clock = varPause
    ? `<span class="chip wait" style="height:24px"><i class="ph-fill ph-pause"></i>Pausado</span><div class="clock">2º tempo<span class="tr"><i style="width:72%"></i></span><b>VAR</b></div>`
    : `<div class="clock">2º tempo<span class="tr"><i style="width:74%"></i></span><b>67'</b></div>`;

  document.body.innerHTML = `<div class="app">
  ${chrome(os, 'Boleiro · Flamengo 2026')}
  <section class="cover ${varPause ? 'dim-hero' : ''}">
    <div class="ttl"><h3>Brasileirão Série A<span>30ª rodada · Dom, 25 out</span></h3>
      <div class="r">${clock}
        <div class="sp" title="Espaço pausa · 1 a 3 velocidade"><span class="${varPause ? 'on' : ''}"><i class="ph-fill ph-pause"></i></span><span>1×</span><span class="${varPause ? '' : 'on'}">2×</span><span>4×</span></div>
        <label class="mine">Só meus jogos<span class="sw"></span></label></div></div>
    <div class="feat">
      <div class="stad"><b>Maracanã</b>Público 61.832<br>Renda R$ 4,9 mi<div class="ref"><em>VAR</em>Árbitro Wilton Pereira Sampaio</div></div>
      <div class="mid">
        <div class="duel"><div class="stk tm h you">${crest('FLA', 54)}<b>Flamengo</b><small>Seu time</small></div><div class="sc">2<span>×</span>1</div><div class="stk tm a">${crest('PAL', 54)}<b>Palmeiras</b><small>Abel Ferreira</small></div></div>
        <div class="evs"><span><i class="ph-fill ph-soccer-ball"></i>Samuel Lino 18'</span><span><i class="ph-fill ph-soccer-ball"></i>Flaco López 41'</span><span class="last"><i class="ph-fill ph-soccer-ball"></i>Pedro 63'</span></div>
      </div>
      <div class="right">
        <div class="stats"><b>54%</b><em>posse de bola</em><b>46%</b><div class="pb"><i style="flex:54;background:#C8102E"></i><i style="flex:46;background:#006437"></i></div><b>11</b><em>finalizações</em><b>7</b><b>5/6</b><em>no gol / fora</em><b>3/4</b><b>14</b><em>desarmes</em><b>17</b></div>
        <button class="btn y"><i class="ph-bold ph-strategy"></i>Escalação<small>5 trocas</small></button>
      </div>
    </div>
    ${varPause ? `<div class="varstk"><div class="pz"><i class="ph-fill ph-monitor-play"></i></div><div><h2>VAR checando o gol</h2><p>Pedro, 63'. Possível impedimento de Samuel Lino.</p></div></div>` : ''}
  </section>
  <div class="list">${rows}</div>
</div>`;
}
