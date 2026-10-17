import type { Fixture } from "../gameState.js";
import type { MatchEvent } from "../live/matchTimeline.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import type { DayScene, EggHit, EggType, MatchTale } from "./eggType.js";

type Goal = Extract<MatchEvent, { type: "goal" }>;

const sidesOf = (tale: MatchTale) => [tale.fixture.homeId, tale.fixture.awayId] as const;
const opponentOf = (tale: MatchTale, clubId: string) => (clubId === tale.fixture.homeId ? tale.fixture.awayId : tale.fixture.homeId);

/** The final score from the side's end: its goals, then the other side's. */
function scoreFor(tale: MatchTale, clubId: string): [number, number] {
  const { homeGoals, awayGoals } = tale.fixture.result;
  return clubId === tale.fixture.homeId ? [homeGoals, awayGoals] : [awayGoals, homeGoals];
}

/** Whether the side won the match in the ninety (or a hundred and twenty) minutes; a shootout after it decides a tie, not the match. */
function hasWon(tale: MatchTale, clubId: string): boolean {
  const [own, other] = scoreFor(tale, clubId);
  return own > other;
}

const goalsIn = (tale: MatchTale): Goal[] => tale.events.filter((e): e is Goal => e.type === "goal");
const count = <T>(items: readonly T[], keep: (item: T) => boolean) => items.filter(keep).length;
const nameOf = (tale: MatchTale, playerId: string) => tale.names[playerId] ?? "um jogador";

/** The hits of the sides `keeps` holds for. */
const sidesWhere = (tale: MatchTale, keeps: (clubId: string) => Record<string, string> | boolean): EggHit[] =>
  sidesOf(tale).flatMap((clubId) => {
    const kept = keeps(clubId);
    if (!kept) return [];
    return [{ clubId, ...(kept === true ? {} : { slots: kept }) }];
  });

/** The first player with at least `least` goals of his own (own goals left out) that `keeps` holds for, as a hit for his side. */
function scorerWith(tale: MatchTale, least: number, keeps: (goal: Goal) => boolean = () => true): EggHit[] {
  const tally = new Map<string, Goal[]>();
  for (const g of goalsIn(tale)) if (g.kind !== "ownGoal" && keeps(g)) tally.set(g.playerId, [...(tally.get(g.playerId) ?? []), g]);
  const found = [...tally].find(([, own]) => own.length >= least);
  if (!found) return [];
  const [playerId, own] = found;
  return [{ clubId: own[0]?.clubId ?? "", playerId, slots: { player: nameOf(tale, playerId), count: String(own.length) } }];
}

/** The most goals the side was behind by at any minute. */
function deepestDeficit(tale: MatchTale, clubId: string): number {
  let deficit = 0;
  let deepest = 0;
  for (const g of [...goalsIn(tale)].sort((a, b) => a.minute - b.minute)) {
    deficit += g.clubId === clubId ? -1 : 1;
    deepest = Math.max(deepest, deficit);
  }
  return deepest;
}

/** The side's goals and the other side's before minute 90, stoppage time left out. */
function scoreBefore90(tale: MatchTale, clubId: string): [number, number] {
  const early = goalsIn(tale).filter((g) => g.minute < 90);
  return [count(early, (g) => g.clubId === clubId), count(early, (g) => g.clubId !== clubId)];
}

const kicksIn = (tale: MatchTale) => tale.events.filter((e): e is Extract<MatchEvent, { type: "shootoutKick" }> => e.type === "shootoutKick");
const dayOf = (tale: MatchTale) => tale.fixture.date.slice(5);

// guess: about one season in six, the trials bring a kid named after the coach, and one in six kids named after the cousins.
const NAMESAKE_CHANCE = 1 / 6;
// guess: the paper plays its April Fools' joke one year in three, and the squad does its secret Santa every other Christmas,
// but each is told once in a club's career, as a joke told twice is no joke.
const APRIL_FOOLS_CHANCE = 1 / 3;
const SECRET_SANTA_CHANCE = 1 / 2;
// The goalless and same-score runs the paper notices.
const SAME_SCORE_RUN = 5;
const GOALLESS_RUN = 4;

/** The kids the day's trials brought to the club, if it held them today. */
const trialKidsOf = (scene: DayScene): readonly string[] =>
  scene.events.flatMap((e) => (e.type === "youthTrialsHeld" && e.clubId === scene.clubId ? e.prospectIds : []));

/** Whether the club played today. */
const playsToday = (scene: DayScene) => scene.played.some((f) => f.homeId === scene.clubId || f.awayId === scene.clubId);

