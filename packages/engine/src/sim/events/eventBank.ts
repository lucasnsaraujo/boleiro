import { addDays } from "../dates.js";
import type { Fixture, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { isInjured } from "../players/isInjured.js";
import { tierOf } from "../finances/tierOf.js";
import { eventMemoryOf, rivalryKey, type Cast } from "./eventMemory.js";
import type { EventScene, EventType } from "./eventType.js";

// Every number below is a guess: event sizes are judged against what a match moves (a win moves
// squad morale by about 5 points and the fans by about 7, reactToDay), so an event weighs less than a
// match, and money against the club's own wage bill so it scales from Série A to Série D.

const fit = (scene: EventScene) => scene.squad.filter((player) => !isInjured(player, scene.date));
const pickFrom = <T>(scene: EventScene, items: readonly T[]): T | undefined => items[Math.floor(scene.random() * items.length)];
const playerCast = (player: SimPlayer | undefined): Cast | null => (player ? { playerId: player.id } : null);
const byStrength = (players: readonly SimPlayer[]) => [...players].sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const finance = (scene: EventScene) => scene.state.finances[scene.clubId];
const wageBill = (scene: EventScene) => scene.squad.reduce((sum, player) => sum + player.wage, 0);
const wageOf = (scene: EventScene, cast: Cast) => (cast.playerId ? (scene.state.players[cast.playerId]?.wage ?? 0) : 0);
const round = (money: number) => Math.round(money / 10_000) * 10_000;

/** The club's match today, if it played. */
function playedToday(scene: EventScene): Fixture | undefined {
  return scene.played.find((f) => f.result && (f.homeId === scene.clubId || f.awayId === scene.clubId));
}

/** Goals for minus against in the club's match today; null without one. */
function marginToday(scene: EventScene): number | null {
  const fixture = playedToday(scene);
  if (!fixture?.result) return null;
  const { homeGoals, awayGoals } = fixture.result;
  return fixture.homeId === scene.clubId ? homeGoals - awayGoals : awayGoals - homeGoals;
}

/** Points of the club's last games, newest last. */
const recentPoints = (scene: EventScene) => finance(scene)?.recentPoints ?? [];
const lastGames = (scene: EventScene, count: number) => recentPoints(scene).slice(-count);
const isRun = (scene: EventScene, count: number, points: number) => lastGames(scene, count).length === count && lastGames(scene, count).every((p) => p === points);

/** Whether the club played one of its rivals today. */
function playedRivalToday(scene: EventScene): boolean {
  const today = playedToday(scene);
  const opponent = today && (today.homeId === scene.clubId ? today.awayId : today.homeId);
  return !!opponent && (rivalsOf(scene.state.clubs).get(scene.clubId)?.has(opponent) ?? false);
}

// guess: every five points of heat between two clubs (rivalryKey) make their rivalry events one weight more likely.
const HEAT_PER_WEIGHT = 5;

/** How much the heat the event's rivalry built up adds to its odds. */
function heatOf(scene: EventScene, cast: Cast): number {
  return cast.rivalId ? (eventMemoryOf(scene.state).rivalry[rivalryKey(scene.clubId, cast.rivalId)] ?? 0) / HEAT_PER_WEIGHT : 0;
}

/** A rival of the club: the one it played today when it did, else any of them. */
function rivalCast(scene: EventScene): Cast | null {
  const rivals = [...(rivalsOf(scene.state.clubs).get(scene.clubId) ?? [])].sort();
  const today = playedToday(scene);
  const opponent = today && (today.homeId === scene.clubId ? today.awayId : today.homeId);
  const rivalId = opponent && rivals.includes(opponent) ? opponent : pickFrom(scene, rivals);
  return rivalId ? { rivalId } : null;
}

const board = (scene: EventScene) => scene.state.boards[scene.clubId];

export const EVENT_BANK: readonly EventType[] = [
  // Players
  {
    id: "player-wedding",
    area: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, fit(scene).filter((p) => p.age >= 23 && p.age <= 34))),
    setting: "No CT, depois do treino",
    texts: [
      { headline: "{player} vai casar no sábado", body: "“Professor, marquei o casamento faz um ano. Queria dois dias para ir e voltar.”" },
      { headline: "{player} pede folga para casar", body: "“A cerimônia é na minha cidade. Se o senhor liberar, volto na segunda cedo.”" },
    ],
    choices: [
      { label: "Liberar os dois dias", detail: "Ele perde o treino e volta descansado", effects: { morale: 3, outDays: 2 }, news: "{club} libera {player} para casar" },
      { label: "Liberar só o dia da festa", detail: "Vai e volta no mesmo dia", effects: { morale: 1, outDays: 1 } },
      { label: "Pedir para adiar", detail: "A temporada não para", effects: { morale: -4 }, news: "{player} adia o casamento a pedido do técnico" },
    ],
  },
  {
    id: "player-illness",
    area: "players",
    weight: 1.5,
    cooldownDays: 21,
    cast: (scene) => playerCast(pickFrom(scene, fit(scene))),
    texts: [
      { headline: "{player} pega virose e desfalca o {club}", body: "O {position} passou a noite no hospital e fica fora por alguns dias." },
      { headline: "Gripe tira {player} dos treinos", body: "O departamento médico do {club} prevê a volta dele na semana que vem." },
      { headline: "{player} sente dor de dente e vai ao dentista", body: "Teve de tirar um siso. O {club} espera ter o {position} de volta logo." },
    ],
    effects: { outDays: 4, morale: -1 },
  },
  {
    id: "player-wants-out",
    area: "players",
    weight: 1.2,
    cooldownDays: 45,
    once: "player",
    // A good player who barely plays: in the squad's better half, with fewer minutes than the regulars.
    cast: (scene) => {
      const ranked = byStrength(scene.squad);
      const better = ranked.slice(0, Math.ceil(ranked.length / 2));
      const benched = better.filter((p) => p.condition.seasonMinutes < 270 && p.age < 32);
      return scene.date.slice(5) >= "03-01" ? playerCast(pickFrom(scene, benched)) : null;
    },
    setting: "Na sala do técnico",
    texts: [
      { headline: "{player} quer sair do {club}", body: "“Não estou jogando. Quero ser negociado na próxima janela.”" },
      { headline: "{player} pede para ser negociado", body: "“Respeito o senhor, mas preciso jogar. Se não for aqui, quero ir para onde eu jogue.”" },
    ],
    choices: [
      { label: "Prometer chances nos próximos jogos", detail: "Ele fica e espera a vez", effects: { morale: 2 } },
      { label: "Pôr à venda na janela", detail: "A diretoria gosta de fazer caixa", effects: { morale: 1, board: 2 }, news: "{club} aceita negociar {player}" },
      { label: "Dizer que ele fica", detail: "Contrato é contrato", effects: { morale: -4 }, news: "{player} fica no {club} contra a vontade" },
    ],
  },
  {
    id: "player-contract-row",
    area: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    // One of the squad's five best with less than six months of contract left.
    cast: (scene) => {
      const ending = byStrength(scene.squad).slice(0, 5).filter((p) => p.contractUntil <= addDays(scene.date, 180));
      return playerCast(pickFrom(scene, ending));
    },
    setting: "Na sede do clube",
    texts: [
      { headline: "{player} bate boca com a diretoria", body: "A renovação travou no salário. Ele saiu da reunião falando alto e quer saber de que lado o senhor está." },
      { headline: "Renovação de {player} vira briga", body: "O empresário diz que o {club} enrola. A diretoria diz que a proposta é justa. Os dois ligam para o senhor." },
    ],
    choices: [
      { label: "Defender o jogador", detail: "O elenco gosta, a diretoria não", effects: { morale: 3, board: -4 }, news: "Técnico do {club} compra a briga de {player}" },
      { label: "Ficar com a diretoria", detail: "Ele fica chateado", effects: { morale: -3, board: 3 } },
      { label: "Não se meter", effects: { morale: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "player-late-training",
    area: "players",
    weight: 1,
    cooldownDays: 30,
    cast: (scene) => playerCast(pickFrom(scene, fit(scene).filter((p) => p.age <= 25 || p.trait === "aggressive"))),
    setting: "No CT, de manhã",
    texts: [
      { headline: "{player} chega atrasado ao treino", body: "Chegou quarenta minutos depois do grupo. Disse que o carro quebrou na ponte." },
      { headline: "{player} perde a hora", body: "O {position} entrou no campo com o aquecimento acabando. Os mais velhos estão olhando o que o senhor vai fazer." },
    ],
    choices: [
      { label: "Multar, como manda o regulamento", detail: "10% do salário vai para o caixa", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Conversar em particular", effects: { morale: 1 } },
      { label: "Barrar do próximo jogo", detail: "Fica fora da lista de relacionados", effects: { morale: -2, board: 1, outDays: 3 }, news: "{player} é barrado por atraso no {club}" },
    ],
  },
  {
    id: "player-barbecue",
    area: "players",
    weight: 1,
    cooldownDays: 45,
    cast: (scene) => playerCast(pickFrom(scene, byStrength(scene.squad).filter((p) => p.age >= 27))),
    texts: [
      { headline: "{player} faz churrasco para o elenco", body: "O {position} reuniu o grupo em casa no dia de folga. Até a comissão técnica foi." },
      { headline: "Folga com pagode na casa de {player}", body: "O elenco do {club} passou a tarde na casa do {position}, com família e churrasco." },
    ],
    effects: { morale: 2 },
  },
  {
    id: "player-baby",
    area: "players",
    weight: 0.6,
    cooldownDays: 30,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, scene.squad.filter((p) => p.age >= 23 && p.age <= 36))),
    texts: [
      { headline: "{player} vai ser pai", body: "O {position} contou a novidade no vestiário e já prometeu comemorar o próximo gol embalando o bebê." },
      { headline: "Nasce o filho de {player}", body: "O {position} do {club} mostrou a foto do bebê para o elenco inteiro antes do treino." },
    ],
    effects: { morale: 1 },
  },
  {
    id: "veteran-retirement",
    area: "players",
    weight: 1.5,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => (scene.date.slice(5) >= "07-01" ? playerCast(pickFrom(scene, scene.squad.filter((p) => p.age >= 34))) : null),
    setting: "No CT, depois do treino",
    texts: [
      { headline: "{player} vai parar em dezembro", body: "“Professor, o corpo já pediu. Quero terminar a carreira aqui e me despedir da torcida no {stadium}.”" },
      { headline: "{player} anuncia que vai se aposentar", body: "“Com {age} anos, chega. Quero sair jogando, não no departamento médico.”" },
    ],
    choices: [
      {
        label: "Fazer a despedida no último jogo em casa",
        detail: "Festa no {stadium}, com a família no gramado",
        effects: (scene) => ({ morale: 4, fans: 6, money: round((finance(scene)?.baseCrowd ?? 0) * (finance(scene)?.ticketPrice ?? 0) * 0.2) }),
        news: "{club} prepara a despedida de {player}",
      },
      { label: "Pedir mais um ano", detail: "Mais um ano de salário na folha", effects: (scene, cast) => ({ morale: 2, fans: 3, board: -5, money: -round(wageOf(scene, cast) * 12) }), news: "{player} adia a aposentadoria a pedido do técnico" },
      { label: "Chamar para ser seu auxiliar em janeiro", detail: "Ele aprende o ofício ao seu lado", effects: (scene, cast) => ({ morale: 3, fans: 4, board: 1, money: -round(wageOf(scene, cast) * 3) }), news: "{player} vai ser auxiliar no {club}" },
    ],
  },
  {
    id: "young-star-agent",
    area: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, byStrength(scene.squad).slice(0, 11).filter((p) => p.age <= 21))),
    setting: "Por telefone",
    texts: [
      { headline: "Empresário de {player} quer aumento", body: "“O menino é titular e ganha como reserva. Tem clube da Europa ligando toda semana.”" },
      { headline: "{player} pede salário de titular", body: "O empresário do {position} de {age} anos quer conversar ainda esta semana." },
    ],
    choices: [
      { label: "Dar o aumento", detail: "Seis meses de salário a mais no ano", effects: (scene, cast) => ({ morale: 2, board: -2, money: -round(wageOf(scene, cast) * 6) }), news: "{club} aumenta o salário de {player}" },
      { label: "Segurar até o fim da temporada", effects: { morale: -2, board: 1 } },
      { label: "Ouvir propostas", detail: "A diretoria agradece", effects: { morale: -1, board: 3, fans: -2 }, news: "{club} abre negociação por {player}" },
    ],
    assistantChoice: 1,
  },
  {
    id: "injured-treatment-abroad",
    area: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, scene.squad.filter((p) => p.condition.injuredUntil !== null && p.condition.injuredUntil > addDays(scene.date, 20)))),
    setting: "No departamento médico",
    texts: [
      { headline: "{player} quer se tratar fora do país", body: "“Tem uma clínica em Barcelona que recupera isso em menos tempo. O clube paga?”" },
      { headline: "{player} pede tratamento no exterior", body: "O {position} confia mais no médico particular do que no departamento do {club}." },
    ],
    choices: [
      { label: "Pagar a clínica", detail: "Ele fica grato", effects: (scene, cast) => ({ morale: 2, money: -round(wageOf(scene, cast) * 1.5 + 100_000) }) },
      { label: "Tratar no clube", detail: "O departamento médico agradece a confiança", effects: { morale: -1, board: 1 } },
    ],
    assistantChoice: 1,
  },
  // Squad
  {
    id: "dressing-room-fight",
    area: "squad",
    weight: 2,
    cooldownDays: 45,
    cast: (scene) => ((marginToday(scene) ?? 0) < 0 ? playerCast(pickFrom(scene, fit(scene).filter((p) => p.age >= 24))) : null),
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "Briga no vestiário do {club}", body: "{player} e um companheiro trocaram empurrões depois da derrota. A porta estava aberta e a imprensa ouviu tudo." },
      { headline: "{player} discute com companheiro após derrota", body: "Começou com uma cobrança sobre o gol sofrido e só parou quando o capitão entrou no meio." },
    ],
    choices: [
      { label: "Multar os dois", detail: "Regra é regra", effects: { morale: -2, board: 2 } },
      { label: "Resolver na conversa", effects: { morale: 1 } },
      { label: "Afastar {player} por uma semana", effects: { morale: -1, board: 1, outDays: 7 }, news: "{club} afasta {player} depois de briga" },
    ],
    assistantChoice: 1,
  },
  {
    id: "losing-run-meeting",
    area: "squad",
    weight: 3,
    cooldownDays: 30,
    cast: (scene) => (isRun(scene, 3, 0) ? {} : null),
    setting: "No CT, de manhã",
    texts: [
      { headline: "Elenco do {club} pede reunião", body: "Três derrotas seguidas. Os líderes do grupo querem conversar com o senhor antes do treino." },
      { headline: "Jogadores do {club} querem conversa", body: "O capitão bateu na porta: “Professor, o grupo precisa falar. Do jeito que está, não dá.”" },
    ],
    choices: [
      { label: "Reunião só com os jogadores", detail: "Sem a diretoria na sala", effects: { morale: 4, board: -2 } },
      { label: "Treino fechado e cobrança", effects: { morale: -2, fans: 2, board: 1 }, news: "{coach} fecha o treino e cobra o elenco do {club}" },
      { label: "Dois dias de folga", detail: "Cabeça fresca para o próximo jogo", effects: { morale: 3, fans: -3 } },
    ],
  },
  {
    id: "winning-run-bonus",
    area: "squad",
    weight: 3,
    cooldownDays: 45,
    cast: (scene) => (isRun(scene, 4, 3) ? {} : null),
    setting: "No vestiário",
    texts: [
      { headline: "Elenco do {club} pede bicho extra", body: "Quatro vitórias seguidas. O capitão quer saber se a diretoria vai premiar o grupo." },
      { headline: "Jogadores do {club} cobram premiação", body: "“Estamos fazendo nossa parte, professor. O senhor fala com a diretoria?”" },
    ],
    choices: [
      { label: "Pagar o bicho", detail: "Um décimo da folha do mês", effects: (scene) => ({ morale: 4, board: -1, money: -round(wageBill(scene) * 0.1) }), news: "{club} paga bicho extra pela sequência de vitórias" },
      { label: "Só se vier título", effects: { morale: -2, board: 2 } },
      { label: "Um jantar com as famílias", detail: "Custa pouco e une o grupo", effects: { morale: 2, money: -50_000 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "squad-celebration",
    area: "squad",
    weight: 1,
    cooldownDays: 30,
    cast: (scene) => ((marginToday(scene) ?? 0) >= 3 ? {} : null),
    texts: [
      { headline: "Goleada vira festa no vestiário do {club}", body: "Teve pagode, banho de água gelada no roupeiro e até o presidente desceu para cumprimentar o grupo." },
      { headline: "Vestiário em festa depois da goleada", body: "O elenco do {club} saiu do estádio cantando. Faz tempo que o grupo não ria assim." },
    ],
    effects: { morale: 2 },
  },
  {
    id: "squad-flu",
    area: "squad",
    weight: 0.8,
    cooldownDays: 60,
    cast: (scene) => playerCast(pickFrom(scene, fit(scene))),
    texts: [
      { headline: "Surto de gripe no {club}", body: "{player} acordou com febre e ficou em casa. O médico teme que a gripe pegue o resto do grupo." },
      { headline: "Virose se espalha pelo elenco do {club}", body: "{player} foi o primeiro a cair. O médico pediu reforço no álcool em gel." },
    ],
    effects: { outDays: 3, morale: -2 },
  },
  // Board
  {
    id: "board-wants-sale",
    area: "board",
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
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((board(scene)?.pressure ?? 0) < -0.25 && (board(scene)?.games ?? 0) >= 5 ? {} : null),
    texts: [
      { headline: "Presidente do {club} prestigia o técnico", body: "“O projeto é de longo prazo. Ele fica até o fim do contrato, no mínimo.”" },
      { headline: "{coach} é prestigiado pela diretoria do {club}", body: "O presidente visitou o CT, almoçou com a comissão técnica e falou em renovação." },
    ],
    effects: { board: 2, morale: 1 },
  },
  {
    id: "board-ultimatum",
    area: "board",
    weight: 3,
    cooldownDays: 45,
    cast: (scene) => ((board(scene)?.pressure ?? 0) > 0.6 && (board(scene)?.games ?? 0) >= 4 ? {} : null),
    setting: "Na sede do clube, à noite",
    texts: [
      { headline: "Ultimato da diretoria do {club}", body: "O presidente quer resultado nos próximos dois jogos. “Não é ameaça, é o que o torcedor cobra.”" },
      { headline: "{coach} na corda bamba", body: "A diretoria do {club} se reuniu sem o técnico. Saiu da sala dizendo que a paciência acabou." },
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
    weight: 2,
    cooldownDays: 90,
    cast: (scene) => ((finance(scene)?.cash ?? 0) < 0 ? {} : null),
    texts: [
      { headline: "{club} corta gastos", body: "Sem dinheiro em caixa, a diretoria suspendeu viagens e reduziu a equipe do CT." },
      { headline: "Crise no caixa do {club}", body: "O clube atrasou fornecedores e cortou o lanche depois do treino. O elenco reclamou." },
    ],
    effects: { morale: -2, fans: -1 },
  },
  {
    id: "sponsor-bonus",
    area: "board",
    weight: 1,
    cooldownDays: 90,
    cast: (scene) => {
      const own = board(scene);
      return own && own.games >= 8 && own.position <= Math.min(4, own.targetPosition) ? {} : null;
    },
    texts: [
      { headline: "Patrocinador premia a campanha do {club}", body: "A boa fase rendeu um bônus de contrato. O dinheiro entra ainda neste mês." },
      { headline: "{club} recebe bônus do patrocínio", body: "A cláusula de desempenho foi atingida e o patrocinador master pagou o prêmio." },
    ],
    effects: (scene) => ({ money: round((finance(scene)?.sponsorship ?? 0) * 0.03), board: 1 }),
  },
  {
    id: "director-lineup",
    area: "board",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    // A young player outside the eleven the director of football wants to see.
    cast: (scene) => playerCast(pickFrom(scene, byStrength(fit(scene)).slice(11).filter((p) => p.age <= 21))),
    setting: "Por mensagem",
    texts: [
      { headline: "Diretor quer {player} no time", body: "“O menino tem {age} anos e mercado. Precisa de vitrine. Pensa com carinho.”" },
      { headline: "Diretoria pede espaço para {player}", body: "O vice de futebol acha que o {position} da base merece jogar e mandou recado pelo gerente." },
    ],
    choices: [
      { label: "Dar minutos a {player}", effects: { board: 3, morale: -1 } },
      { label: "Dizer que quem escala é você", effects: { board: -4, morale: 2, fans: 1 }, news: "{coach} rebate a diretoria: “Quem escala sou eu”" },
      { label: "Levar para o banco", detail: "Fica entre os relacionados", effects: { board: 1 } },
    ],
    assistantChoice: 2,
  },
  // Fans
  {
    id: "fans-protest-ct",
    area: "fans",
    weight: (scene) => (clubMood(scene.state, scene.clubId).fans < 25 ? 3 : 1.5),
    cooldownDays: 30,
    cast: (scene) => (clubMood(scene.state, scene.clubId).fans < 35 ? {} : null),
    setting: "No portão do CT",
    texts: [
      { headline: "Torcida protesta no CT do {club}", body: "Uns cem torcedores com faixas esperam no portão. Querem falar com o técnico e com os jogadores." },
      { headline: "Organizada cobra o elenco do {club}", body: "“Time sem vergonha!”, gritavam na entrada do treino. Há uma comissão pedindo para entrar." },
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
    weight: 2,
    cooldownDays: 30,
    cast: (scene) => {
      const today = playedToday(scene);
      return today && today.awayId === scene.clubId && (marginToday(scene) ?? 0) > 0 ? {} : null;
    },
    texts: [
      { headline: "Festa no aeroporto para o {club}", body: "Centenas de torcedores esperaram o elenco no desembarque depois da vitória fora de casa." },
      { headline: "Torcida recebe o {club} com fogos", body: "O ônibus levou uma hora para sair do aeroporto. Ninguém reclamou." },
    ],
    effects: { fans: 3, morale: 2 },
  },
  {
    id: "fans-chant-idol",
    area: "fans",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((marginToday(scene) ?? -1) > 0 ? playerCast(byStrength(scene.squad)[0]) : null),
    texts: [
      { headline: "Torcida canta o nome de {player}", body: "Depois do apito final, o estádio inteiro pediu o {position}. Ele voltou do túnel para agradecer." },
      { headline: "{player} é ovacionado pela torcida do {club}", body: "O {position} saiu de campo aplaudido de pé e jogou a camisa para a arquibancada." },
    ],
    effects: { fans: 2, morale: 1 },
  },
  {
    id: "fans-ticket-price",
    area: "fans",
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
    ],
    choices: [
      { label: "Pedir à diretoria uma promoção para sócios", detail: "A diretoria banca o desconto no próximo jogo", effects: (scene) => ({ fans: 3, money: -round((finance(scene)?.baseCrowd ?? 0) * (finance(scene)?.ticketPrice ?? 0) * 0.1) }) },
      { label: "Defender o preço", detail: "O clube precisa da receita", effects: { fans: -3, board: 2 } },
      { label: "Não comentar", effects: { fans: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "rival-provocation",
    area: "fans",
    weight: (scene, cast) => (playedRivalToday(scene) ? 4 : 0.3) + heatOf(scene, cast),
    cooldownDays: 45,
    cast: rivalCast,
    setting: "Nas redes sociais",
    texts: [
      { headline: "Torcida do {rival} provoca o {club}", body: "Um outdoor perto do {stadium} lembra o último clássico. A torcida quer resposta." },
      { headline: "{rival} provoca nas redes", body: "O perfil oficial do {rival} postou uma piada com o {club}. O elenco viu." },
    ],
    choices: [
      { label: "Responder na mesma moeda", detail: "A torcida adora, a diretoria nem tanto", effects: { fans: 4, board: -2, rivalry: 5 }, news: "{coach} responde à provocação do {rival}" },
      { label: "Pedir respeito", effects: { fans: -1, board: 1, rivalry: -1 } },
      { label: "Deixar para o campo", effects: { morale: 1, rivalry: 1 } },
    ],
    assistantChoice: 2,
  },
  // Press
  {
    id: "press-rival",
    area: "press",
    look: "press",
    weight: (scene, cast) => (playedRivalToday(scene) ? 4 : 0.6) + heatOf(scene, cast),
    cooldownDays: 21,
    cast: rivalCast,
    setting: "Coletiva no CT",
    texts: [
      { headline: "Coletiva: o {rival} na pauta", body: "“O {rival} anda dizendo que o {club} não assusta ninguém. O senhor concorda?”" },
      { headline: "Coletiva: pergunta sobre o {rival}", body: "“No {rival} dizem que o seu time joga por uma bola. Qual é a resposta?”" },
    ],
    choices: [
      { label: "“Respeito o {rival}. Mas a gente se fala no campo.”", effects: { morale: 2, fans: 1, rivalry: 1 } },
      { label: "“Quem fala muito é quem tem pouco a mostrar.”", detail: "Vira manchete amanhã", effects: { morale: 3, board: -2, fans: 5, rivalry: 4 }, news: "{coach} alfineta o {rival}: “Quem fala muito tem pouco a mostrar”" },
      { label: "“Não falo do {rival}. Falo do {club}.”", effects: { board: 2, fans: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "press-crisis",
    area: "press",
    look: "press",
    weight: 2,
    cooldownDays: 21,
    cast: (scene) => ((marginToday(scene) ?? 0) < 0 && lastGames(scene, 3).filter((p) => p === 0).length >= 2 ? {} : null),
    setting: "Coletiva depois do jogo",
    texts: [
      { headline: "Coletiva: o cargo em jogo", body: "“Mais uma derrota. O senhor se sente ameaçado no cargo?”" },
      { headline: "Coletiva: cobrança depois da derrota", body: "“Mais um jogo sem vitória. O que o senhor diz ao torcedor?”" },
    ],
    choices: [
      { label: "“A responsabilidade é minha. O grupo está comigo.”", effects: { morale: 3, board: -1, fans: 1 } },
      { label: "“Faltou atitude de alguns jogadores.”", detail: "O vestiário não vai gostar", effects: { morale: -4, fans: 3, board: 2 }, news: "{coach} cobra o elenco do {club} em público" },
      { label: "“Não penso nisso. Penso no próximo jogo.”", effects: { board: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "tv-interview",
    area: "press",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((board(scene)?.games ?? 0) >= 3 ? {} : null),
    setting: "Por telefone",
    texts: [
      { headline: "Programa de TV convida {coach}", body: "O programa de domingo à noite quer o senhor ao vivo no estúdio, uma hora de entrevista." },
      { headline: "Mesa redonda quer ouvir {coach}", body: "O apresentador ligou pessoalmente. O assunto é a temporada do {club}." },
    ],
    choices: [
      { label: "Aceitar e ir ao estúdio", effects: { fans: 2, board: 1, morale: -1 } },
      { label: "Mandar o auxiliar", effects: {} },
      { label: "Recusar", detail: "Domingo é dia de descanso", effects: { fans: -1, morale: 1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "night-out-leak",
    area: "press",
    weight: 1,
    cooldownDays: 45,
    cast: (scene) => playerCast(pickFrom(scene, scene.squad.filter((p) => p.age < 30))),
    texts: [
      { headline: "{player} flagrado em balada", body: "Um vídeo do {position} do {club} numa casa noturna circula desde a madrugada. A semana é de jogo." },
      { headline: "Foto de {player} na noite repercute", body: "A diretoria do {club} pediu explicações. O {position} diz que foi o aniversário de um amigo." },
    ],
    effects: { morale: -2, fans: -2 },
  },
];
