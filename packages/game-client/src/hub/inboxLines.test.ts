import { describe, expect, test } from "vitest";
import type { Fixture, MatchResult } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { inboxLines, type DayEvent, type InboxLine } from "./inboxLines.js";

const game = newGameFromFiles(3, { coachClubId: "bahia-ba" }, bundledGameFiles);
const own = Object.values(game.players).find((p) => p.clubId === "bahia-ba");
const other = Object.values(game.players).find((p) => p.clubId === "vitoria-ba");
if (!own || !other) throw new Error("the test needs a Bahia and a Vitória player");
const baiano = Object.values(game.competitions).find((c) => c.kind === "state" && c.state === "BA");
const serieA = Object.values(game.competitions).find((c) => c.kind === "league" && c.division === "A");
if (!baiano || !serieA) throw new Error("the test needs the Baiano and Série A");

const card = { competitionId: baiano.id, fixtureId: "f", date: game.date };
const lines = (...events: DayEvent[]) => inboxLines(game, game, events);
const line = (event: DayEvent) => lines(event)[0];

function played(result: MatchResult, homeId = "bahia-ba", awayId = "vitoria-ba"): DayEvent {
  const fixture: Fixture = { id: "f", competitionId: baiano?.id ?? "", stage: 0, date: game.date, homeId, awayId, result };
  return { type: "matchPlayed", fixture };
}

const ledger = (revenue: number, costs: number) => ({
  revenue: { tickets: revenue, tv: 0, membership: 0, sponsorship: 0, otherIncome: 0, prizes: 0, playerSales: 0, friendlies: 0 },
  costs: { wages: costs, transferFees: 0, signingFees: 0, agentFees: 0, infrastructure: 0, interest: 0, fines: 0, friendlies: 0, bonuses: 0 },
});

describe("the coach's matches", () => {
  test("a win reads as the score line, with the competition", () => {
    expect(line(played({ homeGoals: 2, awayGoals: 1 }))).toEqual({ date: game.date, text: "Baiano: Bahia 2 x 1 Vitória", tone: "good" });
  });

  test("an away defeat is bad news and a draw is neither", () => {
    expect(line(played({ homeGoals: 3, awayGoals: 0 }, "vitoria-ba", "bahia-ba"))?.tone).toBe("bad");
    expect(line(played({ homeGoals: 1, awayGoals: 1 }))?.tone).toBe("neutral");
  });

  test("a continental match names the club from abroad as its pack does", () => {
    const fixture: Fixture = { id: "f", competitionId: "sul-americana-2026", stage: 1, date: game.date, homeId: "tm-209", awayId: "bahia-ba", result: { homeGoals: 1, awayGoals: 1 } };
    expect(line({ type: "matchPlayed", fixture })?.text).toBe("Sul-Americana: CA River Plate 1 x 1 Bahia");
  });

  test("a tie settled on penalties says who went through", () => {
    expect(line(played({ homeGoals: 0, awayGoals: 0, penaltyWinnerId: "bahia-ba" }))).toMatchObject({ text: "Baiano: Bahia 0 x 0 Vitória, Bahia nos pênaltis", tone: "good" });
  });

  test("a match that went to extra time says so, before its shootout", () => {
    expect(line(played({ homeGoals: 2, awayGoals: 1, isAfterExtraTime: true }))?.text).toBe("Baiano: Bahia 2 x 1 Vitória (prorr.)");
    expect(line(played({ homeGoals: 1, awayGoals: 1, isAfterExtraTime: true, penaltyWinnerId: "vitoria-ba" }))?.text).toBe("Baiano: Bahia 1 x 1 Vitória (prorr.), Vitória nos pênaltis");
  });

  test("other clubs' games stay out", () => {
    expect(lines(played({ homeGoals: 1, awayGoals: 0 }, "vitoria-ba", "juazeirense-ba"))).toEqual([]);
  });
});

