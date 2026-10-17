import { addDays } from "../../dates.js";
import type { EventType } from "../eventType.js";
import { byStrength, fit, fringe, isForeign, isRelegationFight, marginToday, pickFrom, playedToday, playerCast, regulars, round, seasonGoals, standing, wageOf } from "./sceneReaders.js";

/** A player's career at the club: minutes, contracts, his agent, his ambitions. */
export const PLAYER_EVENTS: readonly EventType[] = [
  {
    id: "player-wants-out",
    area: "players",
    topic: "players",
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
      { headline: "{player} bate na porta e pede para sair", body: "“Professor, treino bem a semana inteira e no domingo fico no banco. Não dá mais para mim.”" },
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
    topic: "players",
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
      { headline: "{player} e diretoria não se entendem", body: "Faltam poucos meses de contrato. O jogador acha a oferta baixa e o vice de futebol não sobe nem um real." },
    ],
    choices: [
      { label: "Defender o jogador", detail: "O elenco gosta, a diretoria não", effects: { morale: 3, board: -4 }, news: "Técnico do {club} compra a briga de {player}" },
      { label: "Ficar com a diretoria", detail: "Ele fica chateado", effects: { morale: -3, board: 3 } },
      { label: "Não se meter", effects: { morale: -1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "young-star-agent",
    area: "players",
    topic: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, regulars(scene).filter((p) => p.age <= 21))),
    setting: "Por telefone",
    texts: [
      { headline: "Empresário de {player} quer aumento", body: "“O menino é titular e ganha como reserva. Tem clube da Europa ligando toda semana.”" },
      { headline: "{player} pede salário de titular", body: "O empresário do {position} de {age} anos quer conversar ainda esta semana." },
      { headline: "Pai de {player} cobra valorização", body: "“Meu filho joga todo domingo e recebe o mesmo de quando subiu da base. Isso tem que mudar.”" },
    ],
    choices: [
      { label: "Dar o aumento", detail: "Seis meses de salário a mais no ano", effects: (scene, cast) => ({ morale: 2, board: -2, money: -round(wageOf(scene, cast) * 6) }), news: "{club} aumenta o salário de {player}" },
      { label: "Segurar até o fim da temporada", effects: { morale: -2, board: 1 } },
      { label: "Ouvir propostas", detail: "A diretoria agradece", effects: { morale: -1, board: 3, fans: -2 }, news: "{club} abre negociação por {player}" },
    ],
    assistantChoice: 1,
  },
  {
    id: "veteran-retirement",
    area: "players",
    topic: "players",
    weight: 1.5,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => (scene.date.slice(5) >= "07-01" ? playerCast(pickFrom(scene, scene.squad.filter((p) => p.age >= 34))) : null),
    setting: "No CT, depois do treino",
    texts: [
      { headline: "{player} vai parar em dezembro", body: "“Professor, o corpo já pediu. Quero terminar a carreira aqui e me despedir da torcida no {stadium}.”" },
      { headline: "{player} anuncia que vai se aposentar", body: "“Com {age} anos, chega. Quero sair jogando, não no departamento médico.”" },
      { headline: "{player} avisa: é a última temporada", body: "“Já conversei com a família. Quero fechar bem o ano e pendurar as chuteiras vestindo essa camisa.”" },
    ],
    choices: [
      {
        label: "Fazer a despedida no último jogo em casa",
        detail: "Festa no {stadium}, com a família no gramado",
        effects: (scene) => {
          const money = scene.state.finances[scene.clubId];
          return { morale: 4, fans: 6, money: round((money?.baseCrowd ?? 0) * (money?.ticketPrice ?? 0) * 0.2) };
        },
        news: "{club} prepara a despedida de {player}",
      },
      { label: "Pedir mais um ano", detail: "Mais um ano de salário na folha", effects: (scene, cast) => ({ morale: 2, fans: 3, board: -5, money: -round(wageOf(scene, cast) * 12) }), news: "{player} adia a aposentadoria a pedido do técnico" },
      { label: "Chamar para ser seu auxiliar em janeiro", detail: "Ele aprende o ofício ao seu lado", effects: (scene, cast) => ({ morale: 3, fans: 4, board: 1, money: -round(wageOf(scene, cast) * 3) }), news: "{player} vai ser auxiliar no {club}" },
    ],
  },
  {
    id: "player-captaincy-ask",
    area: "players",
    topic: "players",
    weight: 0.6,
    cooldownDays: 120,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, regulars(scene).filter((p) => p.age >= 29))),
    setting: "No vestiário, antes do treino",
    texts: [
      { headline: "{player} quer a braçadeira", body: "“Sou dos mais antigos aqui. Acho que posso ajudar mais se for o capitão.”" },
      { headline: "{player} se oferece para ser capitão", body: "O {position} de {age} anos disse ao grupo que gostaria de usar a faixa. Agora espera a sua palavra." },
      { headline: "Faixa de capitão vira assunto no {club}", body: "{player} deixou claro que quer ser o capitão. Parte do elenco apoia, parte prefere como está." },
    ],
    choices: [
      { label: "Dar a braçadeira a ele", detail: "O capitão de hoje não vai gostar", effects: { morale: 1 }, news: "{player} é o novo capitão do {club}" },
      { label: "Manter o capitão", detail: "Ele entende, mas fica sentido", effects: { morale: -1 } },
      { label: "Fazer um rodízio entre os líderes", effects: { morale: 2, board: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "player-position-complaint",
    area: "players",
    topic: "players",
    weight: 0.8,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, regulars(scene).filter((p) => p.group === "MID" || p.group === "ATT"))),
    setting: "No campo, depois do treino",
    texts: [
      { headline: "{player} quer jogar mais perto do gol", body: "“Professor, rendo mais por dentro. Pela ponta eu sumo do jogo.”" },
      { headline: "{player} reclama da função", body: "O {position} acha que está marcando demais e criando de menos. Pediu uma conversa." },
      { headline: "{player} pede liberdade em campo", body: "“Me deixa flutuar um pouco. Preso na mesma faixa eu não consigo ajudar.”" },
    ],
    choices: [
      { label: "Dar mais liberdade a ele", detail: "O time perde um pouco de equilíbrio", effects: { morale: 2, board: -1 } },
      { label: "Explicar o que precisa dele", effects: { morale: 1 } },
      { label: "Dizer que a função é essa", effects: { morale: -2, board: 1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "player-loan-request",
    area: "players",
    topic: "players",
    weight: 0.8,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, fringe(scene).filter((p) => p.age <= 22))),
    setting: "Na sala do técnico",
    texts: [
      { headline: "{player} pede para ser emprestado", body: "“Tenho {age} anos e não jogo. Prefiro ir para um time da Série B e voltar pronto.”" },
      { headline: "{player} quer rodar por empréstimo", body: "O empresário já tem dois clubes interessados. O garoto só espera o seu sinal." },
      { headline: "Sem espaço, {player} quer sair por um tempo", body: "“Não quero ir embora do {club}. Só quero jogar. Um empréstimo resolve.”" },
    ],
    choices: [
      { label: "Liberar o empréstimo na janela", detail: "Ele volta com rodagem", effects: { morale: 1, board: 1 }, news: "{club} vai emprestar {player}" },
      { label: "Prometer minutos nos jogos menores", effects: { morale: 1 } },
      { label: "Segurar no elenco", detail: "Pode ser útil na reta final", effects: { morale: -2 } },
    ],
  },
  {
    id: "player-europe-dream",
    area: "players",
    topic: "players",
    weight: 0.8,
    cooldownDays: 90,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, byStrength(scene.squad).slice(0, 5).filter((p) => p.age <= 24 && !isForeign(p)))),
    setting: "Numa entrevista ao canal do clube",
    texts: [
      { headline: "{player} fala em jogar na Europa", body: "“Todo menino sonha com a Champions. Meu foco é o {club}, mas um dia quero ir.”" },
      { headline: "{player} admite sonho europeu", body: "A frase do {position} de {age} anos rodou o dia inteiro nas redes. A torcida não gostou." },
      { headline: "Entrevista de {player} agita a torcida do {club}", body: "Perguntado sobre o futuro, ele falou de Europa antes de falar do {club}. Os torcedores cobram." },
    ],
    choices: [
      { label: "Conversar e segurar até o fim do ano", effects: { morale: 1, fans: 1 } },
      { label: "Dizer à imprensa que ele não está à venda", detail: "A torcida aplaude, a diretoria torce o nariz", effects: { fans: 3, board: -2 }, news: "{coach}: “{player} não está à venda”" },
      { label: "Abrir a porta para propostas de fora", effects: { board: 3, fans: -3, morale: -1 }, news: "{club} admite ouvir propostas por {player}" },
    ],
    assistantChoice: 0,
  },
  {
    id: "player-substitution-sulk",
    area: "players",
    topic: "players",
    weight: 1,
    cooldownDays: 30,
    cast: (scene) => (playedToday(scene) ? playerCast(pickFrom(scene, regulars(scene).filter((p) => p.group === "MID" || p.group === "ATT"))) : null),
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "{player} sai reclamando na substituição", body: "Passou pelo banco sem cumprimentar ninguém e chutou uma garrafa d'água. As câmeras pegaram." },
      { headline: "{player} não gosta de ser substituído", body: "Saiu balançando a cabeça e foi direto para o vestiário. Os repórteres já perguntam o que houve." },
      { headline: "Cara feia de {player} na hora da troca", body: "O {position} achou cedo demais para sair. Disse no túnel que estava bem e queria ficar." },
    ],
    choices: [
      { label: "Multar, como manda o código interno", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.05) }) },
      { label: "Chamar para conversar a sós", effects: { morale: 1 } },
      { label: "Deixar passar", detail: "Calor do jogo", effects: { morale: 0, board: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "player-national-watch",
    area: "players",
    topic: "players",
    weight: 0.6,
    cooldownDays: 120,
    once: "player",
    cast: (scene) => {
      const best = byStrength(fit(scene))[0];
      return best && best.strength >= 78 && !isForeign(best) && best.age <= 31 ? playerCast(best) : null;
    },
    texts: [
      { headline: "{player} entra na lista de observação da Seleção", body: "A comissão técnica da CBF pediu os números do {position} do {club}. Ele soube pelo celular, no ônibus." },
      { headline: "CBF observa {player}", body: "Um observador da Seleção esteve no {stadium} e saiu falando bem do {position}." },
      { headline: "{player} sonha com a amarelinha", body: "Com {age} anos e na melhor fase da carreira, ele aparece nas listas dos jornalistas para a próxima convocação." },
    ],
    effects: { morale: 2, fans: 2 },
  },
  {
    id: "player-renewal-wish",
    area: "players",
    topic: "players",
    weight: 0.8,
    cooldownDays: 90,
    once: "player",
    cast: (scene) => playerCast(pickFrom(scene, regulars(scene).filter((p) => p.age >= 27 && p.age <= 33 && p.contractUntil <= addDays(scene.date, 365) && p.contractUntil > addDays(scene.date, 180)))),
    setting: "No CT, depois do treino",
    texts: [
      { headline: "{player} quer renovar com o {club}", body: "“Minha família está feliz aqui. Queria resolver o contrato logo, sem novela.”" },
      { headline: "{player} pede para renovar antes do fim do ano", body: "O contrato acaba em menos de um ano e ele não quer ouvir proposta de ninguém." },
      { headline: "{player} quer ficar mais tempo", body: "“Professor, o senhor fala com a diretoria? Quero ficar, só preciso saber se o clube quer.”" },
    ],
    choices: [
      { label: "Prometer levar o pedido à diretoria", effects: { morale: 2, board: -1 }, news: "{club} encaminha a renovação de {player}" },
      { label: "Deixar para o fim da temporada", effects: { morale: -1 } },
      { label: "Dizer que depende do rendimento", effects: { morale: -1, board: 1 } },
    ],
  },
  {
    id: "player-goal-drought",
    area: "players",
    topic: "players",
    weight: 1,
    cooldownDays: 45,
    once: "player",
    cast: (scene) => {
      const games = standing(scene)?.games ?? 0;
      return games >= 8 ? playerCast(pickFrom(scene, regulars(scene).filter((p) => p.group === "ATT" && seasonGoals(scene, p.id) === 0 && p.condition.seasonMinutes >= 450))) : null;
    },
    setting: "No CT, depois do treino",
    texts: [
      { headline: "{player} vive jejum de gols", body: "Mais de oito jogos e nenhum gol. Ele ficou meia hora a mais no treino de finalização." },
      { headline: "A bola não entra para {player}", body: "O {position} acerta a trave, perde gol feito e ouve a torcida reclamar. Pediu para conversar." },
      { headline: "{player} admite fase ruim", body: "“Sei que o atacante vive de gol. Estou devendo, mas vou sair dessa.”" },
    ],
    choices: [
      { label: "Bancar o atacante no time", detail: "Confiança é tudo", effects: { morale: 2, fans: -1 } },
      { label: "Deixar no banco por uns jogos", effects: { morale: -2, fans: 1 } },
      { label: "Treino extra de finalização", effects: { morale: 1 } },
    ],
  },
  {
    id: "player-keeper-blunder",
    area: "players",
    topic: "players",
    weight: 1.5,
    cooldownDays: 45,
    cast: (scene) => {
      const margin = marginToday(scene);
      if (margin === null || margin > -2) return null;
      return playerCast(byStrength(fit(scene).filter((p) => p.group === "GK"))[0]);
    },
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "{player} pede desculpas pela falha", body: "“Errei e custou caro. O grupo não merecia.” O goleiro falou de cabeça baixa na zona mista." },
      { headline: "Falha de {player} vira assunto", body: "A bola passou por baixo do corpo do goleiro e o lance foi repetido o dia inteiro na TV." },
      { headline: "Torcida pede a cabeça de {player}", body: "Depois da derrota, as redes pedem outro goleiro. Ele não dormiu e chegou cedo ao CT." },
    ],
    choices: [
      { label: "Manter o goleiro e defender em público", effects: { morale: 2, fans: -2 } },
      { label: "Trocar o goleiro no próximo jogo", effects: { morale: -2, fans: 2 } },
      { label: "Conversar e decidir no treino", effects: { morale: 1 } },
    ],
    assistantChoice: 2,
  },
  {
    id: "player-relegation-leader",
    area: "players",
    topic: "players",
    weight: 1,
    cooldownDays: 60,
    once: "player",
    cast: (scene) => (isRelegationFight(scene) ? playerCast(byStrength(scene.squad.filter((p) => p.age >= 30))[0]) : null),
    texts: [
      { headline: "{player} chama a responsabilidade", body: "O {position} de {age} anos reuniu o grupo sem a comissão técnica: “Daqui ninguém cai.”" },
      { headline: "{player} assume a liderança na hora difícil", body: "Na zona de rebaixamento, o mais experiente do {club} falou com cada um no café da manhã." },
      { headline: "{player}: “Esse clube não vai cair”", body: "Ele foi o primeiro a chegar e o último a sair do CT a semana toda. O elenco percebeu." },
    ],
    effects: { morale: 3, fans: 1 },
  },
];
