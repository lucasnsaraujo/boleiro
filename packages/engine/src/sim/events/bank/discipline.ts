import { chemistryOf } from "../../chemistry/chemistryOf.js";
import type { EventType } from "../eventType.js";
import { byStrength, fit, isForeign, LOW_CHEMISTRY, marginToday, monthOf, pickFrom, playedToday, playerCast, playsWithin, regulars, round, wageBill, wageOf } from "./sceneReaders.js";

/** Rules and their breaking: lateness, nights out, fights, fines. */
export const DISCIPLINE_EVENTS: readonly EventType[] = [
  {
    id: "player-late-training",
    area: "players",
    topic: "discipline",
    weight: 1,
    cooldownDays: 30,
    cast: (scene) => playerCast(pickFrom(scene, fit(scene).filter((p) => p.age <= 25 || p.trait === "aggressive"))),
    setting: "No CT, de manhã",
    texts: [
      { headline: "{player} chega atrasado ao treino", body: "Chegou quarenta minutos depois do grupo. Disse que o carro quebrou na ponte." },
      { headline: "{player} perde a hora", body: "O {position} entrou no campo com o aquecimento acabando. Os mais velhos estão olhando o que o senhor vai fazer." },
      { headline: "Atraso de {player} irrita a comissão técnica", body: "É a segunda vez no mês. Ele diz que o despertador não tocou; o preparador físico não acredita." },
    ],
    choices: [
      { label: "Multar, como manda o regulamento", detail: "10% do salário vai para o caixa", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Conversar em particular", effects: { morale: 1 } },
      { label: "Barrar do próximo jogo", detail: "Fica fora da lista de relacionados", effects: { morale: -2, board: 1, outDays: 3 }, news: "{player} é barrado por atraso no {club}" },
    ],
  },
  {
    id: "night-out-leak",
    area: "press",
    topic: "discipline",
    weight: 1,
    cooldownDays: 45,
    cast: (scene) => playerCast(pickFrom(scene, scene.squad.filter((p) => p.age < 30))),
    texts: [
      { headline: "{player} flagrado em balada", body: "Um vídeo do {position} do {club} numa casa noturna circula desde a madrugada. A semana é de jogo." },
      { headline: "Foto de {player} na noite repercute", body: "A diretoria do {club} pediu explicações. O {position} diz que foi o aniversário de um amigo." },
      { headline: "Madrugada de {player} cai nas redes", body: "Às quatro da manhã ele aparecia num camarote, de copo na mão. O treino era às nove." },
    ],
    effects: { morale: -2, fans: -2 },
  },
  {
    id: "dressing-room-fight",
    area: "squad",
    topic: "discipline",
    weight: (scene) => (chemistryOf(scene.state, scene.clubId).value < LOW_CHEMISTRY ? 4 : 2),
    cooldownDays: 45,
    cast: (scene) => {
      if ((marginToday(scene) ?? 0) >= 0) return null;
      const player = pickFrom(scene, fit(scene).filter((p) => p.age >= 24));
      const teammate = player && pickFrom(scene, fit(scene).filter((p) => p.id !== player.id));
      return player && teammate ? { playerId: player.id, teammateId: teammate.id } : null;
    },
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "Briga no vestiário do {club}", body: "{player} e {teammate} trocaram empurrões depois da derrota. A porta estava aberta e a imprensa ouviu tudo." },
      { headline: "{player} discute com {teammate} após derrota", body: "Começou com uma cobrança sobre o gol sofrido e só parou quando o resto do elenco entrou no meio." },
      { headline: "Clima quente entre {player} e {teammate}", body: "O bate-boca começou no gramado e seguiu no túnel. O roupeiro precisou separar os dois." },
    ],
    choices: [
      { label: "Multar os dois", detail: "Regra é regra", effects: { morale: -2, board: 2 } },
      { label: "Resolver na conversa", effects: { morale: 1 } },
      { label: "Afastar {player} por uma semana", effects: { morale: -1, board: 1, outDays: 7 }, news: "{club} afasta {player} depois de briga" },
    ],
    assistantChoice: 1,
  },
  {
    id: "discipline-curfew",
    area: "players",
    topic: "discipline",
    weight: 0.8,
    cooldownDays: 60,
    cast: (scene) => (playsWithin(scene, 1) ? playerCast(pickFrom(scene, fit(scene).filter((p) => p.age <= 26))) : null),
    setting: "Na concentração, de madrugada",
    texts: [
      { headline: "{player} fura a concentração", body: "O segurança do hotel viu o {position} saindo pela garagem às onze da noite. Voltou às duas." },
      { headline: "Fuga da concentração na véspera do jogo", body: "{player} recebeu visita no quarto contra as regras. O supervisor ficou sabendo pelo porteiro." },
      { headline: "{player} quebra a regra da concentração", body: "Saiu para jantar com amigos e perdeu o horário de recolher. O grupo inteiro sabe." },
    ],
    choices: [
      { label: "Cortar do jogo", effects: { morale: -1, board: 2, outDays: 2 }, news: "{player} é cortado por furar a concentração" },
      { label: "Multar e escalar", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.2) }) },
      { label: "Abafar o caso", effects: { morale: 1, board: -2 } },
    ],
  },
  {
    id: "discipline-social-post",
    area: "players",
    topic: "discipline",
    weight: 0.8,
    cooldownDays: 60,
    cast: (scene) => (playedToday(scene) ? playerCast(pickFrom(scene, byStrength(scene.squad).slice(11, 22))) : null),
    setting: "Nas redes sociais",
    texts: [
      { headline: "{player} reclama da reserva nas redes", body: "Postou um emoji de palhaço logo depois do jogo. Apagou meia hora depois, tarde demais." },
      { headline: "Indireta de {player} vira assunto", body: "“Quem trabalha em silêncio um dia é visto.” A frase veio com uma foto dele no banco." },
      { headline: "Post de {player} incomoda o vestiário", body: "O {position} curtiu críticas ao técnico e escreveu que “o tempo mostra tudo”." },
    ],
    choices: [
      { label: "Multar", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Chamar para conversar", effects: { morale: 1 } },
      { label: "Afastar até pedir desculpas", effects: { morale: -2, board: 1, outDays: 5 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "discipline-training-fight",
    area: "squad",
    topic: "discipline",
    weight: 0.8,
    cooldownDays: 45,
    cast: (scene) => {
      const hot = fit(scene).filter((p) => p.trait === "aggressive" || p.group === "DEF");
      const player = pickFrom(scene, hot);
      const teammate = player && pickFrom(scene, fit(scene).filter((p) => p.id !== player.id && p.group === "ATT"));
      return player && teammate ? { playerId: player.id, teammateId: teammate.id } : null;
    },
    setting: "No campo de treino",
    texts: [
      { headline: "{player} e {teammate} brigam no treino", body: "Uma entrada mais dura virou empurra-empurra. O treino parou e o senhor teve que apitar o fim." },
      { headline: "Treino quente no {club}", body: "{player} chegou atrasado na dividida e {teammate} não gostou. Os dois foram mandados para o vestiário." },
      { headline: "Confusão no rachão do {club}", body: "Um carrinho de {player} em {teammate} acabou em troca de empurrões. Ninguém se machucou." },
    ],
    choices: [
      { label: "Fazer os dois se desculparem na frente do grupo", effects: { morale: 1 } },
      { label: "Multar os dois", effects: { morale: -1, board: 1 } },
      { label: "Deixar: treino forte é bom sinal", effects: { morale: -1 } },
    ],
  },
  {
    id: "discipline-overweight",
    area: "players",
    topic: "discipline",
    weight: 2,
    cooldownDays: 300,
    cast: (scene) => (monthOf(scene) === 1 ? playerCast(pickFrom(scene, scene.squad.filter((p) => p.age >= 25))) : null),
    setting: "Na reapresentação",
    texts: [
      { headline: "{player} volta das férias acima do peso", body: "A balança marcou cinco quilos a mais. O nutricionista já montou uma dieta especial." },
      { headline: "Férias pesaram para {player}", body: "O {position} chegou à reapresentação com a camisa apertada. Os companheiros não perdoaram." },
      { headline: "{player} reprovado na balança", body: "Os exames da pré-temporada mostram gordura acima do limite. O preparador físico quer treino extra." },
    ],
    choices: [
      { label: "Treino extra e dieta", effects: { morale: -1, board: 1 } },
      { label: "Multar por quilo", effects: (scene, cast) => ({ morale: -2, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Deixar com o nutricionista", effects: {} },
    ],
    assistantChoice: 2,
  },
  {
    id: "discipline-skipped-gym",
    area: "players",
    topic: "discipline",
    weight: 0.6,
    cooldownDays: 60,
    cast: (scene) => playerCast(pickFrom(scene, regulars(scene).filter((p) => p.age >= 26))),
    setting: "Na academia do CT",
    texts: [
      { headline: "{player} falta à academia", body: "O fisiologista avisou: o {position} pulou três sessões de força nesta semana." },
      { headline: "{player} foge dos treinos de força", body: "Diz que sente o corpo pesado. O departamento de fisiologia acha que é preguiça." },
      { headline: "Fisiologia do {club} reclama de {player}", body: "O relatório semanal mostra o nome dele em vermelho. O preparador físico quer uma conversa." },
    ],
    choices: [
      { label: "Cobrar na frente do grupo", effects: { morale: -2, board: 1 } },
      { label: "Conversa a sós", effects: { morale: 1 } },
      { label: "Tirar do próximo jogo", effects: { morale: -1, board: 1, outDays: 3 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "discipline-referee-insult",
    area: "players",
    topic: "discipline",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((marginToday(scene) ?? 1) <= 0 ? playerCast(pickFrom(scene, regulars(scene).filter((p) => p.trait === "aggressive" || p.age >= 28))) : null),
    texts: [
      { headline: "{player} xinga o árbitro na saída de campo", body: "As câmeras pegaram a leitura labial. O {club} pode ser multado pelo STJD." },
      { headline: "Súmula complica {player}", body: "O árbitro relatou ofensas depois do apito final. O departamento jurídico do {club} já prepara a defesa." },
      { headline: "{player} perde a cabeça com a arbitragem", body: "Precisou ser segurado por dois companheiros no túnel. O caso foi parar na súmula." },
    ],
    effects: { money: -50_000, board: -1 },
  },
  {
    id: "discipline-fines-party",
    area: "squad",
    topic: "discipline",
    weight: 0.4,
    cooldownDays: 180,
    cast: (scene) => (!playsWithin(scene, 3) ? {} : null),
    texts: [
      { headline: "Caixinha das multas paga festa do elenco", body: "Os atrasos e as multas do ano renderam um churrasco para o grupo e as famílias." },
      { headline: "Multas do vestiário viram confraternização", body: "O capitão do {club} guarda o dinheiro numa lata de biscoito desde janeiro. Deu para alugar uma chácara." },
      { headline: "Festa paga pelos atrasados", body: "O maior contribuinte da caixinha das multas ganhou um troféu de brincadeira. Aceitou rindo." },
    ],
    effects: { morale: 2 },
  },
  {
    id: "discipline-phone-ban",
    area: "squad",
    topic: "discipline",
    weight: 0.4,
    cooldownDays: 180,
    cast: (scene) => (playsWithin(scene, 2) ? {} : null),
    setting: "Na concentração",
    texts: [
      { headline: "Celular na concentração vira problema no {club}", body: "Os jogadores ficam até de madrugada nas redes. O preparador físico pede que os aparelhos sejam recolhidos." },
      { headline: "Jogadores do {club} dormem tarde por causa do celular", body: "O fisiologista mostrou os dados de sono. Metade do elenco dorme menos de seis horas antes do jogo." },
      { headline: "Comissão quer recolher celulares", body: "A ideia é guardar os aparelhos às onze da noite. Os líderes do grupo já avisaram que não vão gostar." },
    ],
    choices: [
      { label: "Recolher às onze", effects: { morale: -2, board: 1 } },
      { label: "Combinar um horário com os líderes", effects: { morale: 1 } },
      { label: "Deixar como está", effects: { morale: 1, board: -1 } },
    ],
    assistantChoice: 1,
  },
  {
    id: "discipline-late-return",
    area: "players",
    topic: "discipline",
    weight: 2,
    cooldownDays: 300,
    cast: (scene) => (monthOf(scene) === 1 ? playerCast(pickFrom(scene, scene.squad.filter(isForeign))) : null),
    setting: "Na reapresentação",
    texts: [
      { headline: "{player} não volta das férias na data", body: "O {position} avisou por mensagem que perdeu o voo. A reapresentação foi ontem." },
      { headline: "{player} atrasa a volta ao {club}", body: "Problema de visto, diz o empresário. A comissão técnica acha que foi praia demais." },
      { headline: "Cadê {player}?", body: "O estrangeiro estendeu as férias por conta própria. Chega três dias depois do grupo." },
    ],
    choices: [
      { label: "Multar pelos dias", effects: (scene, cast) => ({ morale: -1, board: 1, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Aceitar a explicação", effects: { morale: 1, board: -1 } },
      { label: "Deixar fora dos primeiros jogos", effects: { morale: -2, board: 1, outDays: 7 } },
    ],
  },
  {
    id: "discipline-fans-gesture",
    area: "fans",
    topic: "discipline",
    weight: 1,
    cooldownDays: 60,
    cast: (scene) => ((marginToday(scene) ?? 1) < 0 ? playerCast(pickFrom(scene, regulars(scene).filter((p) => p.age <= 27))) : null),
    setting: "Na saída de campo",
    texts: [
      { headline: "{player} faz gesto obsceno para a torcida", body: "Vaiado na saída, o {position} respondeu com a mão. A TV mostrou em câmera lenta." },
      { headline: "{player} bate boca com a arquibancada", body: "Depois da derrota, ele parou no meio do caminho para responder a um torcedor. Precisou ser puxado." },
      { headline: "Atrito entre {player} e torcida do {club}", body: "O jogador mandou a torcida ficar quieta depois de um gol perdido. A organizada promete cobrança." },
    ],
    choices: [
      { label: "Exigir um pedido de desculpas público", effects: { fans: 2, morale: -1 } },
      { label: "Multar em silêncio", effects: (scene, cast) => ({ fans: -1, board: 1, money: round(wageOf(scene, cast) * 0.1) }) },
      { label: "Defender o jogador", effects: { fans: -3, morale: 2 } },
    ],
    assistantChoice: 0,
  },
  {
    id: "discipline-armband-throw",
    area: "players",
    topic: "discipline",
    weight: 0.6,
    cooldownDays: 120,
    cast: (scene) => (playedToday(scene) && (marginToday(scene) ?? 1) <= 0 ? playerCast(byStrength(regulars(scene).filter((p) => p.age >= 28))[0]) : null),
    setting: "No vestiário, depois do jogo",
    texts: [
      { headline: "{player} joga a braçadeira no chão", body: "Substituído no segundo tempo, o {position} tirou a faixa e jogou no gramado. O estádio inteiro viu." },
      { headline: "Gesto de {player} na substituição revolta o {club}", body: "A braçadeira de capitão foi parar no chão. O presidente quer uma punição exemplar." },
      { headline: "{player} se irrita e larga a faixa de capitão", body: "Depois do jogo, disse que foi “no calor do momento”. Os jogadores esperam a sua reação." },
    ],
    choices: [
      { label: "Tirar a braçadeira dele", effects: { morale: -2, board: 2 }, news: "{player} perde a braçadeira no {club}" },
      { label: "Conversa e pedido de desculpas ao grupo", effects: { morale: 1 } },
      { label: "Multa pesada", effects: (scene) => ({ morale: -1, board: 1, money: round(wageBill(scene) * 0.005) }) },
    ],
    assistantChoice: 1,
  },
];