describe("board and money", () => {
  test("the monthly closing is one headline with the month's result", () => {
    const closed: DayEvent = { type: "monthClosed", clubId: "bahia-ba", month: "2026-03", ledger: ledger(5_000_000, 3_800_000), cash: 0, loans: 0, wagesOwed: 0, borrowed: 0, debtRepaid: 0 };
    expect(line(closed)).toMatchObject({ text: "Fechamento de março: lucro de R$ 1,2 mi", tone: "good" });
    expect(line({ ...closed, ledger: ledger(1_000_000, 3_000_000) })).toMatchObject({ text: "Fechamento de março: prejuízo de R$ 2 mi", tone: "bad" });
  });

  test("a friendly reads as its score with the fee our club earned or paid", () => {
    const friendly = { id: "x", date: game.date, homeId: "vitoria-ba", awayId: "bahia-ba", fee: 300_000, result: { homeGoals: 1, awayGoals: 2 } };
    expect(line({ type: "friendlyPlayed", friendly, gate: 500_000 })).toMatchObject({ text: "Amistoso: Vitória 1 x 2 Bahia, cachê de R$ 300 mil", tone: "good" });
    const hosting = { ...friendly, homeId: "bahia-ba", awayId: "vitoria-ba", result: { homeGoals: 0, awayGoals: 0 } };
    expect(line({ type: "friendlyPlayed", friendly: hosting, gate: 500_000 })).toMatchObject({ text: "Amistoso: Bahia 0 x 0 Vitória, bilheteria de R$ 500 mil e cachê pago de R$ 300 mil", tone: "neutral" });
    expect(line({ type: "friendlyCalledOff", friendly, reason: "fixture" })).toMatchObject({ text: "Amistoso contra o Vitória cancelado: a data virou jogo oficial", tone: "neutral" });
    expect(line({ type: "friendlyCalledOff", friendly, reason: "cash" })).toMatchObject({ text: "Amistoso contra o Vitória cancelado: o mandante ficou sem caixa para o cachê", tone: "bad" });
  });

  test("a title bonus is the squad's bicho", () => {
    expect(line({ type: "titleBonusPaid", clubId: "bahia-ba", competitionId: baiano.id, amount: 2_000_000 })).toMatchObject({ text: "Bicho do título pago ao elenco: R$ 2 mi", tone: "neutral" });
    expect(line({ type: "titleBonusPaid", clubId: "vitoria-ba", competitionId: baiano.id, amount: 2_000_000 })).toBeUndefined();
  });

  test("late wages and forced sales are bad news", () => {
    expect(line({ type: "wagesLate", clubId: "bahia-ba", owed: 4_000_000, months: 1 })).toMatchObject({ text: "Salários atrasados: R$ 4 mi em aberto", tone: "bad" });
    expect(line({ type: "forcedSale", clubId: "bahia-ba", playerId: own.id, buyerId: "vitoria-ba", fee: 900_000 })).toMatchObject({
      text: `Diretoria vendeu ${own.name} por R$ 900 mil (Vitória)`,
      tone: "bad",
    });
    expect(line({ type: "forcedSale", clubId: "bahia-ba", playerId: own.id, buyerId: null, fee: 900_000 })?.text).toBe(`Diretoria vendeu ${own.name} por R$ 900 mil (exterior)`);
  });

  test("a Copa do Brasil prize is good news", () => {
    expect(line({ type: "prizePaid", clubId: "bahia-ba", competitionId: "copa-do-brasil-2026", amount: 1_400_000 })).toMatchObject({ text: "Copa do Brasil: prêmio de R$ 1,4 mi", tone: "good" });
  });

  test("the board's answer to a request names the player and the reason it refused", () => {
    expect(line({ type: "requestDecided", request: { kind: "sign", playerId: other.id }, approved: true, reason: null })).toMatchObject({
      text: `Diretoria aprova a contratação de ${other.name}`,
      tone: "good",
    });
    expect(line({ type: "requestDecided", request: { kind: "sell", playerId: own.id }, approved: false, reason: "noBuyer" })).toMatchObject({
      text: `Diretoria recusa a venda de ${own.name}: ninguém fez proposta`,
      tone: "bad",
    });
    expect(line({ type: "requestDecided", request: { kind: "renew", playerId: own.id, years: 2 }, approved: false, reason: "wageCap" })?.text).toBe(
      `Diretoria recusa a renovação de ${own.name}: passa do teto salarial`,
    );
    expect(line({ type: "requestDecided", request: { kind: "loanIn", playerId: other.id }, approved: false, reason: "windowClosed" })?.text).toBe(
      `Diretoria recusa o empréstimo de ${other.name}: janela fechada`,
    );
  });

  test("a signing the board approved is not reported twice", () => {
    const approved: DayEvent = { type: "requestDecided", request: { kind: "sign", playerId: other.id }, approved: true, reason: null };
    const moved: DayEvent = { type: "playerMoved", kind: "transfer", playerId: other.id, name: other.name, fromClubId: "vitoria-ba", toClubId: "bahia-ba", fee: 2_000_000 };
    expect(lines(approved, moved)).toHaveLength(1);
  });

  test("the season's goal and review come from the board", () => {
    expect(line({ type: "boardExpectationsSet", clubId: "bahia-ba", season: 2027, expectation: "continental", targetPosition: 6, tableSize: 20 })).toMatchObject({
      text: "Meta da diretoria para 2027: Libertadores (até 6º)",
      tone: "neutral",
    });
    const review: DayEvent = { type: "coachSeasonReviewed", clubId: "bahia-ba", season: 2026, expectation: "topHalf", targetPosition: 10, position: 7, won: false, promoted: false, reputation: 40 };
    expect(line(review)).toMatchObject({ text: "Balanço de 2026: 7º lugar, a meta era 10º", tone: "good" });
    expect(line({ ...review, position: 15 })?.tone).toBe("bad");
  });
});

