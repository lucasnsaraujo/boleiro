// Main hub (Brasfoot's team screen): club panel left, squad table right.
function renderHub(os) {
  const flags = { Arrascaeta: '<i class="ph-fill ph-first-aid flag inj" title="Fratura no punho · volta em novembro"></i>', Danilo: '<i class="ph-bold ph-hourglass-medium flag ctr" title="Contrato acaba em dez"></i>' };
  const rows = SQUAD.map((r) => {
    const [p, n, l, f, e, sal, val, g, car, age, gc, a, nm] = r;
    const sel = n === 'Samuel Lino';
    const en = e < 70 ? 'low' : e < 85 ? 'mid' : '';
    return `<tr class="${sel ? 'sel' : ''}"><td class="l"><span class="pos ${p}">${p}</span></td><td class="l nm">${n}${flags[n] || ''}</td><td class="dim">${l}</td><td style="font-weight:800">${f}</td><td class="l"><span class="en ${en}"><i style="width:${e}%"></i></span>${e}%</td><td>${sal}</td><td>${val}</td><td>${g}</td><td class="l dim">${car}</td><td class="${age >= 33 ? 'old' : age <= 21 ? 'young' : ''}">${age}</td><td>${gc}</td><td>${a}</td><td class="dim">${nm}</td></tr>`;
  }).join('');

  document.body.innerHTML = `<div class="app">
  ${chrome(os, 'Boleiro · Flamengo 2026')}
  ${topbar('times')}
  <main><div class="hub">
    <div class="side">
      <div class="stk club">${crest('FLA', 58)}<div><h1>Flamengo</h1><p>Técnico <b>Lucas Araujo</b><br>Série A · 1º lugar · 64 pts</p></div><span class="spon" title="Patrocínio master">${logo('logos/betano.svg', 11)}</span></div>
      <div class="stk money"><div class="big"><span class="lbl">Caixa</span><b>R$ 212,4 mi</b></div>
        <div><div class="lbl">Diretoria · 92%</div><div class="meter"><i style="width:92%"></i></div></div>
        <div><div class="lbl">Torcida · 74%</div><div class="meter"><i style="width:74%"></i></div></div></div>
      <div class="stk next"><div class="lbl">Próximo jogo · 31ª rodada</div><div class="m">${crest('BAH', 34)}<div><b>Bahia</b><p>Fora · 18h30</p></div></div>
        <div class="odds" title="Odds do patrocinador"><em>${logo('logos/betano.svg', 9)}</em><span>BAH<b>3,10</b></span><span>X<b>3,25</b></span><span>FLA<b>2,30</b></span></div></div>
      <button class="btn y esc"><i class="ph-bold ph-strategy"></i>Escalar time</button>
      <div class="stk card"><div class="top">${crest('FLA', 34)}<div><b>Samuel Lino</b><span>Atacante · lado esquerdo · 26</span></div><span class="num">82</span></div>
        <div class="body"><div class="kv"><span>Contrato</span><b>até dez 2029</b><span>Passe</span><b>R$ 112 mi</b><span>Salário</span><b>R$ 2,5 mi</b><span>Car.</span><b>Velocidade / Drible</b></div>
        <table class="st"><tr><th></th><th>Série A</th><th>Carreira</th><th>Fla</th></tr><tr><td>Jogos</td><td>29</td><td>337</td><td>79</td></tr><tr><td>Gols</td><td>9</td><td>67</td><td>16</td></tr><tr><td>Assist.</td><td>7</td><td>40</td><td>16</td></tr></table></div></div>
      <div class="dock">
        <a title="Finanças"><i class="ph-bold ph-coins"></i>Finanças</a>
        <a title="Patrocínios"><i class="ph-bold ph-handshake"></i>Patrocínio</a>
        <a title="Auxiliar técnico"><i class="ph-bold ph-user-switch"></i>Auxiliar</a>
        <a title="Entrosamento"><i class="ph-bold ph-users-three"></i>Entrosamento</a>
        <a title="Jornal da rodada"><i class="ph-bold ph-newspaper"></i>Jornal<span class="badge">3</span></a>
        <div class="cnt"><b>27/35</b><span>elenco</span></div>
      </div>
    </div>
    <div class="page tbl"><table class="tb"><thead><tr><th class="l" style="width:42px">P</th><th class="l">Nome</th><th>L</th><th>F</th><th class="l">Energia</th><th>Salário</th><th>Passe</th><th>G</th><th class="l">Car.</th><th>Idade</th><th>GC</th><th>A</th><th>NM</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></main>
</div>`;
}
