import type { EventType } from "../eventType.js";
import { board as boardOf, byStrength, heatOf, isWindow, marginToday, nextMatch, playedRivalToday, rivalCast, rivalNext, round, wageBill } from "./sceneReaders.js";

/** The club's rivals: derbies, provocations, the other side's coach, fans and directors. */
export const RIVAL_EVENTS: readonly EventType[] = [
  {
    id: "rival-provocation",
    area: "fans",
    topic: "rivals",
    weight: (scene, cast) => (playedRivalToday(scene) ? 4 : 0.3) + heatOf(scene, cast),
    cooldownDays: 45,
    cast: rivalCast,
    setting: "Nas redes sociais",
    texts: [
      { headline: "Torcida do {rival} provoca o {club}", body: "Um outdoor perto do {stadium} lembra o último clássico. A torcida quer resposta." },
      { headline: "{rival} provoca nas redes", body: "O perfil oficial do {rival} postou uma piada com o {club}. O elenco viu." },
      { headline: "Provocação do {rival} viraliza", body: "Um vídeo do vestiário do {rival} cantando contra o {club} chegou ao grupo do elenco. Os jogadores pedem uma resposta." },
    ],
    choices: [
      { label: "Responder na mesma moeda", detail: "A torcida adora, a diretoria nem tanto", effects: { fans: 4, board: -2, rivalry: 5 }, news: "{coach} responde à provocação do {rival}" },
      { label: "Pedir respeito", effects: { fans: -1, board: 1, rivalry: -1 } },
      { label: "Deixar para o campo", effects: { morale: 1, rivalry: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "rival-coach-jab",
    area: "press",
    topic: "rivals",
    weight: (scene, cast) => 0.8 + heatOf(scene, cast),
    cooldownDays: 45,
    cast: rivalCast,
    setting: "Na zona mista",
    texts: [
      { headline: "Técnico do {rival} alfineta o {club}", body: "“O {club} gasta muito e joga pouco”, disse o treinador do {rival} depois do jogo dele. Os repórteres querem a sua resposta." },
      { headline: "{rival} diz que o {club} tem medo", body: "O técnico do {rival} afirmou que o seu time “joga para não perder”. A frase foi parar nas manchetes." },
      { headline: "Farpa do {rival} chega ao CT do {club}", body: "Numa entrevista, o técnico do {rival} disse que “no clássico a camisa pesa” e olhou para a câmera." },
    ],
    choices: [
      { label: "Rebater na hora", detail: "Esquenta a rivalidade", effects: { fans: 3, morale: 1, board: -1, rivalry: 4 }, news: "{coach} rebate o técnico do {rival}" },
      { label: "Rir e mudar de assunto", effects: { fans: 1, rivalry: 1 } },
      { label: "Elogiar o trabalho dele", effects: { board: 1, fans: -2, rivalry: -2 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "rival-graffiti",
    area: "fans",
    topic: "rivals",
    weight: (scene, cast) => (rivalNext(scene) ? 2 : 0.3) + heatOf(scene, cast),
    cooldownDays: 60,
    cast: (scene) => {
      const rivalId = rivalNext(scene);
      return rivalId ? { rivalId } : rivalCast(scene);
    },
    texts: [
      { headline: "Muro do {stadium} amanhece pichado", body: "As cores e o escudo do {rival} apareceram no muro de madrugada. A torcida do {club} já fala em revide." },
      { headline: "Pichação do {rival} no {stadium}", body: "Uma frase provocando o {club} foi escrita em letras de dois metros. A polícia investiga." },
      { headline: "Torcedores do {rival} picham a sede do {club}", body: "A diretoria mandou pintar antes do treino, mas as fotos já estavam em todos os grupos." },
    ],
    effects: { fans: -1, rivalry: 2 },
  },
  {
    id: "rival-interest",
    area: "players",
    topic: "rivals",
    weight: 0.8,
    cooldownDays: 120,
    once: "player",
    cast: (scene) => {
      const rival = rivalCast(scene);
      const player = byStrength(scene.squad)[0];
      return isWindow(scene) && rival && player ? { ...rival, playerId: player.id } : null;
    },
    setting: "Nos jornais",
    texts: [
      { headline: "{player} na mira do {rival}", body: "O empresário confirmou a sondagem. A torcida do {club} já se mobiliza nas redes." },
      { headline: "{rival} quer tirar {player} do {club}", body: "O diretor do {rival} teria ligado para o empresário do {position}. O jogador não negou." },
      { headline: "Rival assedia {player}", body: "Uma reportagem diz que o {rival} oferece o dobro do salário. O vestiário do {club} acompanha calado." },
    ],
    choices: [
      { label: "“{player} não sai, muito menos para o {rival}.”", detail: "A torcida aplaude", effects: { fans: 3, board: -1, rivalry: 2 }, news: "{coach}: “{player} não vai para o {rival}”" },
      { label: "“Tudo tem um preço.”", effects: { board: 2, fans: -3, morale: -1 } },
      { label: "Sem comentários", effects: { morale: -1 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "rival-derby-party",
    area: "fans",
    topic: "rivals",
    weight: 4,
    cooldownDays: 21,
    cast: (scene) => (playedRivalToday(scene) && (marginToday(scene) ?? 0) > 0 ? rivalCast(scene) : null),
    texts: [
      { headline: "Cidade em festa: o clássico é do {club}", body: "Buzinaço até de madrugada. Quem tem amigo torcedor do {rival} já mandou a primeira mensagem." },
      { headline: "Vitória no clássico vira carnaval", body: "A torcida do {club} saiu do {stadium} cantando contra o {rival}. Os bares da cidade não fecharam." },
      { headline: "{club} manda no clássico", body: "Os jogadores postaram fotos com a placa do clássico. A diretoria do {rival} reclamou da provocação." },
    ],
    effects: { fans: 4, morale: 2, rivalry: 1 },
  },
  {
    id: "rival-derby-mockery",
    area: "fans",
    topic: "rivals",
    weight: 4,
    cooldownDays: 21,
    cast: (scene) => (playedRivalToday(scene) && (marginToday(scene) ?? 0) < 0 ? rivalCast(scene) : null),
    texts: [
      { headline: "Corneta do {rival} não dá trégua", body: "Memes, faixas e até carro de som passando na porta do CT do {club}. A semana vai ser longa." },
      { headline: "Derrota no clássico dói no {club}", body: "A torcida do {rival} lotou as redes de provocação. Os jogadores do {club} saíram sem falar com ninguém." },
      { headline: "{rival} tira onda com o {club}", body: "O perfil oficial do {rival} postou o placar com uma foto antiga do {stadium}. A torcida do {club} pede resposta no próximo encontro." },
    ],
    effects: { fans: -3, morale: -2, rivalry: 2 },
  },
  {
    id: "rival-away-tickets",
    area: "board",
    topic: "rivals",
    weight: 2,
    cooldownDays: 60,
    cast: (scene) => {
      const rivalId = rivalNext(scene);
      return rivalId && nextMatch(scene)?.awayId === scene.clubId ? { rivalId } : null;
    },
    setting: "Na federação",
    texts: [
      { headline: "Briga por ingressos no clássico", body: "O {rival} quer dar só 5% da carga à torcida do {club}. A federação chamou as duas diretorias." },
      { headline: "{rival} corta carga de visitante", body: "A torcida do {club} vai ter menos de mil lugares no clássico. A organizada fala em protesto." },
      { headline: "Polícia sugere torcida única no clássico", body: "O {rival} topou na hora. A diretoria do {club} quer saber a opinião do técnico antes de responder." },
    ],
    choices: [
      { label: "Exigir os 10% que o regulamento prevê", effects: { fans: 2, rivalry: 2, board: -1 } },
      { label: "Aceitar a carga menor", effects: { fans: -2, board: 1 } },
      { label: "Apoiar torcida única", detail: "Menos risco, menos festa", effects: { fans: -3, board: 2, rivalry: -1 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "rival-charity-match",
    area: "board",
    topic: "rivals",
    weight: 0.3,
    cooldownDays: 365,
    cast: rivalCast,
    setting: "Na sede do clube",
    texts: [
      { headline: "{club} e {rival} podem fazer jogo beneficente", body: "Uma ONG propôs um amistoso entre ex-jogadores dos dois clubes. A renda vai para hospitais da cidade." },
      { headline: "Clássico pela paz entre {club} e {rival}", body: "Depois de mais uma briga entre torcidas, o Ministério Público sugeriu uma campanha conjunta." },
      { headline: "{club} e {rival} lado a lado por uma causa", body: "As diretorias conversam sobre uma camisa comemorativa com os dois escudos. A torcida está dividida." },
    ],
    choices: [
      { label: "Apoiar a ideia", effects: { board: 2, fans: -1, rivalry: -2 } },
      { label: "Só com ex-jogadores", effects: { board: 1, rivalry: -1 } },
      { label: "Rival é rival", effects: { fans: 2, board: -1, rivalry: 1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "rival-crisis-chant",
    area: "fans",
    topic: "rivals",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => {
      const rival = rivalCast(scene);
      const theirs = rival?.rivalId ? boardOf({ ...scene, clubId: rival.rivalId }) : undefined;
      return rival && (theirs?.pressure ?? 0) > 0.6 ? rival : null;
    },
    texts: [
      { headline: "Torcida do {club} provoca o {rival} pela crise", body: "No último jogo, a arquibancada cantou a música do rebaixamento para o rival. O {rival} não gostou." },
      { headline: "{rival} em crise, {club} em festa", body: "A torcida do {club} espalhou faixas na cidade lembrando a fase do rival. A polícia pede calma." },
      { headline: "Zoeira com a crise do {rival}", body: "Os memes da torcida do {club} sobre o momento do {rival} rodaram o país. O técnico deles respondeu." },
    ],
    effects: { fans: 2, rivalry: 2 },
  },
  {
    id: "rival-staff-poach",
    area: "board",
    topic: "rivals",
    weight: 0.4,
    cooldownDays: 365,
    cast: rivalCast,
    setting: "Na sala do técnico",
    texts: [
      { headline: "{rival} tenta levar o fisiologista do {club}", body: "A proposta é o dobro do salário. O profissional diz que prefere ficar, mas tem família." },
      { headline: "Assédio do {rival} na comissão técnica", body: "O analista de desempenho do {club} recebeu uma oferta do {rival}. Ele conhece todos os seus treinos." },
      { headline: "{rival} quer o preparador de goleiros do {club}", body: "O {rival} ofereceu contrato de três anos. A diretoria pergunta se o técnico quer cobrir." },
    ],
    choices: [
      { label: "Cobrir a proposta", effects: (scene) => ({ money: -round(wageBill(scene) * 0.01), morale: 1, rivalry: 1 }) },
      { label: "Deixar sair", effects: { morale: -1, rivalry: 1 } },
      { label: "Denunciar o assédio na imprensa", effects: { fans: 2, board: -1, rivalry: 3 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "rival-president-accusation",
    area: "board",
    topic: "rivals",
    weight: (scene) => (playedRivalToday(scene) && (marginToday(scene) ?? 0) > 0 ? 3 : 0),
    cooldownDays: 60,
    cast: (scene) => (playedRivalToday(scene) ? rivalCast(scene) : null),
    setting: "Nos jornais",
    texts: [
      { headline: "Presidente do {rival} acusa a arbitragem", body: "“O {club} ganha no apito”, disse o dirigente depois do clássico. A diretoria do {club} pede uma resposta." },
      { headline: "{rival} fala em favorecimento ao {club}", body: "Uma nota oficial do {rival} pede a revisão do VAR do clássico. A imprensa repercute o dia inteiro." },
      { headline: "Derrota no clássico vira guerra de notas", body: "O {rival} chamou o resultado de “vergonhoso” e promete ir ao STJD. O presidente do {club} quer revidar." },
    ],
    choices: [
      { label: "Responder com ironia", detail: "Placar não se discute", effects: { fans: 3, rivalry: 3, board: -1 } },
      { label: "Deixar a diretoria responder", effects: { board: 1, rivalry: 1 } },
      { label: "Pedir calma às duas torcidas", effects: { board: 1, fans: -1, rivalry: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "rival-youth-poach",
    area: "board",
    topic: "rivals",
    weight: 0.4,
    cooldownDays: 365,
    cast: rivalCast,
    texts: [
      { headline: "{rival} tira garoto da base do {club}", body: "O meia de quinze anos assinou com o rival depois de uma proposta para a família. A base do {club} reclama de aliciamento." },
      { headline: "Base do {club} perde promessa para o {rival}", body: "A família do garoto aceitou casa e salário. O coordenador da base fala em “covardia”." },
      { headline: "Promessa da base troca o {club} pelo {rival}", body: "O garoto treinava no {club} desde os oito anos. A torcida soube pelo post do próprio {rival}." },
    ],
    effects: { fans: -2, rivalry: 2 },
  },
  {
    id: "rival-mascot-fight",
    area: "fans",
    topic: "rivals",
    weight: (scene) => (playedRivalToday(scene) ? 1 : 0),
    cooldownDays: 120,
    cast: (scene) => (playedRivalToday(scene) ? rivalCast(scene) : null),
    texts: [
      { headline: "Mascotes de {club} e {rival} se estranham", body: "Antes do clássico, os dois mascotes trocaram empurrões no gramado. A federação vai multar os clubes." },
      { headline: "Briga de mascotes no clássico", body: "O mascote do {club} roubou a bandeira do {rival} e saiu correndo. Acabou no chão, cercado por seguranças." },
      { headline: "Mascote do {club} provoca o {rival}", body: "A dancinha em frente à torcida visitante rendeu vaias, risadas e um relatório do delegado da partida." },
    ],
    effects: { fans: 1, rivalry: 1, money: -20_000 },
  },
];