describe("the squad", () => {
  test("injuries and suspensions name the player and how long he is out", () => {
    expect(line({ type: "playerInjured", playerId: own.id, clubId: "bahia-ba", days: 12, fitOn: "2026-02-01" })).toMatchObject({ text: `${own.name} lesionado: 12 dias fora`, tone: "bad" });
    expect(line({ type: "playerSuspended", playerId: own.id, clubId: "bahia-ba", ...card, matches: 1 })).toMatchObject({ text: `${own.name} suspenso: 1 jogo`, tone: "bad" });
    expect(line({ type: "playerSuspended", playerId: own.id, clubId: "bahia-ba", ...card, matches: 2 })?.text).toBe(`${own.name} suspenso: 2 jogos`);
  });

  test("an injury says what it is, and one coming back says he got hurt again", () => {
    const injury: DayEvent = { type: "playerInjured", playerId: own.id, clubId: "bahia-ba", days: 30, fitOn: "2026-03-01", kind: "ligament" };
    expect(line(injury)).toMatchObject({ text: `${own.name} lesionado: lesão ligamentar, 30 dias fora`, tone: "bad" });
    expect(line({ ...injury, kind: "muscle", days: 9, isRecurrence: true })?.text).toBe(`${own.name} volta a se lesionar: lesão muscular, 9 dias fora`);
    expect(line({ ...injury, kind: "knock", days: 2 })?.text).toBe(`${own.name} sente uma pancada: 2 dias fora`);
    expect(line({ ...injury, kind: "knock", days: 40 })?.text).toBe(`${own.name} lesionado: 40 dias fora`);
  });

  test("a veteran announcing his last season asks the coach to talk him round, and his answer is news", () => {
    expect(line({ type: "playerWantsToRetire", playerId: own.id, clubId: "bahia-ba", name: "Gilberto", age: 38, afterSeason: 2027 })).toMatchObject({
      text: "Gilberto anuncia que 2027 será sua última temporada. Converse com ele na página do jogador",
      tone: "neutral",
    });
    const asked: DayEvent = { type: "playerPersuaded", playerId: own.id, clubId: "bahia-ba", name: "Gilberto", stays: true };
    expect(line(asked)).toMatchObject({ text: "Gilberto aceita jogar mais um ano", tone: "good" });
    expect(line({ ...asked, stays: false })).toMatchObject({ text: "Gilberto não muda de ideia e para no fim da temporada", tone: "bad" });
  });

  test("a record one of the coach's players or his club breaks is news, and other clubs' records are not", () => {
    const record: DayEvent = { type: "recordBroken", scope: "league", competition: "serie-a", kind: "mostSeasonGoals", clubId: "bahia-ba", playerId: own.id, name: "Gilberto", value: 19, previous: 18 };
    expect(line(record)).toMatchObject({ text: "Recorde: Gilberto chega a 19 gols e passa o recorde da Série A numa temporada (18)", tone: "good" });
    expect(line({ ...record, scope: "club", competition: null, kind: "youngestScorer", value: 16, previous: 17 })?.text).toBe("Recorde: Gilberto, 16 anos, é o goleador mais jovem da história do clube");
    expect(line({ ...record, scope: "club", competition: null, kind: "longestUnbeaten", playerId: null, name: null, value: 14, previous: 13 })?.text).toBe("Recorde: 14 jogos sem perder, a maior invencibilidade do clube");
    expect(line({ ...record, kind: "biggestWin", playerId: null, name: null, value: 6, previous: 5 })?.text).toBe("Recorde: a maior goleada da história da Série A, por 6 gols de diferença");
    expect(lines({ ...record, clubId: "palmeiras-sp" })).toEqual([]);
  });

  test("the season's awards tell the coach every prize his players won", () => {
    const ours = { playerId: own.id, name: "Gilberto", clubId: "bahia-ba", age: 20, apps: 30, goals: 21, assists: 2, average: 7.4 };
    const theirs = { ...ours, playerId: "x", name: "Outro", clubId: "palmeiras-sp" };
    const awards: DayEvent = {
      type: "seasonAwarded",
      season: 2026,
      awards: {
        competition: "serie-a",
        bolaDeOuro: { ...ours, role: "atacante" },
        runnersUp: [],
        bolaDePrata: [{ ...ours, role: "atacante" }, { ...theirs, role: "goleiro" }],
        topScorer: { playerId: own.id, name: "Gilberto", clubId: "bahia-ba", goals: 21 },
        bestYoung: { ...ours, role: "atacante" },
        ballonDor: [{ playerId: own.id, name: "Gilberto", clubId: "bahia-ba", clubName: "Bahia", score: 90, titles: [], apps: 30, goals: 21, average: 7.4 }],
      },
    };
    expect(lines(awards).map((l) => [l.text, l.tone])).toEqual([
      ["Gilberto ganha a Bola de Ouro de 2026: o melhor do Brasileirão", "good"],
      ["Gilberto ganha a Bola de Prata de atacante", "good"],
      ["Gilberto é o artilheiro do Brasileirão, com 21 gols", "good"],
      ["Gilberto é a revelação do Brasileirão", "good"],
      ["Gilberto ganha a Bola de Ouro da France Football: o melhor do mundo", "good"],
    ]);
    expect(lines({ ...awards, awards: { ...awards.awards, bolaDeOuro: null, bolaDePrata: [], topScorer: null, bestYoung: null, ballonDor: [] } })).toEqual([]);
  });

  test("bookings and sending-offs stay out; the suspension is the news", () => {
    expect(lines({ type: "playerBooked", playerId: own.id, clubId: "bahia-ba", ...card, minute: 10 })).toEqual([]);
    expect(lines({ type: "playerSentOff", playerId: own.id, clubId: "bahia-ba", ...card, minute: 10, secondYellow: false })).toEqual([]);
  });

  test("retirements, academy promotions and renewals are plain news", () => {
    expect(line({ type: "playerRetired", playerId: own.id, clubId: "bahia-ba", name: "Gilberto", age: 38 })).toMatchObject({ text: "Gilberto se aposenta aos 38 anos", tone: "neutral" });
    expect(line({ type: "youthPromoted", playerId: own.id, clubId: "bahia-ba" })).toMatchObject({ text: `${own.name} sobe da base`, tone: "neutral" });
    expect(line({ type: "playerContractRenewed", playerId: own.id, clubId: "bahia-ba", until: "2028-12-31", wage: 1 })).toMatchObject({ text: `${own.name} renova até 2028`, tone: "neutral" });
  });

  test("the academy's trials, the kids it lets go at 21 and those who fill a short squad are plain news; other clubs' stay out", () => {
    expect(line({ type: "youthTrialsHeld", clubId: "bahia-ba", prospectIds: ["k1", "k2", "k3"] })).toMatchObject({ text: "Peneira: 3 garotos novos na base", tone: "neutral" });
    expect(line({ type: "prospectReleased", prospectId: "k1", clubId: "bahia-ba", name: "Kauã Pinheiro" })).toMatchObject({ text: "Kauã Pinheiro fez 21 anos e deixou a base, dispensado", tone: "neutral" });
    expect(lines({ type: "youthTrialsHeld", clubId: "vitoria-ba", prospectIds: ["k9"] })).toEqual([]);
    expect(line({ type: "squadToppedUp", clubId: "bahia-ba", playerIds: ["k1", "k2"] })).toMatchObject({ text: "Elenco completado com 2 garotos da base", tone: "neutral" });
  });

  test("the Copinha reads as the academy's run: the title, or the round and the club that knocked it out", () => {
    const copinhaOf = (championId: string) => ({
      season: 2026,
      championId,
      matches: [
        { round: 0, homeId: "bahia-ba", awayId: "sport-pe", homeGoals: 2, awayGoals: 0 },
        { round: 0, homeId: "vitoria-ba", awayId: "ceara-ce", homeGoals: 1, awayGoals: 1, penaltyWinnerId: "vitoria-ba" },
        { round: 1, homeId: "bahia-ba", awayId: "vitoria-ba", homeGoals: 0, awayGoals: 1 },
      ],
    });
    const after = (championId: string) => ({ ...game, youth: { rngState: 0, prospects: {}, copinha: copinhaOf(championId) } });
    const copinha = (championId: string) => inboxLines(game, after(championId), [{ type: "copinhaPlayed", season: 2026, championId }])[0];
    expect(copinha("vitoria-ba")).toMatchObject({ text: "Copinha: base eliminada na final pelo Vitória", tone: "bad" });
    expect(copinha("bahia-ba")).toMatchObject({ text: "Bahia campeão da Copinha", tone: "good" });
  });

  test("players arriving and leaving say how", () => {
    const move = { type: "playerMoved", playerId: own.id, name: own.name, fee: 3_000_000 } as const;
    expect(line({ ...move, kind: "transfer", fromClubId: "bahia-ba", toClubId: "vitoria-ba" })).toMatchObject({ text: `${own.name} vendido por R$ 3 mi (Vitória)`, tone: "neutral" });
    expect(line({ ...move, kind: "abroad", fromClubId: "bahia-ba", toClubId: null })?.text).toBe(`${own.name} vendido ao exterior por R$ 3 mi`);
    expect(line({ ...move, kind: "released", fromClubId: "bahia-ba", toClubId: null })?.text).toBe(`${own.name} deixa o clube no fim do contrato`);
    expect(line({ ...move, kind: "loan", fromClubId: "bahia-ba", toClubId: "vitoria-ba" })?.text).toBe(`${own.name} emprestado (Vitória)`);
    expect(line({ ...move, kind: "loan", fromClubId: "vitoria-ba", toClubId: "bahia-ba" })).toMatchObject({ text: `${own.name} chega por empréstimo (Vitória)`, tone: "good" });
    expect(line({ ...move, kind: "loanReturn", fromClubId: "vitoria-ba", toClubId: "bahia-ba" })?.text).toBe(`${own.name} volta de empréstimo`);
    expect(line({ ...move, kind: "freeAgent", fromClubId: null, toClubId: "bahia-ba", fee: 0 })?.text).toBe(`${own.name} chega sem custo`);
    expect(line({ ...move, kind: "fromAbroad", fromClubId: null, toClubId: "bahia-ba" })?.text).toBe(`${own.name} chega do exterior por R$ 3 mi`);
    expect(line({ ...move, kind: "releaseClause", fromClubId: "bahia-ba", toClubId: "vitoria-ba" })).toMatchObject({ text: `${own.name} sai: Vitória paga a multa rescisória, R$ 3 mi`, tone: "bad" });
    expect(lines({ ...move, kind: "transfer", fromClubId: "vitoria-ba", toClubId: "juazeirense-ba" })).toEqual([]);
  });

  test("a sale or a promotion the assistant made on his own says he did it", () => {
    const sold: DayEvent = { type: "playerMoved", kind: "transfer", playerId: own.id, name: own.name, fromClubId: "bahia-ba", toClubId: "vitoria-ba", fee: 3_000_000, byAssistant: true };
    expect(line(sold)).toMatchObject({ text: `O auxiliar vendeu ${own.name}, fora dos planos, por R$ 3 mi (Vitória)`, tone: "neutral" });
    expect(line({ type: "youthPromoted", playerId: own.id, clubId: "bahia-ba", byAssistant: true })?.text).toBe(`O auxiliar subiu ${own.name} da base`);
  });

  test("a player entering his contract's last six months is a warning that other clubs may now sign him for free", () => {
    const ending = (until: string) => ({ ...game, players: { ...game.players, [own.id]: { ...own, contractUntil: until } } });
    const today = { ...ending("2026-07-23"), date: "2026-01-20" };
    const tomorrow = { ...today, date: "2026-01-21" };
    expect(inboxLines(today, tomorrow, [])).toEqual([
      { date: "2026-01-20", text: `${own.name} entra nos últimos seis meses de contrato (até 23 jul): outros clubes já podem assinar pré-contrato com ele`, tone: "bad" },
    ]);
    expect(inboxLines({ ...today, date: "2026-01-19" }, today, [])).toEqual([]);
    const signed = { ...tomorrow, market: { ...tomorrow.market, preContracts: { [own.id]: "vitoria-ba" } } };
    expect(inboxLines(today, signed, [])).toEqual([]);
  });

  test("pre-contracts and Europe's refused bids are reported; an accepted bid shows up as the sale", () => {
    expect(line({ type: "preContractSigned", playerId: own.id, fromClubId: "bahia-ba", toClubId: "vitoria-ba" })).toMatchObject({ text: `${own.name} assina pré-contrato com Vitória`, tone: "bad" });
    expect(line({ type: "preContractSigned", playerId: other.id, fromClubId: "vitoria-ba", toClubId: "bahia-ba" })).toMatchObject({ text: `${other.name} assina pré-contrato com Bahia`, tone: "good" });
    expect(line({ type: "europeBid", playerId: own.id, clubId: "bahia-ba", feeEur: 1, fee: 20_000_000, accepted: false })).toMatchObject({
      text: `Proposta da Europa por ${own.name} recusada: R$ 20 mi`,
      tone: "neutral",
    });
    expect(lines({ type: "europeBid", playerId: own.id, clubId: "bahia-ba", feeEur: 1, fee: 20_000_000, accepted: true })).toEqual([]);
  });

  test("an offer for one of his players asks for his answer, naming the buyer, or Europe", () => {
    expect(line({ type: "bidReceived", playerId: own.id, buyerId: "vitoria-ba", fee: 20_000_000 })).toMatchObject({ text: `Proposta do Vitória por ${own.name}: R$ 20 mi. Responda no mercado` });
    expect(line({ type: "bidReceived", playerId: own.id, buyerId: null, fee: 20_000_000 })).toMatchObject({ text: `Proposta da Europa por ${own.name}: R$ 20 mi. Responda no mercado` });
  });

  test("a counter to his offer says what the club asks, once, and an auction without bids is reported", () => {
    expect(
      lines(
        { type: "requestDecided", request: { kind: "sign", playerId: other.id, fee: 1 }, approved: false, reason: "counterOffer" },
        { type: "counterOffered", playerId: other.id, clubId: "vitoria-ba", fee: 20_000_000 },
      ),
    ).toEqual([expect.objectContaining({ text: `Vitória pede R$ 20 mi por ${other.name}` })]);
    expect(line({ type: "auctionClosed", playerId: own.id, sold: false })).toMatchObject({ text: `Leilão de ${own.name} termina sem lances` });
  });
});

