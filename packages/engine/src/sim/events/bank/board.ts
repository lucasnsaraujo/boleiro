import type { EventType } from "../eventType.js";
import { board, byStrength, finance, fit, isWindow, marginToday, monthOf, pickFrom, playerCast, rivalCast, standing, winless } from "./sceneReaders.js";

/** The president, the directors and the club's council. */
export const BOARD_EVENTS: readonly EventType[] = [
  {
    id: "board-wants-sale",
    area: "board",
    topic: "board",
    weight: 2,
    cooldownDays: 60,
    cast: (scene) => {
      const money = finance(scene);
      if (!money || (money.cash >= 0 && money.wagesOwed === 0)) return null;
      return playerCast(byStrength(scene.squad)[0]);
    },
    setting: "Na sede do clube",
    texts: [
      { headline: "Diretoria quer vender {player}", body: "O caixa está no vermelho. O presidente diz que só a venda do {position} fecha a conta do mês." },
      { headline: "{club} precisa de dinheiro e mira {player}", body: "“Ou vende o {player}, ou atrasa salário”, disse o vice de futebol." },
      { headline: "Conta não fecha e {player} entra na vitrine", body: "O diretor financeiro levou uma planilha à reunião. Na última linha, o nome do {position}." },
    ],
    choices: [
      { label: "Aceitar a venda de {player}", detail: "O elenco sente", effects: { board: 6, morale: -3, fans: -4 }, news: "Técnico aceita e {club} põe {player} à venda" },
      { label: "Recusar", detail: "O melhor jogador fica", effects: { board: -6, morale: 2 }, news: "Técnico do {club} veta a venda de {player}" },
      { label: "Sugerir vender um reserva", effects: { board: 2, morale: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "board-praise",
    area: "board",
    topic: "board",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((board(scene)?.pressure ?? 0) < -0.25 && (board(scene)?.games ?? 0) >= 5 ? {} : null),
    texts: [
      { headline: "Presidente do {club} prestigia o técnico", body: "“O projeto é de longo prazo. Ele fica até o fim do contrato, no mínimo.”" },
      { headline: "{coach} é prestigiado pela diretoria do {club}", body: "O presidente visitou o CT, almoçou com a comissão técnica e falou em renovação." },
      { headline: "Diretoria do {club} elogia o trabalho de {coach}", body: "Em entrevista à rádio, o vice de futebol disse que o time “tem a cara do treinador”." },
    ],
    effects: { board: 2, morale: 1 },
  },
  {
    id: "board-ultimatum",
    area: "board",
    topic: "board",
    weight: 3,
    cooldownDays: 45,
    cast: (scene) => ((board(scene)?.pressure ?? 0) > 0.6 && (board(scene)?.games ?? 0) >= 4 ? {} : null),
    setting: "Na sede do clube, à noite",
    texts: [
      { headline: "Ultimato da diretoria do {club}", body: "O presidente quer resultado nos próximos dois jogos. “Não é ameaça, é o que o torcedor cobra.”" },
      { headline: "{coach} na corda bamba", body: "A diretoria do {club} se reuniu sem o técnico. Saiu da sala dizendo que a paciência acabou." },
      { headline: "Prazo curto para {coach}", body: "Nos corredores da sede, o nome de um substituto já circula. O presidente chamou o senhor para uma conversa franca." },
    ],
    choices: [
      { label: "Aceitar a meta", detail: "Dois jogos para virar", effects: { board: 3, morale: -1 } },
      { label: "Bater de frente", detail: "A torcida aplaude, a diretoria anota", effects: { board: -5, fans: 3, morale: 2 }, news: "{coach} rebate o ultimato da diretoria do {club}" },
      { label: "Pedir reforços", effects: { board: -2, morale: 1 } },
    ],
  },
  {
    id: "board-cuts",
    area: "board",
    topic: "board",
    weight: 2,
    cooldownDays: 90,
    cast: (scene) => ((finance(scene)?.cash ?? 0) < 0 ? {} : null),
    texts: [
      { headline: "{club} corta gastos", body: "Sem dinheiro em caixa, a diretoria suspendeu viagens e reduziu a equipe do CT." },
      { headline: "Crise no caixa do {club}", body: "O clube atrasou fornecedores e cortou o lanche depois do treino. O elenco reclamou." },
      { headline: "Aperto financeiro chega ao CT do {club}", body: "Fim do fretamento em viagens curtas: o time vai de ônibus. O preparador físico torceu o nariz." },
    ],
    effects: { morale: -2, fans: -1 },
  },
  {
    id: "director-lineup",
    area: "board",
    topic: "board",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    // A young player outside the eleven the director of football wants to see.
    cast: (scene) => playerCast(pickFrom(scene, byStrength(fit(scene)).slice(11).filter((p) => p.age <= 21))),
    setting: "Por mensagem",
    texts: [
      { headline: "Diretor quer {player} no time", body: "“O menino tem {age} anos e mercado. Precisa de vitrine. Pensa com carinho.”" },
      { headline: "Diretoria pede espaço para {player}", body: "O vice de futebol acha que o {position} da base merece jogar e mandou recado pelo gerente." },
      { headline: "Recado da diretoria: escalar {player}", body: "“Tem clube de fora perguntando por ele. Se não joga, não vale nada.” A mensagem chegou às onze da noite." },
    ],
    choices: [
      { label: "Dar minutos a {player}", effects: { board: 3, morale: -1 } },
      { label: "Dizer que quem escala é você", effects: { board: -4, morale: 2, fans: 1 }, news: "{coach} rebate a diretoria: “Quem escala sou eu”" },
      { label: "Levar para o banco", detail: "Fica entre os relacionados", effects: { board: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "board-election",
    area: "board",
    topic: "board",
    weight: 1.5,
    cooldownDays: 300,
    cast: (scene) => (monthOf(scene) >= 10 ? {} : null),
    setting: "Na sede do clube",
    texts: [
      { headline: "Eleição agita o {club}", body: "A chapa de oposição promete “um novo projeto para o futebol”. Todo mundo entendeu o recado." },
      { headline: "Oposição do {club} mira o técnico", body: "O candidato da oposição disse num podcast que traria outro treinador. O presidente pede apoio público." },
      { headline: "Campanha eleitoral chega ao CT do {club}", body: "As duas chapas querem foto com o elenco. O presidente quer que o senhor declare voto, e a oposição também." },
    ],
    choices: [
      { label: "Ficar neutro", detail: "Futebol longe da política", effects: { board: -1, morale: 1 } },
      { label: "Apoiar o presidente", detail: "Se a oposição ganhar, a conta chega", effects: { board: 4, fans: -2 }, news: "{coach} apoia a reeleição no {club}" },
      { label: "Receber as duas chapas", effects: { board: 1, morale: -1 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "board-transfer-freeze",
    area: "board",
    topic: "board",
    weight: 1.5,
    cooldownDays: 120,
    cast: (scene) => (isWindow(scene) && (finance(scene)?.cash ?? 0) < 0 ? {} : null),
    texts: [
      { headline: "{club} congela contratações", body: "Com o caixa negativo, a diretoria avisou: ninguém chega nesta janela sem vender antes." },
      { headline: "Janela fechada para reforços no {club}", body: "“Só entra quem sai”, resumiu o diretor financeiro. A torcida esperava um centroavante." },
      { headline: "Sem dinheiro, {club} não vai às compras", body: "O presidente pediu desculpas ao técnico em particular. Em público, falou em “responsabilidade”." },
    ],
    effects: { morale: -1, fans: -2 },
  },
  {
    id: "board-signing-promise",
    area: "board",
    topic: "board",
    weight: 1,
    cooldownDays: 120,
    cast: (scene) => (isWindow(scene) && (finance(scene)?.cash ?? 0) > 0 && (board(scene)?.pressure ?? 0) < 0.3 ? {} : null),
    texts: [
      { headline: "Presidente promete reforço ao {club}", body: "“Vem um jogador de peso nesta janela”, disse o presidente na saída de um evento. O elenco leu nos jornais." },
      { headline: "{club} anuncia que vai às compras", body: "A diretoria liberou verba para a janela. O vice de futebol quer uma lista com três nomes." },
      { headline: "Diretoria do {club} abre o cofre", body: "Com as contas em dia, o clube quer reforçar o time. O presidente pede ao técnico as prioridades." },
    ],
    effects: { morale: 1, fans: 2 },
  },
  {
    id: "board-president-critique",
    area: "board",
    topic: "board",
    weight: 1.5,
    cooldownDays: 60,
    cast: (scene) => ((board(scene)?.pressure ?? 0) > 0.3 && winless(scene, 3) ? {} : null),
    setting: "Numa rádio da cidade",
    texts: [
      { headline: "Presidente do {club} critica o esquema", body: "“Com três volantes não dá. Eu falei isso para ele”, disse o presidente ao vivo." },
      { headline: "Presidente dá palpite na escalação do {club}", body: "Numa entrevista de quarenta minutos, o presidente escalou o time dele. O seu não estava." },
      { headline: "{coach} criticado pelo próprio presidente", body: "O dirigente disse que o time “joga com medo” e que vai cobrar o técnico pessoalmente." },
    ],
    choices: [
      { label: "Responder em público", detail: "A torcida gosta de técnico com personalidade", effects: { board: -4, fans: 2, morale: 1 }, news: "{coach} rebate o presidente do {club}" },
      { label: "Pedir uma reunião a portas fechadas", effects: { board: 1 } },
      { label: "Ignorar", effects: { morale: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "board-target-raise",
    area: "board",
    topic: "board",
    weight: 1,
    cooldownDays: 180,
    cast: (scene) => {
      const own = standing(scene);
      return own && own.games >= 6 && own.games <= 15 && own.position <= Math.max(1, own.target - 5) ? {} : null;
    },
    setting: "Na sede do clube",
    texts: [
      { headline: "Diretoria do {club} sobe a meta", body: "O começo foi melhor que o esperado. O presidente agora fala em brigar lá em cima." },
      { headline: "{club} quer mais", body: "“Se dá para sonhar, vamos sonhar”, disse o vice de futebol. A meta do começo do ano ficou pequena." },
      { headline: "Bom início muda os planos do {club}", body: "Na reunião do conselho, a diretoria prometeu uma campanha acima do previsto. Quem vai cobrar é o senhor." },
    ],
    choices: [
      { label: "Aceitar a meta nova", detail: "Mais prestígio, mais cobrança", effects: { board: 3, morale: -1 } },
      { label: "Manter os pés no chão", effects: { board: -2, morale: 1 } },
      { label: "Pedir reforços para a meta nova", effects: { board: -1, morale: 1 } },
    ],
  },
  {
    id: "board-renewal-offer",
    area: "board",
    topic: "board",
    weight: 1,
    cooldownDays: 240,
    cast: (scene) => ((board(scene)?.pressure ?? 0) < -0.4 && (board(scene)?.games ?? 0) >= 15 ? {} : null),
    setting: "Na sede do clube",
    texts: [
      { headline: "{club} quer renovar com {coach}", body: "O presidente chamou o senhor para um café e levou uma proposta de mais dois anos." },
      { headline: "Diretoria do {club} oferece renovação ao técnico", body: "“Queremos o professor aqui por muito tempo”, disse o vice de futebol, com o contrato na pasta." },
      { headline: "Renovação de {coach} na pauta do {club}", body: "Com o time em alta, a diretoria se antecipou. A proposta está na mesa e o presidente quer resposta logo." },
    ],
    choices: [
      { label: "Aceitar na hora", effects: { board: 4, morale: 1 }, news: "{coach} renova com o {club}" },
      { label: "Pedir reforços como condição", effects: { board: -1, morale: 1 } },
      { label: "Deixar para o fim da temporada", effects: { board: -2 } },
    ],
  },
  {
    id: "board-sell-to-rival",
    area: "board",
    topic: "board",
    weight: 0.8,
    cooldownDays: 180,
    cast: (scene) => {
      const rival = rivalCast(scene);
      const player = byStrength(scene.squad)[1];
      return isWindow(scene) && rival && player ? { ...rival, playerId: player.id } : null;
    },
    setting: "Na sede do clube",
    texts: [
      { headline: "{rival} faz proposta por {player}", body: "A oferta é boa e a diretoria do {club} gostou. A torcida, nem um pouco." },
      { headline: "Diretoria balança com oferta do {rival} por {player}", body: "“Dinheiro não tem cor”, disse o diretor financeiro. A organizada respondeu com uma nota de repúdio." },
      { headline: "{player} pode trocar o {club} pelo {rival}", body: "O empresário confirmou a conversa. O presidente quer saber se o técnico aceita perder o jogador para o rival." },
    ],
    choices: [
      { label: "Vetar a venda ao rival", detail: "A torcida agradece", effects: { board: -4, fans: 4 }, news: "{coach} veta a venda de {player} ao {rival}" },
      { label: "Aceitar o dinheiro", detail: "Reforça o rival", effects: { board: 4, fans: -6, morale: -2, rivalry: 2 }, news: "{club} vende {player} ao {rival} e revolta a torcida" },
      { label: "Só por um valor bem maior", effects: { board: 1, fans: 1 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "board-president-dressing-room",
    area: "board",
    topic: "board",
    weight: 1.2,
    cooldownDays: 60,
    cast: (scene) => ((marginToday(scene) ?? 0) <= -2 ? {} : null),
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "Presidente invade o vestiário do {club}", body: "Depois da derrota, o presidente desceu e quis falar com o elenco. Está na porta esperando o senhor deixar." },
      { headline: "Presidente do {club} quer cobrar os jogadores", body: "“Eu pago o salário, eu tenho direito de falar”, disse ele ao segurança do vestiário." },
      { headline: "Clima tenso no vestiário do {club}", body: "O presidente desceu com dois conselheiros. Os jogadores olham para o senhor esperando o que vai acontecer." },
    ],
    choices: [
      { label: "Barrar a entrada", detail: "Vestiário é do técnico", effects: { board: -3, morale: 3 }, news: "{coach} barra o presidente no vestiário do {club}" },
      { label: "Deixar o presidente falar", effects: { board: 2, morale: -3 } },
      { label: "Conversar com ele no corredor", effects: { morale: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "board-council-summons",
    area: "board",
    topic: "board",
    weight: 2,
    cooldownDays: 90,
    cast: (scene) => ((board(scene)?.pressure ?? 0) > 0.8 ? {} : null),
    setting: "Na sede do clube, à noite",
    texts: [
      { headline: "Conselho do {club} convoca o técnico", body: "Os conselheiros querem ouvir {coach} numa reunião extraordinária na quinta-feira." },
      { headline: "{coach} chamado a se explicar no conselho", body: "A ala de oposição conseguiu as assinaturas. O técnico tem que apresentar um plano para o resto do ano." },
      { headline: "Reunião extraordinária no {club}", body: "Na pauta, “o momento do futebol”. Todo mundo sabe quem vai estar sentado na frente da mesa." },
    ],
    choices: [
      { label: "Ir e apresentar um plano", detail: "Slides, números e muita paciência", effects: { board: 3 } },
      { label: "Mandar o diretor de futebol", effects: { board: -2 } },
      { label: "Recusar: lugar de técnico é no campo", effects: { board: -5, fans: 1, morale: 1 }, news: "{coach} não vai ao conselho do {club}" },
    ],
  },
];
