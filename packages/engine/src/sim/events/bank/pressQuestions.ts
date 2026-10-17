import { eventMemoryOf } from "../eventMemory.js";
import type { PressQuestionType } from "../eventType.js";
import {
  board,
  byStrength,
  injured,
  isRelegationFight,
  isRun,
  isTitleRace,
  isWindow,
  mood,
  nextMatch,
  playedToday,
  playsWithin,
  regulars,
  rivalCast,
  topScorer,
} from "./sceneReaders.js";

// A follow-up question moves less than a whole event: three of them make one press conference.

/** The questions a reporter may ask after a press conference's opening one, each when the day calls for it. */
export const PRESS_QUESTIONS: readonly PressQuestionType[] = [
  {
    id: "q-next-match",
    cast: (scene, cast) => (nextMatch(scene) ? cast : null),
    asks: [
      "“E o próximo jogo, professor? O que o torcedor pode esperar?”",
      "“Pensando no próximo compromisso: o time vai mudar alguma coisa?”",
      "“Qual o recado para o próximo jogo?”",
    ],
    choices: [
      { label: "“Jogo a jogo. O próximo é o mais importante.”", effects: { board: 1 } },
      { label: "“Pode esperar um time para cima, buscando o gol desde o começo.”", detail: "A torcida vai cobrar", effects: { fans: 2, morale: 1, board: -1 } },
      { label: "“Não vou dar a escalação de presente para o adversário.”", effects: { morale: 1, fans: -1 } },
    ],
  },
  {
    id: "q-rival",
    cast: (scene, cast) => {
      const rival = cast.rivalId ? null : rivalCast(scene);
      return rival && { ...cast, ...rival };
    },
    asks: ["“E o {rival}? Anda dizendo que o {club} está em crise.”", "“O torcedor do {rival} já está provocando. O senhor acompanha?”", "“Uma palavra sobre o {rival}?”"],
    choices: [
      { label: "“Respeito o {rival}, mas não perco tempo com eles.”", effects: { morale: 1, rivalry: 1 } },
      { label: "“O {rival} que se preocupe com a tabela deles.”", detail: "Vira manchete", effects: { fans: 3, board: -1, rivalry: 3 }, news: "{coach} provoca o {rival}" },
      { label: "“Aqui a gente só fala do {club}.”", effects: { board: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "q-board",
    cast: (scene, cast) => ((board(scene)?.pressure ?? 0) > 0.3 ? cast : null),
    asks: ["“A diretoria ainda confia no seu trabalho?”", "“O presidente deu entrevista criticando o time. Como fica a relação?”", "“O senhor conversou com a diretoria esta semana?”"],
    choices: [
      { label: "“Tenho total apoio. A gente conversa todo dia.”", effects: { board: 2, fans: -1 } },
      { label: "“Quem tem que dar resposta é o campo, não a sala do presidente.”", detail: "A diretoria não vai gostar", effects: { board: -3, fans: 2, morale: 1 }, news: "{coach} manda recado à diretoria do {club}" },
      { label: "“Isso a gente resolve internamente.”", effects: {} },
    ],
    assistantChoice: 2,
  },
  {
    id: "q-fans",
    cast: (scene, cast) => (mood(scene).fans < 45 ? cast : null),
    asks: ["“A torcida vaiou o time no último jogo. É justo?”", "“O torcedor está impaciente. O que o senhor diz a ele?”", "“Teve protesto no CT esta semana. Como o elenco recebeu?”"],
    choices: [
      { label: "“O torcedor tem razão. A gente precisa devolver em campo.”", effects: { fans: 3, morale: -1 } },
      { label: "“Vaiar o time no meio do jogo não ajuda ninguém.”", detail: "O elenco gosta, a arquibancada não", effects: { fans: -3, morale: 2 } },
      { label: "“Peço que venham e apoiem. Juntos a gente sai dessa.”", effects: { fans: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "q-star",
    cast: (scene, cast) => {
      const star = topScorer(scene)?.player ?? byStrength(scene.squad)[0];
      if (!star || (cast.playerId && cast.playerId !== star.id)) return null;
      return { ...cast, playerId: star.id };
    },
    asks: ["“{player} vive grande fase. Tem nível de Seleção?”", "“Dá para segurar {player} até o fim do ano?”", "“O que {player} tem de diferente?”"],
    choices: [
      { label: "“Tem nível para jogar em qualquer lugar do mundo.”", effects: { morale: 2, fans: 1 } },
      { label: "“Ele sabe que ainda pode dar muito mais.”", detail: "Cobrança pública", effects: { morale: -1, board: 1 } },
      { label: "“Não individualizo. O mérito é do grupo.”", effects: { morale: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "q-referee",
    cast: (scene, cast) => (eventMemoryOf(scene.state).news.some((item) => item.kind === "controversy" && item.date === scene.date && item.clubIds[0] === scene.clubId) ? cast : null),
    asks: ["“O que o senhor achou da arbitragem hoje?”", "“O lance polêmico mudou o jogo?”", "“Vai reclamar da arbitragem na CBF?”"],
    choices: [
      { label: "“Erraram contra a gente, as imagens estão aí.”", detail: "Pode render punição", effects: { fans: 2, board: -1, morale: 1 } },
      { label: "“O clube vai pedir o áudio do VAR.”", effects: { fans: 1, board: 1 } },
      { label: "“Não vou falar de arbitragem.”", effects: { board: 1, fans: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "q-title",
    cast: (scene, cast) => (isTitleRace(scene) ? cast : null),
    asks: ["“Dá para falar em título?”", "“O título passa pelo próximo jogo?”", "“O elenco já sente o cheiro da taça?”"],
    choices: [
      { label: "“Ainda tem muito campeonato pela frente.”", effects: { board: 1 } },
      { label: "“Viemos para ser campeões. Não escondo isso de ninguém.”", detail: "Vira manchete", effects: { fans: 3, morale: 2, board: -1 }, news: "{coach}: “Viemos para ser campeões”" },
      { label: "“Quem pensa na taça antes da hora tropeça.”", effects: { morale: 1 } },
    ],
  },
  {
    id: "q-relegation",
    cast: (scene, cast) => (isRelegationFight(scene) ? cast : null),
    asks: ["“O {club} corre risco real de cair?”", "“Quantos pontos o senhor acha que livram do rebaixamento?”", "“O elenco aguenta a pressão da zona?”"],
    choices: [
      { label: "“Esse clube não vai cair. Eu garanto.”", detail: "Uma promessa pública", effects: { fans: 2, morale: 2, board: -1 }, news: "{coach} garante: “O {club} não vai cair”" },
      { label: "“Situação difícil. Temos que ser honestos com o torcedor.”", effects: { fans: 1, morale: -1, board: 1 } },
      { label: "“Não olho a tabela. Olho o próximo jogo.”", effects: {} },
    ],
  },
  {
    id: "q-window",
    cast: (scene, cast) => (isWindow(scene) ? cast : null),
    asks: ["“Vem reforço nesta janela?”", "“O senhor pediu algum nome à diretoria?”", "“O elenco está fechado ou ainda chega alguém?”"],
    choices: [
      { label: "“O elenco é bom. Se vier alguém, que venha para somar.”", effects: { morale: 2 } },
      { label: "“Pedi dois reforços. Agora é com a diretoria.”", detail: "Pressão no presidente", effects: { board: -2, fans: 2 } },
      { label: "“Mercado é com a diretoria.”", effects: { board: 1 } },
    ],
  },
  {
    id: "q-injuries",
    cast: (scene, cast) => (injured(scene).length >= 3 ? cast : null),
    asks: ["“O departamento médico está cheio. Preocupa?”", "“Com tantos desfalques, dá para manter o nível?”", "“O que está acontecendo com tantas lesões?”"],
    choices: [
      { label: "“Quem entrar vai dar conta. Confio em todo mundo.”", effects: { morale: 2 } },
      { label: "“O calendário está matando os jogadores.”", effects: { fans: 1, board: -1 } },
      { label: "“A gente vai revisar a carga de treino.”", effects: { board: 1 } },
    ],
  },
  {
    id: "q-future",
    cast: (scene, cast) => ((board(scene)?.pressure ?? 0) > 0.5 ? cast : null),
    asks: ["“O senhor se sente ameaçado no cargo?”", "“Se perder o próximo jogo, o senhor continua?”", "“Já pensou em entregar o cargo?”"],
    choices: [
      { label: "“Não penso nisso. Tenho contrato e trabalho a fazer.”", effects: { board: 1 } },
      { label: "“Se a diretoria quiser trocar, que troque. Eu não saio.”", effects: { board: -2, fans: 2, morale: 1 }, news: "{coach}: “Eu não saio”" },
      { label: "“Eu sou o primeiro responsável.”", effects: { morale: 2, board: -1 } },
    ],
  },
  {
    id: "q-youth",
    cast: (scene, cast) => {
      const kid = regulars(scene).find((p) => p.age <= 21);
      if (!kid || (cast.playerId && cast.playerId !== kid.id)) return null;
      return { ...cast, playerId: kid.id };
    },
    asks: ["“{player} tem {age} anos e já é titular. Qual o teto dele?”", "“Não é cedo para colocar tanta responsabilidade em {player}?”", "“Já tem clube de fora de olho em {player}?”"],
    choices: [
      { label: "“O garoto é especial, mas vamos com calma.”", effects: { morale: 1 } },
      { label: "“Vai ser o melhor do país na posição.”", detail: "Holofote em cima dele", effects: { fans: 2, morale: -1 } },
      { label: "“Sobre mercado, só a diretoria fala.”", effects: { board: 1 } },
    ],
  },
  {
    id: "q-calendar",
    cast: (scene, cast) => (playedToday(scene) && playsWithin(scene, 3) ? cast : null),
    asks: ["“Três jogos em uma semana. Vai poupar?”", "“O elenco aguenta essa maratona?”", "“O calendário atrapalha o seu trabalho?”"],
    choices: [
      { label: "“Vou rodar o elenco. Todo mundo vai jogar.”", effects: { morale: 2, fans: -1 } },
      { label: "“O calendário do futebol brasileiro é uma vergonha.”", detail: "A CBF não gosta", effects: { fans: 2, board: -1 }, news: "{coach} critica o calendário" },
      { label: "“Quem joga no {club} tem que estar pronto.”", effects: { board: 1, morale: -1 } },
    ],
  },
  {
    id: "q-good-run",
    cast: (scene, cast) => (isRun(scene, 3, 3) ? cast : null),
    asks: ["“Três vitórias seguidas. O que mudou?”", "“O time encaixou de vez?”", "“O {club} é favorito agora?”"],
    choices: [
      { label: "“Mérito dos jogadores. Eles compraram a ideia.”", effects: { morale: 2 } },
      { label: "“Ainda estamos longe do que eu quero.”", effects: { morale: -1, board: 1 } },
      { label: "“Favorito é quem ganha. A gente só quer continuar.”", effects: { fans: 1 } },
    ],
  },
];

/** Every follow-up question but those the conference's opening one already covers. */
export const followUpsBut = (...ids: readonly string[]): readonly PressQuestionType[] => PRESS_QUESTIONS.filter((question) => !ids.includes(question.id));