describe("supporters", () => {
  test("pressure, protests, violence and closed doors are bad news", () => {
    expect(line({ type: "fansPressure", clubId: "bahia-ba", fans: 30 })).toMatchObject({ text: "Torcida cobra o time", tone: "bad" });
    expect(line({ type: "fansProtest", clubId: "bahia-ba", fans: 20, moraleLost: 5 })).toMatchObject({ text: "Protesto da torcida organizada", tone: "bad" });
    expect(line({ type: "fansViolence", clubId: "bahia-ba", fine: 150_000 })).toMatchObject({ text: "Briga na torcida: multa de R$ 150 mil", tone: "bad" });
    expect(line({ type: "fansViolence", clubId: "bahia-ba", fine: 0 })?.text).toBe("Briga na torcida");
    expect(line({ type: "closedDoors", clubId: "bahia-ba", games: 2 })).toMatchObject({ text: "Punição: 2 jogos com portões fechados", tone: "bad" });
  });

  test("another club's supporters stay out", () => {
    expect(lines({ type: "fansProtest", clubId: "vitoria-ba", fans: 20, moraleLost: 5 })).toEqual([]);
  });
});

describe("the stadium", () => {
  test("new seats opening at the coach's ground are good news, at another club's no news", () => {
    expect(line({ type: "stadiumOpened", clubId: "bahia-ba", seats: 5_000, capacity: 52_364 })).toMatchObject({ text: "Obra pronta: 5.000 lugares novos, 52.364 no total", tone: "good" });
    expect(lines({ type: "stadiumOpened", clubId: "vitoria-ba", seats: 5_000, capacity: 40_000 })).toEqual([]);
  });
});

