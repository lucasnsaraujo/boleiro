import { addDays } from "../../dates.js";
import { tierOf } from "../../finances/tierOf.js";
import type { EventType } from "../eventType.js";
import { byStrength, finance, isRun, marginToday, mood, nextMatch, pickFrom, playedToday, playerCast, playsWithin, regulars, rivalNext, round, winless } from "./sceneReaders.js";

/** The supporters: the stands, the organised groups, the streets and the club's social media. */
export const FAN_EVENTS: readonly EventType[] = [
  {
    id: "fans-protest-ct",
    area: "fans",
    topic: "fans",
    weight: (scene) => (mood(scene).fans < 25 ? 3 : 1.5),
    cooldownDays: 30,
    cast: (scene) => (mood(scene).fans < 35 ? {} : null),
    setting: "No portão do CT",
    texts: [
      { headline: "Torcida protesta no CT do {club}", body: "Uns cem torcedores com faixas esperam no portão. Querem falar com o técnico e com os jogadores." },
      { headline: "Organizada cobra o elenco do {club}", body: "“Time sem vergonha!”, gritavam na entrada do treino. Há uma comissão pedindo para entrar." },
      { headline: "Faixas e cobrança na porta do CT do {club}", body: "Os torcedores chegaram cedo, antes do ônibus do elenco. A segurança pediu reforço à polícia." },
    ],
    choices: [
      { label: "Receber uma comissão da torcida", detail: "Cinco torcedores, meia hora de conversa", effects: { fans: 5, morale: -1, board: -1 } },
      { label: "Treinar com os portões fechados", effects: { fans: -3, morale: 1 } },
      { label: "Pedir apoio na coletiva", effects: { fans: 2 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "fans-airport",
    area: "fans",
    topic: "fans",
    weight: 2,
    cooldownDays: 30,
    cast: (scene) => {
      const today = playedToday(scene);
      return today && today.awayId === scene.clubId && (marginToday(scene) ?? 0) > 0 ? {} : null;
    },
    texts: [
      { headline: "Festa no aeroporto para o {club}", body: "Centenas de torcedores esperaram o elenco no desembarque depois da vitória fora de casa." },
      { headline: "Torcida recebe o {club} com fogos", body: "O ônibus levou uma hora para sair do aeroporto. Ninguém reclamou." },
      { headline: "Desembarque em clima de festa", body: "Bandeiras, sinalizadores e muito barulho às duas da manhã. O {club} voltou para casa como se tivesse ganhado um título." },
    ],
    effects: { fans: 3, morale: 2 },
  },
  {
    id: "fans-chant-idol",
    area: "fans",
    topic: "fans",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((marginToday(scene) ?? -1) > 0 ? playerCast(byStrength(scene.squad)[0]) : null),
    texts: [
      { headline: "Torcida canta o nome de {player}", body: "Depois do apito final, o estádio inteiro pediu o {position}. Ele voltou do túnel para agradecer." },
      { headline: "{player} é ovacionado pela torcida do {club}", body: "O {position} saiu de campo aplaudido de pé e jogou a camisa para a arquibancada." },
      { headline: "{stadium} grita o nome de {player}", body: "A música nova da torcida pegou. O {position} ouviu do gramado e bateu no peito." },
    ],
    effects: { fans: 2, morale: 1 },
  },
  {
    id: "fans-ticket-price",
    area: "fans",
    topic: "fans",
    weight: 2,
    cooldownDays: 60,
    cast: (scene) => {
      const money = finance(scene);
      const club = scene.state.clubs[scene.clubId];
      if (!money || !club) return null;
      return money.ticketPrice > scene.state.economy.matchday[tierOf(club)].price * 1.3 ? {} : null;
    },
    setting: "Nas redes do clube",
    texts: [
      { headline: "Torcida do {club} reclama do preço do ingresso", body: "A hashtag pedindo ingresso mais barato está entre as mais comentadas da cidade." },
      { headline: "Ingresso caro esvazia o {stadium}", body: "A torcida diz que não dá para pagar o que o {club} cobra. A organizada fala em boicote." },
      { headline: "Preço do ingresso revolta a torcida do {club}", body: "“Pai de família não leva mais o filho ao estádio”, diz a faixa que apareceu no último jogo." },
    ],
    choices: [
      { label: "Pedir à diretoria uma promoção para sócios", detail: "A diretoria banca o desconto no próximo jogo", effects: (scene) => ({ fans: 3, money: -round((finance(scene)?.baseCrowd ?? 0) * (finance(scene)?.ticketPrice ?? 0) * 0.1) }) },
      { label: "Defender o preço", detail: "O clube precisa da receita", effects: { fans: -3, board: 2 } },
      { label: "Não comentar", effects: { fans: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "fans-mosaic",
    area: "fans",
    topic: "fans",
    weight: 2,
    cooldownDays: 30,
    cast: (scene) => {
      const rivalId = rivalNext(scene);
      return rivalId && nextMatch(scene)?.homeId === scene.clubId ? { rivalId } : null;
    },
    texts: [
      { headline: "Torcida prepara mosaico para o clássico", body: "Mil voluntários passaram a noite no {stadium} colando cartolinas. O desenho é segredo até o time entrar em campo." },
      { headline: "{stadium} vai ter mosaico contra o {rival}", body: "A torcida do {club} fez vaquinha e comprou trinta mil folhas. O ensaio foi de madrugada." },
      { headline: "Festa preparada para receber o {rival}", body: "Bandeirão novo, fumaça e mosaico na arquibancada. A torcida do {club} promete um clássico inesquecível." },
    ],
    effects: { fans: 2, morale: 2 },
  },
  {
    id: "fans-sold-out",
    area: "fans",
    topic: "fans",
    weight: 1.5,
    cooldownDays: 45,
    cast: (scene) => (mood(scene).fans > 70 && nextMatch(scene)?.homeId === scene.clubId && playsWithin(scene, 3) ? {} : null),
    texts: [
      { headline: "Ingressos esgotados no {stadium}", body: "Em duas horas não sobrou nada. Tem torcedor dormindo na fila para tentar a carga extra." },
      { headline: "Casa cheia para o {club}", body: "O site do clube caiu três vezes. Todos os setores esgotados para o próximo jogo." },
      { headline: "{club} esgota a carga e promete caldeirão", body: "O sócio-torcedor teve prioridade e levou quase tudo. O resto sumiu em minutos." },
    ],
    effects: { morale: 2 },
  },
  {
    id: "fans-kid-wish",
    area: "fans",
    topic: "fans",
    weight: 0.6,
    cooldownDays: 90,
    cast: (scene) => playerCast(byStrength(scene.squad)[0]),
    setting: "Pelas redes do clube",
    texts: [
      { headline: "Menino em tratamento quer conhecer {player}", body: "Ele tem nove anos, está internado e dorme com a camisa do {club}. A mãe escreveu para o clube." },
      { headline: "Pedido emociona a torcida do {club}", body: "Um garoto em tratamento contra o câncer pediu um único presente: um abraço de {player}." },
      { headline: "Vídeo de fã mirim chega até {player}", body: "“Meu sonho é ver o {player} jogar.” O vídeo do menino passou de um milhão de visualizações." },
    ],
    choices: [
      { label: "Convidar o menino para o treino", detail: "Com o elenco inteiro", effects: { fans: 4, morale: 2 }, news: "{player} recebe fã mirim no CT do {club}" },
      { label: "Mandar uma camisa autografada", effects: { fans: 1 } },
      { label: "Levar {player} ao hospital", detail: "Uma tarde fora do CT", effects: { fans: 3, morale: 1 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "fans-banner-against-coach",
    area: "fans",
    topic: "fans",
    weight: 2,
    cooldownDays: 45,
    cast: (scene) => (winless(scene, 4) && mood(scene).fans < 40 ? {} : null),
    texts: [
      { headline: "Faixa contra {coach} no {stadium}", body: "“Fora, {coach}” em letras vermelhas, na arquibancada atrás do gol. A TV mostrou três vezes." },
      { headline: "Torcida do {club} pede a saída do técnico", body: "O grito começou aos 30 do segundo tempo e não parou mais. A diretoria ouviu do camarote." },
      { headline: "Paciência da torcida com {coach} acabou", body: "Quatro jogos sem vitória e o coro mudou de alvo: agora é o técnico." },
    ],
    effects: { board: -2, morale: -1 },
  },
  {
    id: "fans-chant-coach",
    area: "fans",
    topic: "fans",
    weight: 1.5,
    cooldownDays: 60,
    cast: (scene) => (isRun(scene, 3, 3) ? {} : null),
    texts: [
      { headline: "Torcida do {club} canta o nome do técnico", body: "Terceira vitória seguida e o {stadium} lembrou de quem está no banco. {coach} acenou meio sem jeito." },
      { headline: "{coach} ganha música da torcida", body: "A letra é simples e a melodia é de um pagode antigo. Já virou figurinha no grupo do elenco." },
      { headline: "Lua de mel entre {coach} e a torcida do {club}", body: "Três vitórias, futebol bonito e o nome do técnico na arquibancada. O presidente sorriu no camarote." },
    ],
    effects: { board: 1, fans: 2 },
  },
  {
    id: "fans-caravan",
    area: "fans",
    topic: "fans",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => (mood(scene).fans > 60 && nextMatch(scene)?.awayId === scene.clubId && playsWithin(scene, 3) ? {} : null),
    texts: [
      { headline: "Caravana do {club} pega a estrada", body: "Quarenta ônibus saíram de madrugada. A torcida promete fazer do jogo fora uma partida em casa." },
      { headline: "Torcida do {club} invade a cidade do adversário", body: "A carga de visitante esgotou em uma hora e tem gente indo de carro, sem ingresso, só para ficar perto." },
      { headline: "Mar de camisas do {club} longe de casa", body: "A organizada fretou ônibus, a família foi de carro e um grupo foi de moto. Todo mundo quer estar lá." },
    ],
    effects: { morale: 2, fans: 1 },
  },
  {
    id: "fans-members-record",
    area: "fans",
    topic: "fans",
    weight: 0.8,
    cooldownDays: 180,
    cast: (scene) => (mood(scene).fans > 65 ? {} : null),
    texts: [
      { headline: "Sócio-torcedor do {club} bate recorde", body: "Mais de dez mil adesões na semana. O marketing comemora e a diretoria já faz conta." },
      { headline: "Fase boa enche o programa de sócios do {club}", body: "A fila virtual passou de uma hora. O plano mais caro esgotou primeiro." },
      { headline: "{club} ganha milhares de sócios", body: "Com o time embalado, a campanha nas redes pegou. O caixa agradece." },
    ],
    effects: (scene) => ({ money: round((finance(scene)?.membership ?? 0) * 0.02), board: 1 }),
  },
  {
    id: "fans-boo-player",
    area: "fans",
    topic: "fans",
    weight: 1.5,
    cooldownDays: 45,
    cast: (scene) => {
      const today = playedToday(scene);
      return today && today.homeId === scene.clubId && (marginToday(scene) ?? 0) < 0 ? playerCast(pickFrom(scene, regulars(scene).filter((p) => p.group !== "GK"))) : null;
    },
    setting: "Na zona mista",
    texts: [
      { headline: "Torcida vaia {player}", body: "Cada vez que pegava na bola, o {stadium} vaiava. Ele saiu de campo sem olhar para a arquibancada." },
      { headline: "{player} vira alvo no {stadium}", body: "A torcida escolheu o culpado da derrota. O {position} ouviu xingamentos até entrar no túnel." },
      { headline: "Vaias para {player} na derrota do {club}", body: "Na zona mista, perguntaram ao técnico se o jogador perdeu a torcida. A resposta vai sair nos jornais." },
    ],
    choices: [
      { label: "Defender o jogador em público", detail: "Ele não esquece", effects: { morale: 2, fans: -2 } },
      { label: "Poupar por um jogo", detail: "Sai do foco até a poeira baixar", effects: { morale: -1, fans: 1 } },
      { label: "Dizer que a torcida tem razão de cobrar", effects: { morale: -3, fans: 2 } },
    ],
  },
  {
    id: "fans-organised-meeting",
    area: "fans",
    topic: "fans",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => (mood(scene).fans >= 35 && mood(scene).fans < 55 ? {} : null),
    setting: "Por ofício à diretoria",
    texts: [
      { headline: "Organizada pede reunião com o elenco do {club}", body: "Os líderes da torcida querem “olhar no olho” dos jogadores. Prometem conversa sem confusão." },
      { headline: "Torcida organizada quer falar com {coach}", body: "O pedido chegou por escrito à diretoria. Querem saber o plano para o resto da temporada." },
      { headline: "Organizada do {club} bate à porta", body: "“Não viemos brigar, viemos apoiar e cobrar”, diz a nota publicada nas redes da torcida." },
    ],
    choices: [
      { label: "Receber no CT com o capitão", effects: { fans: 3, morale: -1 } },
      { label: "Recusar: cobrança é no estádio", effects: { fans: -2, morale: 1, board: 1 } },
      { label: "Mandar o capitão sozinho", effects: { fans: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "fans-stay-campaign",
    area: "fans",
    topic: "fans",
    weight: 1,
    cooldownDays: 90,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, byStrength(scene.squad).slice(0, 5).filter((p) => p.contractUntil <= addDays(scene.date, 180)))),
    setting: "Nas redes sociais",
    texts: [
      { headline: "Torcida faz campanha por {player}", body: "A hashtag pedindo a renovação do {position} ficou o dia todo entre as mais comentadas do país." },
      { headline: "“Fica, {player}”: torcida pressiona o {club}", body: "O contrato acaba em seis meses e os torcedores colaram cartazes até na porta da sede." },
      { headline: "Bandeirão pede a renovação de {player}", body: "No último jogo, a arquibancada abriu um pano com o rosto do {position}. A diretoria entendeu o recado." },
    ],
    choices: [
      { label: "Dizer que quer {player} no elenco", detail: "A diretoria vai ter de pagar", effects: { fans: 3, board: -2 } },
      { label: "Lembrar que contrato é com a diretoria", effects: { fans: -1, board: 1 } },
      { label: "Não comentar", effects: { fans: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "fans-pitch-invasion",
    area: "fans",
    topic: "fans",
    weight: 0.8,
    cooldownDays: 60,
    cast: (scene) => {
      const today = playedToday(scene);
      return today && today.homeId === scene.clubId && (marginToday(scene) ?? 0) > 0 ? playerCast(byStrength(scene.squad)[0]) : null;
    },
    texts: [
      { headline: "Torcedor invade o campo para abraçar {player}", body: "O jogo parou dois minutos. O {position} deu o abraço antes de a segurança chegar." },
      { headline: "Invasão de campo no {stadium}", body: "Um torcedor driblou três seguranças e pediu uma selfie a {player}. O árbitro relatou na súmula." },
      { headline: "Fã corre até {player} e o jogo para", body: "A cena viralizou. O clube deve ser multado pela invasão, mas o torcedor saiu com a foto." },
    ],
    effects: { fans: 1, money: -40_000 },
  },
];