/** The club's last `games` results as its score first, newest last; fewer when it has played fewer, none unless it played today. */
function lastScores(scene: DayScene, games: number): [number, number][] {
  if (!playsToday(scene)) return [];
  return scene.state.fixtures
    .filter((f): f is Fixture & { result: NonNullable<Fixture["result"]> } => f.result !== null && f.date <= scene.date && (f.homeId === scene.clubId || f.awayId === scene.clubId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-games)
    .map((f) => (f.homeId === scene.clubId ? [f.result.homeGoals, f.result.awayGoals] : [f.result.awayGoals, f.result.homeGoals]));
}

const seasonEndOf = (scene: DayScene) => scene.events.find((e) => e.type === "seasonEnded");
const squadOf = (scene: DayScene) => squadsOfGame(scene.state).get(scene.clubId) ?? [];
const nextYear = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;

const COUNTS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const inWords = (value: number) => COUNTS[value] ?? String(value);

export const EGG_BANK: readonly EggType[] = [
  // Nelson Rodrigues' ghost of the Fluminense crowd, blamed for everything that went against the club
  // (https://pt.wikipedia.org/wiki/Sobrenatural_de_Almeida).
  {
    id: "sobrenatural",
    on: "match",
    title: "Sobrenatural de Almeida",
    rarity: "rare",
    look: "sticker",
    find: (tale) => sidesWhere(tale, (clubId) => !hasWon(tale, clubId) && count(tale.woodwork, (shot) => shot.clubId === clubId) >= 3),
    note: "Três bolas na trave do {club}. Nelson Rodrigues já tinha um nome para isso: Sobrenatural de Almeida.",
    texts: [
      { headline: "Sobrenatural de Almeida baixou no jogo do {club}", body: "{score}. Três bolas na trave e nenhuma entrou. Nelson Rodrigues culparia o fantasma de sempre." },
      { headline: "{club} carimba a trave três vezes", body: "{score}. Teve torcedor jurando ter visto o Sobrenatural de Almeida na arquibancada." },
    ],
  },
  // Brazil 1–7 Germany, World Cup semi-final, Mineirão, 8 July 2014 (https://pt.wikipedia.org/wiki/Brasil_1–7_Alemanha).
  {
    id: "seven-one",
    on: "match",
    title: "Sete a um",
    rarity: "legendary",
    look: "page",
    find: (tale) => sidesWhere(tale, (clubId) => scoreFor(tale, clubId).join("-") === "7-1"),
    note: "Sete a um. O Mineirão viu esse placar em 8 de julho de 2014, na semifinal da Copa.",
    texts: [{ headline: "Sete a um", body: "{score}. O placar que o Brasil conhece de cor ganhou uma página no álbum do {club}." }],
  },
  // Rogério Ceni scored 131 goals for São Paulo, the most by any goalkeeper (https://pt.wikipedia.org/wiki/Rogério_Ceni).
  {
    id: "keeper-goal",
    on: "match",
    title: "Gol de goleiro",
    rarity: "legendary",
    look: "sticker",
    find: (tale) =>
      goalsIn(tale)
        .filter((g) => g.kind !== "ownGoal" && tale.groups[g.playerId] === "GK")
        .slice(0, 1)
        .map((g) => ({ clubId: g.clubId, playerId: g.playerId, slots: { player: nameOf(tale, g.playerId), minute: String(g.minute) } })),
    note: "Gol do goleiro {player}. Rogério Ceni fez 131 assim pelo São Paulo; ele começou a conta dele.",
    texts: [{ headline: "Goleiro {player} marca para o {club}", body: "{score}. Foi lá na frente aos {minute}' e fez. Rogério Ceni marcou 131 vezes pelo São Paulo; {player} tem um." }],
  },
  // Cesáreo Onzari's corner straight in, Argentina 2–1 Uruguay, 2 October 1924, named to tease the Olympic champions
  // (https://pt.wikipedia.org/wiki/Gol_olímpico).
  {
    id: "olympic-goal",
    on: "match",
    title: "Gol olímpico",
    rarity: "rare",
    look: "sticker",
    once: "player",
    find: (tale) =>
      goalsIn(tale)
        .filter((g) => g.kind === "olympic")
        .slice(0, 1)
        .map((g) => ({ clubId: g.clubId, playerId: g.playerId, slots: { player: nameOf(tale, g.playerId), minute: String(g.minute) } })),
    note: "Gol olímpico de {player}, direto do escanteio. O primeiro reconhecido foi do argentino Onzari, contra o Uruguai, em 1924.",
    texts: [{ headline: "Gol olímpico de {player}", body: "{score}. Aos {minute}', a cobrança de escanteio foi direto para a rede." }],
  },
  // Náutico 0–1 Grêmio, Série B, Aflitos, 26 November 2005: Grêmio had four men sent off and won with seven
  // (https://pt.wikipedia.org/wiki/Batalha_dos_Aflitos).
  {
    id: "aflitos",
    on: "match",
    title: "Batalha dos Aflitos",
    rarity: "veryRare",
    look: "sticker",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const sentOff = count(tale.events, (e) => e.type === "card" && e.clubId === clubId && e.card !== "yellow");
        return hasWon(tale, clubId) && sentOff >= 2 && { count: String(sentOff) };
      }),
    note: "O {club} venceu com {count} expulsos. Em 2005, nos Aflitos, o Grêmio ganhou do Náutico com sete em campo.",
    texts: [{ headline: "Com {count} a menos, o {club} vence", body: "{score}. Quem viu lembrou da Batalha dos Aflitos, o 1 a 0 do Grêmio sobre o Náutico em 2005." }],
  },
  // Neném Prancha, Botafogo's kit man and "philosopher of football": a penalty is so important the club president
  // should take it (https://pt.wikipedia.org/wiki/Neném_Prancha).
  {
    id: "president-penalty",
    on: "match",
    title: "Pênalti é coisa de presidente",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const missed = count(tale.events, (e) => e.type === "penaltyMiss" && e.clubId === clubId);
        return missed >= 2 && { count: inWords(missed) };
      }),
    note: "O {club} perdeu {count} pênaltis. Neném Prancha dizia que pênalti é tão importante que quem devia bater era o presidente do clube.",
    texts: [{ headline: "{club} perde {count} pênaltis no mesmo jogo", body: "{score}. Na saída, um conselheiro lembrou Neném Prancha: pênalti é tão importante que devia ser batido pelo presidente." }],
  },
  {
    id: "keeper-two-penalties",
    on: "match",
    title: "Paredão",
    rarity: "veryRare",
    look: "sticker",
    find: (tale) => {
      const saves = new Map<string, number>();
      for (const e of tale.events) if (e.type === "penaltyMiss" && e.isSaved) saves.set(e.keeperId, (saves.get(e.keeperId) ?? 0) + 1);
      const keeper = [...saves].find(([, saved]) => saved >= 2);
      const takerClubId = tale.events.flatMap((e) => (e.type === "penaltyMiss" && e.keeperId === keeper?.[0] ? [e.clubId] : []))[0];
      if (!keeper || !takerClubId) return [];
      return [{ clubId: opponentOf(tale, takerClubId), playerId: keeper[0], slots: { player: nameOf(tale, keeper[0]), count: inWords(keeper[1]) } }];
    },
    note: "{player} pegou {count} pênaltis no mesmo jogo.",
    texts: [{ headline: "{player} pega {count} pênaltis", body: "{score}. O goleiro do {club} virou paredão e saiu carregado pelos companheiros." }],
  },
  {
    id: "comeback-three",
    on: "match",
    title: "Virada histórica",
    rarity: "veryRare",
    look: "sticker",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const deficit = deepestDeficit(tale, clubId);
        return hasWon(tale, clubId) && deficit >= 3 && { count: inWords(deficit) };
      }),
    note: "O {club} chegou a perder por {count} gols de diferença e virou.",
    texts: [{ headline: "Virada histórica do {club}", body: "{score}. Esteve {count} gols atrás e virou. Tem torcedor que foi embora no intervalo e não acredita até agora." }],
  },
  {
    id: "eight-goal-draw",
    on: "match",
    title: "Empate de oito gols",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) => {
      const { homeGoals, awayGoals } = tale.fixture.result;
      return homeGoals === awayGoals && homeGoals >= 4 ? [{ clubId: tale.fixture.homeId }] : [];
    },
    note: "Empate com {goals} gols. Ninguém saiu do estádio antes do apito final.",
    texts: [{ headline: "{score}: ninguém perdeu, ninguém esquece", body: "Um empate com gols para uma temporada inteira." }],
  },
  {
    id: "double-digits",
    on: "match",
    title: "Dois dígitos",
    rarity: "legendary",
    look: "page",
    find: (tale) => sidesWhere(tale, (clubId) => scoreFor(tale, clubId)[0] >= 10),
    note: "O {club} fez dois dígitos no placar.",
    texts: [{ headline: "{club} faz dez", body: "{score}. O placar eletrônico precisou de dois dígitos." }],
  },
  {
    id: "penalty-hat-trick",
    on: "match",
    title: "Três de pênalti",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => scorerWith(tale, 3, (g) => g.kind === "penalty"),
    note: "{player} fez {count} gols, todos de pênalti.",
    texts: [{ headline: "{player} marca três de pênalti", body: "{score}. Três cobranças, três gols. A marca do pênalti já tem o nome dele." }],
  },
  {
    id: "keeper-own-goal",
    on: "match",
    title: "Frango contra",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      goalsIn(tale)
        .filter((g) => g.kind === "ownGoal" && tale.groups[g.playerId] === "GK")
        .slice(0, 1)
        .map((g) => ({ clubId: opponentOf(tale, g.clubId), playerId: g.playerId, slots: { player: nameOf(tale, g.playerId) } })),
    note: "O goleiro {player} marcou contra.",
    texts: [{ headline: "Goleiro {player} marca contra", body: "{score}. O lance vai passar nos programas de domingo a semana inteira." }],
  },
  {
    id: "four-goals",
    on: "match",
    title: "Quatro num jogo",
    rarity: "veryRare",
    look: "sticker",
    find: (tale) => scorerWith(tale, 4),
    note: "{player} fez {count} gols.",
    texts: [{ headline: "{player} faz {count} gols", body: "{score}. A bola do jogo foi para casa com ele." }],
  },
  {
    id: "defender-hat-trick",
    on: "match",
    title: "Zagueiro artilheiro",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => scorerWith(tale, 3, (g) => tale.groups[g.playerId] === "DEF"),
    note: "Hat-trick de zagueiro: {player} fez {count}.",
    texts: [{ headline: "Zagueiro {player} faz três", body: "{score}. Os atacantes do {club} vão ter que se explicar." }],
  },
  {
    id: "debut-hat-trick",
    on: "match",
    title: "Estreia de hat-trick",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => scorerWith(tale, 3, (g) => tale.debutants.has(g.playerId)),
    note: "{player} estreou pelo {club} com {count} gols.",
    texts: [{ headline: "{player} estreia com três gols", body: "{score}. Primeiro jogo pelo {club}, três gols. Começou bem." }],
  },
  {
    id: "header-hat-trick",
    on: "match",
    title: "Três de cabeça",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => scorerWith(tale, 3, (g) => g.kind === "header"),
    note: "{player} fez {count} gols de cabeça.",
    texts: [{ headline: "{player} faz três de cabeça", body: "{score}. Três cruzamentos, três cabeçadas, três gols." }],
  },
  {
    id: "keeper-decides-shootout",
    on: "match",
    title: "Goleiro batedor",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => {
      const last = kicksIn(tale).at(-1);
      return last?.isScored && last.clubId === tale.fixture.result.penaltyWinnerId && tale.groups[last.playerId] === "GK"
        ? [{ clubId: last.clubId, playerId: last.playerId, slots: { player: nameOf(tale, last.playerId) } }]
        : [];
    },
    note: "Quem bateu o pênalti decisivo foi o goleiro {player}.",
    texts: [{ headline: "Goleiro {player} bate e decide", body: "{score}. Na disputa de pênaltis, o último chute foi dele, e entrou." }],
  },
  {
    id: "endless-shootout",
    on: "match",
    title: "Pênaltis sem fim",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) => {
      const kicks = kicksIn(tale);
      const winner = tale.fixture.result.penaltyWinnerId;
      const each = Math.min(count(kicks, (k) => k.clubId === tale.fixture.homeId), count(kicks, (k) => k.clubId === tale.fixture.awayId));
      return winner && each >= 8 ? [{ clubId: winner, slots: { count: String(each) } }] : [];
    },
    note: "A disputa de pênaltis foi até a {count}ª cobrança de cada lado.",
    texts: [{ headline: "{club} vence nos pênaltis depois de {count} cobranças", body: "{score}. Teve goleiro batendo, zagueiro batendo e torcedor sem unha." }],
  },
  {
    id: "blitz",
    on: "match",
    title: "Blitz",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const minutes = goalsIn(tale)
          .filter((g) => g.clubId === clubId)
          .map((g) => g.minute)
          .sort((a, b) => a - b);
        return minutes.some((minute, i) => (minutes[i + 3] ?? Infinity) - minute <= 10);
      }),
    note: "O {club} fez quatro gols em dez minutos.",
    texts: [{ headline: "Quatro gols em dez minutos", body: "{score}. O {club} resolveu o jogo enquanto o adversário ainda arrumava a marcação." }],
  },
  {
    id: "stoppage-comeback",
    on: "match",
    title: "Virada no apagar das luzes",
    rarity: "veryRare",
    look: "sticker",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const [own, other] = scoreBefore90(tale, clubId);
        return !tale.fixture.result.isAfterExtraTime && own < other && hasWon(tale, clubId);
      }),
    note: "O {club} perdia até os 89 minutos e virou.",
    texts: [{ headline: "{club} vira no último minuto", body: "{score}. Perdia até os 89. Metade da torcida já estava no estacionamento." }],
  },
  {
    id: "derby-own-goal",
    on: "match",
    title: "Clássico do gol contra",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) => {
      const all = goalsIn(tale);
      const [only] = all;
      return tale.isDerby && all.length === 1 && only?.kind === "ownGoal" ? [{ clubId: only.clubId, slots: { player: nameOf(tale, only.playerId) } }] : [];
    },
    note: "O clássico foi decidido por um gol contra, de {player}.",
    texts: [{ headline: "Gol contra decide o clássico para o {club}", body: "{score}. {player} vai ouvir sobre esse lance pelo resto da carreira." }],
  },
  {
    id: "derby-rout",
    on: "match",
    title: "Passeio no clássico",
    rarity: "veryRare",
    look: "page",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const [own, other] = scoreFor(tale, clubId);
        return tale.isDerby && own - other >= 5;
      }),
    note: "Goleada de cinco no clássico. A provocação está garantida até o próximo.",
    texts: [{ headline: "{club} atropela o rival", body: "{score}. Um clássico desses vira camisa, faixa e música de arquibancada." }],
  },
  {
    id: "five-reds",
    on: "match",
    title: "Jogo de cinco vermelhos",
    rarity: "legendary",
    look: "clipping",
    find: (tale) => {
      const reds = count(tale.events, (e) => e.type === "card" && e.card !== "yellow");
      return reds >= 5 ? [{ clubId: tale.fixture.homeId, slots: { count: String(reds) } }] : [];
    },
    note: "{count} expulsões no mesmo jogo.",
    texts: [{ headline: "{count} expulsões em {score}", body: "O árbitro gastou o cartão vermelho. A súmula vai ser longa." }],
  },
  {
    id: "final-stoppage-winner",
    on: "match",
    title: "Título nos acréscimos",
    rarity: "legendary",
    look: "page",
    find: (tale) => {
      const last = goalsIn(tale).at(-1);
      if (!tale.final || tale.fixture.result.isAfterExtraTime || !last || last.minute < 90) return [];
      const { championId, margin } = tale.final;
      return last.clubId === championId && margin === 1 ? [{ clubId: championId }] : [];
    },
    note: "O gol do título saiu depois dos 89 minutos.",
    texts: [{ headline: "{club} campeão no último minuto", body: "{score}. O gol do título saiu quando o relógio já tinha passado dos 89." }],
  },
  {
    id: "woodwork-hat-trick",
    on: "match",
    title: "Três na trave",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => {
      const posts = new Map<string, number>();
      for (const shot of tale.woodwork) posts.set(shot.playerId, (posts.get(shot.playerId) ?? 0) + 1);
      const unlucky = [...posts].find(([, hits]) => hits >= 3);
      const shot = unlucky && tale.woodwork.find((own) => own.playerId === unlucky[0]);
      return unlucky && shot ? [{ clubId: shot.clubId, playerId: unlucky[0], slots: { player: nameOf(tale, unlucky[0]), count: inWords(unlucky[1]) } }] : [];
    },
    note: "{player} acertou a trave {count} vezes.",
    texts: [{ headline: "{player} acerta a trave {count} vezes", body: "{score}. O travessão do estádio já sabe o nome dele." }],
  },
  // Brazil 1–2 Uruguay, World Cup, Maracanã, 16 July 1950 (https://pt.wikipedia.org/wiki/Maracanaço).
  {
    id: "maracanazo",
    on: "match",
    title: "16 de julho",
    rarity: "legendary",
    look: "clipping",
    find: (tale) => (dayOf(tale) === "07-16" && scoreFor(tale, tale.fixture.homeId)[0] < scoreFor(tale, tale.fixture.homeId)[1] ? [{ clubId: tale.fixture.homeId }] : []),
    note: "Derrota em casa num 16 de julho. Nesse dia, em 1950, o Uruguai venceu o Brasil por 2 a 1 no Maracanã.",
    texts: [{ headline: "Um 16 de julho para esquecer", body: "{score}. O {club} perdeu em casa na data do Maracanaço, o 2 a 1 do Uruguai sobre o Brasil em 1950." }],
  },
  // Pelé's 1,000th goal, a penalty against Vasco da Gama at the Maracanã, 19 November 1969 (https://en.wikipedia.org/wiki/Pelé).
  {
    id: "thousandth-goal",
    on: "match",
    title: "19 de novembro",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      dayOf(tale) === "11-19"
        ? goalsIn(tale)
            .filter((g) => g.kind === "penalty")
            .slice(0, 1)
            .map((g) => ({ clubId: g.clubId, playerId: g.playerId, slots: { player: nameOf(tale, g.playerId) } }))
        : [],
    note: "Gol de pênalti num 19 de novembro, a data do milésimo gol de Pelé, também de pênalti, contra o Vasco, em 1969.",
    texts: [{ headline: "{player} marca de pênalti no dia do milésimo", body: "{score}. Em 19 de novembro de 1969, Pelé fez o gol mil de pênalti, contra o Vasco, no Maracanã." }],
  },
  {
    id: "friday-13",
    on: "match",
    title: "Sexta-feira 13",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) => {
      const isFriday13 = dayOf(tale).endsWith("-13") && new Date(`${tale.fixture.date}T12:00:00Z`).getUTCDay() === 5;
      return isFriday13 ? sidesWhere(tale, (clubId) => sidesOf(tale).some((other) => other !== clubId && hasWon(tale, other))) : [];
    },
    note: "Derrota do {club} numa sexta-feira 13.",
    texts: [{ headline: "Sexta-feira 13 pesa para o {club}", body: "{score}. No vestiário, ninguém quis falar de azar. Mas todo mundo pensou." }],
  },
  {
    id: "forty-on-the-pitch",
    on: "match",
    title: "Quarentão",
    rarity: "rare",
    look: "sticker",
    once: "player",
    find: (tale) =>
      Object.keys(tale.groups)
        .filter((playerId) => (tale.ages[playerId] ?? 0) >= 40 && tale.clubOf[playerId])
        .slice(0, 1)
        .map((playerId) => ({ clubId: tale.clubOf[playerId] ?? "", playerId, slots: { player: nameOf(tale, playerId), age: String(tale.ages[playerId]) } })),
    note: "{player} entrou em campo aos {age} anos.",
    texts: [{ headline: "{player}, {age} anos, ainda em campo", body: "{score}. O mais velho do jogo com folga. Diz que para quando as pernas pedirem." }],
  },
  {
    id: "namesake-scores",
    on: "match",
    title: "O xará marcou",
    rarity: "legendary",
    look: "sticker",
    find: (tale) =>
      goalsIn(tale)
        .filter((g) => g.kind !== "ownGoal" && tale.coachNames.includes(nameOf(tale, g.playerId)))
        .slice(0, 1)
        .map((g) => ({ clubId: g.clubId, playerId: g.playerId, slots: { player: nameOf(tale, g.playerId) } })),
    note: "Gol de {player}, xará de técnico.",
    texts: [{ headline: "Gol do xará: {player} marca", body: "{score}. O garoto que veio da peneira com nome de técnico deixou o dele." }],
  },
  // Germany led Brazil 5–0 at half-time on their way to the 7–1 (https://pt.wikipedia.org/wiki/Brasil_1–7_Alemanha).
  {
    id: "five-at-half-time",
    on: "match",
    title: "Cinco no primeiro tempo",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      sidesWhere(tale, (clubId) => {
        const firstHalf = goalsIn(tale).filter((g) => g.minute <= 45);
        return count(firstHalf, (g) => g.clubId === clubId) - count(firstHalf, (g) => g.clubId !== clubId) >= 5;
      }),
    note: "Cinco gols de vantagem no intervalo, como a Alemanha no Mineirão em 2014.",
    texts: [{ headline: "{club} vai ao intervalo com cinco de vantagem", body: "{score}. O segundo tempo foi só para cumprir tabela." }],
  },
  {
    id: "substitute-hat-trick",
    on: "match",
    title: "Saiu do banco",
    rarity: "legendary",
    look: "sticker",
    find: (tale) => {
      const cameOn = new Set(tale.events.flatMap((e) => (e.type === "substitution" ? [e.playerId] : [])));
      return scorerWith(tale, 3, (g) => cameOn.has(g.playerId));
    },
    note: "{player} saiu do banco e fez {count} gols.",
    texts: [{ headline: "{player} entra e faz três", body: "{score}. O técnico do {club} vai ter dor de cabeça para escalar o próximo jogo." }],
  },
  {
    id: "early-red",
    on: "match",
    title: "Banho mais cedo",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      tale.events
        .filter((e) => e.type === "card" && e.card !== "yellow" && e.minute <= 10)
        .slice(0, 1)
        .flatMap((e) => (e.type === "card" ? [{ clubId: e.clubId, playerId: e.playerId, slots: { player: nameOf(tale, e.playerId), minute: String(e.minute) } }] : [])),
    note: "{player} foi expulso aos {minute} minutos.",
    texts: [{ headline: "{player} expulso aos {minute}'", body: "{score}. Mal deu tempo de suar a camisa." }],
  },
  {
    id: "keeper-sent-off",
    on: "match",
    title: "Sem goleiro, sem derrota",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      tale.events
        .filter((e) => e.type === "card" && e.card !== "yellow" && tale.groups[e.playerId] === "GK" && scoreFor(tale, e.clubId)[0] >= scoreFor(tale, e.clubId)[1])
        .slice(0, 1)
        .flatMap((e) => (e.type === "card" ? [{ clubId: e.clubId, playerId: e.playerId, slots: { player: nameOf(tale, e.playerId) } }] : [])),
    note: "O goleiro {player} foi expulso e o {club} não perdeu.",
    texts: [{ headline: "Sem o goleiro {player}, o {club} segura", body: "{score}. Expulso o goleiro, alguém da linha vestiu a camisa dele, e o time não perdeu." }],
  },
  {
    id: "assist-hat-trick",
    on: "match",
    title: "Garçom",
    rarity: "veryRare",
    look: "sticker",
    once: "player",
    find: (tale) => {
      const tally = new Map<string, Goal[]>();
      for (const g of goalsIn(tale)) if (g.assistId) tally.set(g.assistId, [...(tally.get(g.assistId) ?? []), g]);
      const found = [...tally].find(([, served]) => served.length >= 3);
      return found ? [{ clubId: found[1][0]?.clubId ?? "", playerId: found[0], slots: { player: nameOf(tale, found[0]), count: inWords(found[1].length) } }] : [];
    },
    note: "{player} deu {count} assistências.",
    texts: [{ headline: "{player} serve {count} gols", body: "{score}. O garçom do {club} não cobrou taxa de serviço." }],
  },
  {
    id: "two-own-goals",
    on: "match",
    title: "Dois contra",
    rarity: "veryRare",
    look: "clipping",
    find: (tale) =>
      sidesWhere(tale, (clubId) => count(goalsIn(tale), (g) => g.kind === "ownGoal" && g.clubId !== clubId) >= 2),
    note: "O {club} marcou dois gols contra no mesmo jogo.",
    texts: [{ headline: "{club} marca dois contra", body: "{score}. O adversário agradece a ajuda." }],
  },
  {
    id: "board-cake",
    on: "day",
    title: "Bolo da diretoria",
    rarity: "rare",
    look: "sticker",
    find: (scene) => {
      const stint = scene.coach.record.stints.find((s) => s.clubId === scene.clubId && s.until === null);
      return stint && nextYear(stint.from) === scene.date ? { clubId: scene.clubId } : null;
    },
    texts: [
      { headline: "Um ano de {club}: a diretoria manda bolo", body: "Faz um ano que {coach} chegou. Teve bolo no CT, vela de número 1 e discurso curto do presidente." },
      { headline: "{coach} completa um ano no {club}", body: "A diretoria mandou um bolo para o vestiário. Os jogadores comeram antes do treino, e o preparador físico fingiu não ver." },
    ],
  },
  {
    id: "namesake",
    on: "day",
    title: "Xará na peneira",
    rarity: "rare",
    look: "sticker",
    find: (scene) => {
      const kids = trialKidsOf(scene);
      const kid = kids.at(-1);
      if (!kid || !scene.coach.name || scene.random() >= NAMESAKE_CHANCE) return null;
      return { clubId: scene.clubId, playerId: kid, slots: { player: scene.coach.name }, rename: [{ prospectId: kid, name: scene.coach.name }] };
    },
    texts: [{ headline: "Peneira do {club} revela um xará do técnico", body: "O garoto se chama {player}, tem 16 anos e jura que o nome é coincidência. O pai dele não confirma nem desmente." }],
  },
  {
    id: "cousins",
    on: "day",
    title: "Os primos na base",
    rarity: "rare",
    look: "sticker",
    find: (scene) => {
      const kids = trialKidsOf(scene);
      const names = scene.otherCoachNames.filter(Boolean).slice(0, Math.max(0, kids.length - 1));
      if (!names.length || scene.random() >= NAMESAKE_CHANCE) return null;
      const rename = names.map((name, i) => ({ prospectId: kids[i] ?? "", name }));
      const list = names.length === 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
      return { clubId: scene.clubId, slots: { names: list }, rename };
    },
    texts: [{ headline: "A peneira do {club} parece reunião de família", body: "Entre os aprovados estão {names}. Os outros técnicos da casa juram que não indicaram ninguém." }],
  },
  {
    id: "april-fools",
    on: "day",
    title: "Primeiro de abril",
    rarity: "rare",
    look: "clipping",
    once: "club",
    find: (scene) => (scene.date.endsWith("-04-01") && scene.random() < APRIL_FOOLS_CHANCE ? { clubId: scene.clubId } : null),
    texts: [{ headline: "Exclusivo: {club} acerta com o melhor jogador do mundo", body: "Contrato de dez anos, salário pago em figurinhas. Atualização das 18h: a redação lembra que hoje é 1º de abril." }],
  },
  // 19 July is Brazil's Dia Nacional do Futebol, chosen in 1976 as the founding day (1900) of Sport Club Rio Grande, the
  // oldest Brazilian club still playing (https://pt.wikipedia.org/wiki/Dia_Nacional_do_Futebol).
  {
    id: "football-day",
    on: "day",
    title: "Dia do Futebol",
    rarity: "veryRare",
    look: "clipping",
    once: "club",
    find: (scene) => (scene.date.endsWith("-07-19") && playsToday(scene) ? { clubId: scene.clubId } : null),
    texts: [{ headline: "{club} joga no Dia Nacional do Futebol", body: "19 de julho: em 1900 nascia o Sport Club Rio Grande, o clube mais antigo do Brasil ainda em atividade. A data virou o dia do futebol em 1976." }],
  },
  {
    id: "secret-santa",
    on: "day",
    title: "Amigo secreto",
    rarity: "rare",
    look: "clipping",
    once: "club",
    find: (scene) => {
      if (!scene.date.endsWith("-12-25") || scene.random() >= SECRET_SANTA_CHANCE) return null;
      const squad = squadOf(scene);
      const player = squad[Math.floor(scene.random() * squad.length)];
      return player ? { clubId: scene.clubId, playerId: player.id, slots: { player: player.name } } : null;
    },
    texts: [{ headline: "Amigo secreto do {club}", body: "{player} tirou o técnico e deu de presente uma prancheta nova. {coach} prometeu usar no próximo jogo." }],
  },
  {
    id: "same-name",
    on: "day",
    title: "Xarás no elenco",
    rarity: "veryRare",
    look: "clipping",
    once: "player",
    find: (scene) => {
      if (!scene.date.endsWith("-01")) return null;
      const byName = new Map<string, string[]>();
      for (const player of squadOf(scene)) byName.set(player.name, [...(byName.get(player.name) ?? []), player.id]);
      const pair = [...byName].find(([, ids]) => ids.length > 1);
      if (!pair) return null;
      const [name, ids] = pair;
      return { clubId: scene.clubId, playerId: [...ids].sort()[0] ?? "", slots: { player: name } };
    },
    texts: [{ headline: "O {club} tem dois {player}", body: "Mesmo nome, mesmo vestiário. O roupeiro já bordou as iniciais nas toalhas para não ter briga." }],
  },
  // Internacional won the 1979 Brasileirão unbeaten (16 wins, 7 draws), the last champion to do it
  // (https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_1979).
  {
    id: "unbeaten-champion",
    on: "day",
    title: "Campeão invicto",
    rarity: "legendary",
    look: "page",
    find: (scene) => {
      const ended = seasonEndOf(scene);
      if (ended?.type !== "seasonEnded") return null;
      const won = Object.entries(ended.outcomes).find(([id, outcome]) => {
        const competition = scene.before.competitions[id];
        return outcome.championId === scene.clubId && competition?.kind === "league" && competition.division === "A";
      });
      if (!won) return null;
      const lost = scene.before.fixtures.some((f) => {
        if (f.competitionId !== won[0] || !f.result || (f.homeId !== scene.clubId && f.awayId !== scene.clubId)) return false;
        const [own, other] = f.homeId === scene.clubId ? [f.result.homeGoals, f.result.awayGoals] : [f.result.awayGoals, f.result.homeGoals];
        return own < other;
      });
      return lost ? null : { clubId: scene.clubId };
    },
    texts: [{ headline: "{club} campeão sem perder um jogo", body: "Nenhuma derrota no Brasileirão inteiro. O último a conseguir isso tinha sido o Internacional de 1979." }],
  },
  {
    id: "same-score-five",
    on: "day",
    title: "Placar repetido",
    rarity: "veryRare",
    look: "clipping",
    find: (scene) => {
      const scores = lastScores(scene, SAME_SCORE_RUN);
      const [first] = scores;
      if (!first || scores.length < SAME_SCORE_RUN || !scores.every(([own, other]) => own === first[0] && other === first[1])) return null;
      return { clubId: scene.clubId, slots: { score: `${first[0]} a ${first[1]}` } };
    },
    texts: [{ headline: "{club}: cinco jogos, cinco vezes {score}", body: "O placar se repete há cinco partidas. O torcedor já sabe o resultado antes do apito inicial." }],
  },
  {
    id: "goalless-run",
    on: "day",
    title: "Zero a zero, de novo",
    rarity: "legendary",
    look: "clipping",
    find: (scene) => {
      const scores = lastScores(scene, GOALLESS_RUN);
      return scores.length === GOALLESS_RUN && scores.every(([own, other]) => own === 0 && other === 0) ? { clubId: scene.clubId } : null;
    },
    texts: [{ headline: "Quarto 0 a 0 seguido do {club}", body: "Quatro jogos sem gol para nenhum dos lados. O placar eletrônico pediu férias." }],
  },
  // Palmeiras won the 2012 Copa do Brasil and were relegated from the Série A the same year, the second club after
  // Juventude in 1999 (https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2012_-_Série_A).
  {
    id: "relegated-cup-winner",
    on: "day",
    title: "Taça e rebaixamento",
    rarity: "legendary",
    look: "clipping",
    find: (scene) => {
      const ended = seasonEndOf(scene);
      if (ended?.type !== "seasonEnded") return null;
      const isRelegated = Object.values(ended.outcomes).some((outcome) => outcome.relegatedIds.includes(scene.clubId));
      const isCupWinner = scene.state.history.seasons.at(-1)?.champions["copa-do-brasil"] === scene.clubId;
      return isRelegated && isCupWinner ? { clubId: scene.clubId } : null;
    },
    texts: [{ headline: "{club} campeão da Copa do Brasil e rebaixado", body: "A taça e o rebaixamento no mesmo ano. Aconteceu com o Juventude em 1999 e com o Palmeiras em 2012." }],
  },
  {
    id: "windows-98",
    on: "coach",
    title: "Rodada de 1998",
    rarity: "rare",
    look: "sticker",
    texts: [{ headline: "O jogo voltou para 1998 por uma rodada", body: "Alguém digitou BRASFOOT. Janelas cinza, barra azul, e a rodada seguiu como antigamente." }],
  },
];