describe("the coach's career", () => {
  test("job offers name the club, the salary and how long", () => {
    expect(line({ type: "jobOffered", offer: { clubId: "vitoria-ba", salary: 250_000, untilSeason: 2027, expiresOn: "2026-02-01" } })).toMatchObject({
      text: "Vitória faz proposta: R$ 250 mil por mês até 2027",
      tone: "good",
    });
  });

  test("being hired, fired, renewed or let go", () => {
    expect(line({ type: "coachHired", clubId: "vitoria-ba", salary: 1, untilSeason: 2027 })).toMatchObject({ text: "Vitória anuncia você como técnico até 2027", tone: "good" });
    expect(line({ type: "coachFired", clubId: "bahia-ba", date: game.date, isYou: true, position: 18, targetPosition: 10 })).toMatchObject({ text: "Bahia demite você: 18º lugar, a meta era 10º", tone: "bad" });
    expect(line({ type: "contractRenewed", clubId: "bahia-ba", untilSeason: 2027 })).toMatchObject({ text: "Contrato renovado até 2027", tone: "good" });
    expect(line({ type: "contractEnded", clubId: "bahia-ba", season: 2026 })).toMatchObject({ text: "Fim do contrato com Bahia", tone: "bad" });
  });

  test("a hired assistant the new club can't pay stays behind", () => {
    expect(line({ type: "assistantLeft", clubId: "vitoria-ba", name: "Cláudio" })).toMatchObject({ text: "Vitória não paga o salário de Cláudio: seu auxiliar não vem com você", tone: "bad" });
  });

  test("a club he once coached naming its new coach is his news; any other club's is not", () => {
    expect(line({ type: "coachAppointed", clubId: "bahia-ba", coachId: "c1", name: "Rogério Ceni" })).toMatchObject({ text: "Bahia anuncia Rogério Ceni como novo técnico", tone: "neutral" });
    expect(lines({ type: "coachAppointed", clubId: "vitoria-ba", coachId: "c2", name: "Jair Ventura" })).toEqual([]);
  });

  test("on the day he takes a new job, the new club's news is his too", () => {
    const hired = { ...game, coachClubId: "vitoria-ba" };
    expect(inboxLines(game, hired, [{ type: "fansProtest", clubId: "vitoria-ba", fans: 20, moraleLost: 5 }])).toHaveLength(1);
  });

  test("other coaches' firings stay out", () => {
    expect(lines({ type: "coachFired", clubId: "vitoria-ba", date: game.date, isYou: false, position: 18, targetPosition: 10 })).toEqual([]);
  });
});

describe("the season", () => {
  test("the season's end says what the coach's club won or lost", () => {
    const outcome = { championId: "bahia-ba", promotedIds: [], relegatedIds: [] };
    expect(line({ type: "seasonEnded", season: 2026, outcomes: { [serieA.id]: outcome } })).toMatchObject({ text: "Bahia campeão da Série A", tone: "good" });
    expect(line({ type: "seasonEnded", season: 2026, outcomes: { [serieA.id]: { ...outcome, championId: "x", relegatedIds: ["bahia-ba"] } } })).toMatchObject({
      text: "Bahia rebaixado na Série A",
      tone: "bad",
    });
    expect(line({ type: "seasonEnded", season: 2026, outcomes: { [serieA.id]: { ...outcome, championId: "x", promotedIds: ["bahia-ba"] } } })?.text).toBe(
      "Bahia conquista o acesso na Série A",
    );
    expect(line({ type: "seasonEnded", season: 2026, outcomes: {} })).toMatchObject({ text: "Fim da temporada 2026", tone: "neutral" });
  });

  test("a new stage opening is not news by itself", () => {
    expect(lines({ type: "stageOpened", competitionId: baiano.id, stage: 1 })).toEqual([]);
  });
});

test("every line is dated the day it happened", () => {
  const before = { ...game, date: "2026-01-11" };
  expect(inboxLines(before, game, [{ type: "fansPressure", clubId: "bahia-ba", fans: 30 }])[0]?.date).toBe("2026-01-11");
});

describe("contracts", () => {
  const ending = (until: string, players = [own]) => ({ ...game, players: { ...game.players, ...Object.fromEntries(players.map((p) => [p.id, { ...p, contractUntil: until }])) } });

  test("players entering their contract's last year are one warning, before other clubs may sign them", () => {
    const lastYear = (lines: readonly InboxLine[]) => lines.filter((l) => l.text.includes("último ano de contrato"));
    const today = { ...ending("2027-06-30"), date: "2026-06-30" };
    const tomorrow = { ...today, date: "2026-07-01" };
    expect(lastYear(inboxLines(today, tomorrow, []))).toEqual([
      { date: "2026-06-30", text: `${own.name} entra no último ano de contrato (até jun 2027): renove antes que outros clubes possam assinar pré-contrato com ele`, tone: "neutral" },
    ]);
    expect(lastYear(inboxLines(tomorrow, { ...tomorrow, date: "2026-07-02" }, []))).toEqual([]);
    const second = Object.values(game.players).find((p) => p.clubId === "bahia-ba" && p.id !== own.id);
    if (!second) throw new Error("Bahia has one player");
    const both = { ...ending("2027-06-30", [own, second]), date: "2026-06-30" };
    expect(lastYear(inboxLines(both, { ...both, date: "2026-07-01" }, [])).map((l) => l.text)).toEqual([
      `2 jogadores entram no último ano de contrato: ${[own.name, second.name].sort((a, b) => a.localeCompare(b, "pt-BR")).join(" e ")}`,
    ]);
  });

  test("a player's counter to a renewal says what he asks and for how long", () => {
    expect(line({ type: "renewalCountered", playerId: own.id, months: 24, wage: 450_000 })).toMatchObject({
      text: `${own.name} pede R$ 450 mil por mês para renovar por 2 anos. Responda na renovação`,
      tone: "neutral",
    });
    expect(line({ type: "renewalCountered", playerId: own.id, months: 6, wage: 450_000 })?.text).toContain("por 6 meses");
    expect(lines({ type: "requestDecided", request: { kind: "renew", playerId: own.id, years: 2, wage: 1 }, approved: false, reason: "playerCounter" })).toEqual([]);
  });

  test("a renewal turned down by the player says why", () => {
    const refused = (reason: string) => line({ type: "requestDecided", request: { kind: "renew", playerId: own.id, years: 0.5 }, approved: false, reason })?.text;
    expect(refused("lengthRefused")).toBe(`Diretoria recusa a renovação de ${own.name}: ele não aceita esse tempo de contrato`);
    expect(refused("wageTooLow")).toBe(`Diretoria recusa a renovação de ${own.name}: ele quer bem mais do que o oferecido`);
  });

  test("what the assistant did with the contracts is his own news", () => {
    expect(line({ type: "playerContractRenewed", playerId: own.id, clubId: "bahia-ba", until: "2029-12-31", wage: 320_000, byAssistant: true })).toMatchObject({
      text: `O auxiliar renovou com ${own.name} até dez 2029, por R$ 320 mil por mês`,
      tone: "good",
    });
    const skipped = (reason: "notInPlans" | "playerUnwilling" | "wageCap") => line({ type: "renewalSkipped", playerId: own.id, clubId: "bahia-ba", until: "2026-12-31", reason })?.text;
    expect(skipped("notInPlans")).toBe(`O auxiliar deixa acabar o contrato de ${own.name} (dez 2026): está fora dos planos`);
    expect(skipped("playerUnwilling")).toBe(`O auxiliar não renovou com ${own.name} (contrato até dez 2026): ele não aceita nenhum tempo de contrato`);
    expect(skipped("wageCap")).toBe(`O auxiliar não renovou com ${own.name} (contrato até dez 2026): o salário passa do teto da folha`);
    expect(lines({ type: "renewalSkipped", playerId: other.id, clubId: "vitoria-ba", until: "2026-12-31", reason: "notInPlans" })).toEqual([]);
  });

  test("a look at many contracts is one line per outcome, so it doesn't flood the inbox", () => {
    const squad = Object.values(game.players).filter((p) => p.clubId === "bahia-ba").slice(0, 4);
    const [a, b, c, d] = squad;
    if (!a || !b || !c || !d) throw new Error("Bahia has four players");
    const renewed = (p: typeof a): DayEvent => ({ type: "playerContractRenewed", playerId: p.id, clubId: "bahia-ba", until: "2028-12-31", wage: 1, byAssistant: true });
    const skipped = (p: typeof a): DayEvent => ({ type: "renewalSkipped", playerId: p.id, clubId: "bahia-ba", until: "2026-12-31", reason: "notInPlans" });
    expect(lines(renewed(a), renewed(b), skipped(c), skipped(d)).map((l) => l.text)).toEqual([
      `O auxiliar renovou 2 contratos: ${a.name} e ${b.name}`,
      `O auxiliar deixa acabar 2 contratos: ${c.name} e ${d.name} (fora dos planos)`,
    ]);
  });
});

describe("national teams", () => {
  test("a call-up of one of the coach's players says for whom and until when", () => {
    expect(line({ type: "calledUp", playerId: own.id, clubId: "bahia-ba", teamId: "uruguay", until: "2026-03-31" })).toEqual({ date: game.date, text: `${own.name} convocado pela seleção: Uruguai, até 31 mar`, tone: "neutral" });
  });

  test("another club's call-up is not the coach's news", () => {
    expect(lines({ type: "calledUp", playerId: other.id, clubId: "vitoria-ba", teamId: "uruguay", until: "2026-03-31" })).toEqual([]);
  });

  test("a player back from his national team is back for the coach", () => {
    expect(line({ type: "backFromDuty", playerId: own.id, clubId: "bahia-ba", teamId: "brazil" })?.text).toBe(`${own.name} volta da seleção (Brasil)`);
  });

  test("a World Cup's champion makes the news", () => {
    expect(line({ type: "nationalTitle", competitionId: "world-cup-2026", name: "Copa do Mundo 2026", winnerId: "spain", runnerUpId: "argentina" })?.text).toBe("Espanha campeã da Copa do Mundo 2026, sobre a Argentina");
  });
});

describe("national-team jobs", () => {
  test("a federation's offer names the team with its article and the day it expires", () => {
    expect(line({ type: "nationalJobOffered", teamId: "brazil", expiresOn: "2026-08-03" })?.text).toBe("A federação oferece a você o comando do Brasil, até 3 ago");
  });

  test("losing the job is bad news", () => {
    expect(line({ type: "nationalCoachFired", teamId: "portugal" })).toMatchObject({ text: "Você não é mais o técnico de Portugal", tone: "bad" });
  });
});

describe("easter eggs", () => {
  const found = (clubId: string): DayEvent => ({ type: "eggFound", eggId: "sobrenatural", clubId, title: "Sobrenatural de Almeida", look: "sticker", headline: "Sobrenatural de Almeida baixou no jogo do Bahia", body: "corpo" });

  test("an egg the coach's club found is a good line marked as a rarity; another club's is not news", () => {
    expect(line(found("bahia-ba"))).toEqual({ date: game.date, text: "Raridade: Sobrenatural de Almeida baixou no jogo do Bahia", tone: "good" });
    expect(lines(found("vitoria-ba"))).toEqual([]);
  });
});
