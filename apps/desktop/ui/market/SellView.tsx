import { useState, type ReactNode } from "react";
import type { BidAnswer, BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { isWindowOpen } from "@boleiro/engine/sim/transfers/transferWindows";
import type { SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { daysBetween } from "@boleiro/engine/sim/dates";
import { formatBarDate, formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { Select } from "../controls/Select.js";
import { Crest } from "../clubs/Crest.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { POSITION_NAMES } from "../format/playerLabels.js";
import { bidSheets, saleRows, type BidSheet, type SaleRow, type SellState } from "./bidSheets.js";
import { MoneyStepper, roundStep } from "./MoneyStepper.js";

type Props = {
  state: SellState;
  tabs: ReactNode;
  onAnswer: (playerId: string, answer: BidAnswer) => Promise<BidOutcome>;
  onList: (playerId: string, way: SaleWay | null) => void;
};

// guess: a counter opens a fifth over the offer, the haggle a coach starts from.
const COUNTER_OPENING = 1.2;
const POSITION_LETTER = { GK: "G", DEF: "D", MID: "M", ATT: "A" } as const;

const euros = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** "€ 30 mi" */
const formatEuros = (amount: number) => (amount >= 1e6 ? `€ ${euros.format(amount / 1e6)} mi` : `€ ${euros.format(amount / 1e3)} mil`);

const signed = (amount: number) => `${amount >= 0 ? "+" : "−"}${formatMoney(Math.abs(amount))}`;

/** What came of the coach's answer, as a line under the offer. */
function outcomeText(outcome: BidOutcome, name: string, buyer: string): string {
  switch (outcome) {
    case "sold":
      return `${name} vendido para ${buyer}.`;
    case "declined":
      return `Proposta por ${name} recusada.`;
    case "finalOffer":
      return `${buyer} subiu a oferta, mas avisa que é a última.`;
    case "walkedAway":
      return `${buyer} desistiu de ${name}.`;
  }
}

/** Propostas: clubs' offers for the coach's players, and his players for sale or at auction. */
export function SellView({ state, tabs, onAnswer, onList }: Props) {
  const sheets = bidSheets(state);
  const sales = saleRows(state);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const sheet = sheets.find((s) => s.playerId === pickedId) ?? sheets[0] ?? null;
  const buyerName = (s: Pick<BidSheet, "buyerId">) => (s.buyerId ? (state.clubs[s.buyerId]?.shortName ?? "O clube") : "O clube europeu");

  /** A failed answer leaves the offer as it was; the screen around says it didn't go through. */
  async function answer(s: BidSheet, given: BidAnswer) {
    setOutcome(null);
    const result = await onAnswer(s.playerId, given).catch(() => null);
    if (result) setOutcome(outcomeText(result, s.name, buyerName(s)));
  }

  return (
    <div className="market-sell">
      <div className="market-sell-main">
        {tabs}
        <section className="page market-bid" aria-label="Propostas recebidas">
          {outcome && (
            <p className="market-outcome" role="status">
              {outcome}
            </p>
          )}
          {sheets.length > 1 && (
            <div className="market-bid-picks" role="group" aria-label="Escolher proposta">
              {sheets.map((s) => (
                <button key={s.playerId} className={s.playerId === sheet?.playerId ? "chip ink" : "chip off"} aria-pressed={s.playerId === sheet?.playerId} onClick={() => setPickedId(s.playerId)}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {sheet ? (
            <BidCard key={`${sheet.playerId}-${sheet.fee}-${sheet.isFinal}`} sheet={sheet} state={state} buyer={buyerName(sheet)} onAnswer={(given) => void answer(sheet, given)} />
          ) : (
            <div className="market-bid-empty">
              <h2 className="t-head">Nenhuma proposta na mesa</h2>
              <p>
                Ponha jogadores à venda ao lado. Caro e lento espera um comprador que pague bem; barato e rápido sai logo. Clubes daqui e da Europa também fazem propostas
                sem você pedir, sempre durante a janela.
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="market-sell-side">
        <ForSale state={state} rows={sales.filter((row) => row.kind === "listing")} onList={onList} />
        <Auctions state={state} rows={sales.filter((row) => row.kind === "auction")} onList={onList} />
      </div>
    </div>
  );
}

function BidCard({ sheet, state, buyer, onAnswer }: { sheet: BidSheet; state: SellState; buyer: string; onAnswer: (answer: BidAnswer) => void }) {
  const [counter, setCounter] = useState(Math.round(sheet.fee * COUNTER_OPENING));
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const buyerClub = sheet.buyerId ? state.clubs[sheet.buyerId] : undefined;
  const premium = sheet.value > 0 ? sheet.fee / sheet.value - 1 : 0;
  const colours = club ? plateColours(club.colours) : null;
  const stripes = club ? { background: `repeating-linear-gradient(180deg, ${club.colours.primary} 0 26px, ${club.colours.secondary} 26px 52px)` } : undefined;
  const strengthDrop = sheet.teamStrength.after - sheet.teamStrength.before;
  return (
    <article className="market-bid-card" aria-label={`Proposta por ${sheet.name}`}>
      <header className="market-bid-head">
        <h2 className="t-title">Proposta por {sheet.name}</h2>
        <span className="market-deadline">
          <i className="ph-bold ph-hourglass-medium" aria-hidden="true" />
          Responder até {formatBarDate(sheet.until).toLowerCase()}
        </span>
      </header>
      <div className="market-bid-body">
        <figure className="stk market-kit" aria-hidden="true">
          <div className="market-kit-shirt" style={stripes}>
            {club && <Crest club={club} size={26} />}
            <span className="market-kit-letter" style={colours ? { color: colours.text } : undefined}>
              {POSITION_LETTER[sheet.group]}
            </span>
            <b className="market-kit-f">{Math.round(sheet.strength)}</b>
          </div>
          <figcaption>
            <b>{sheet.name}</b>
            <span>
              {POSITION_NAMES[sheet.group]} · {sheet.age}
            </span>
          </figcaption>
        </figure>
        <div className="market-bid-facts">
          <p className="market-buyer">
            {buyerClub ? <Crest club={buyerClub} size={30} /> : <i className="ph-fill ph-airplane-takeoff market-abroad" aria-hidden="true" />}
            <b>{buyerClub?.shortName ?? "Clube europeu"}</b>
            <span>{buyerClub?.division ? `Série ${buyerClub.division}` : buyerClub ? "Estadual" : "Europa"} · compra à vista</span>
          </p>
          <p className="market-fee">
            <span className="market-fee-main">{sheet.feeEur !== null ? formatEuros(sheet.feeEur) : formatMoney(sheet.fee)}</span>
            {sheet.feeEur !== null && (
              <span className="market-fee-brl">
                {formatMoney(sheet.fee)}
                <small>câmbio de hoje, R$ {euros.format(state.market.eurBrl)}</small>
              </span>
            )}
          </p>
          <p className={premium >= 0 ? "market-premium up" : "market-premium down"}>
            <i className={premium >= 0 ? "ph-bold ph-trend-up" : "ph-bold ph-trend-down"} aria-hidden="true" />
            {Math.round(Math.abs(premium) * 100)}% {premium >= 0 ? "acima" : "abaixo"} do valor de mercado ({formatMoney(sheet.value)})
          </p>
          <dl className="market-bid-table">
            <dt>Caixa</dt>
            <dd>
              {formatMoney(sheet.cash.before)} <span aria-hidden="true">→</span> <b className="up">{formatMoney(sheet.cash.after)}</b>
            </dd>
            <dt>Força do time</dt>
            <dd>
              {sheet.teamStrength.before.toFixed(1).replace(".", ",")} <span aria-hidden="true">→</span>{" "}
              <b className={strengthDrop < 0 ? "down" : undefined}>{sheet.teamStrength.after.toFixed(1).replace(".", ",")}</b>
            </dd>
            <dt>No time</dt>
            <dd>{sheet.successor ? `${sheet.successor.name}, ${Math.round(sheet.successor.strength)}, vira o titular` : "Era reserva: o time titular não muda"}</dd>
            <dt>Contrato</dt>
            <dd>Até {formatMonthYear(sheet.contractUntil)}</dd>
            <dt>O jogador</dt>
            <dd>
              {sheet.newWage === null
                ? "Quer ir para a Europa."
                : sheet.wantsToGo
                  ? `Quer ir. Salário de ${formatMoney(sheet.newWage)} no ${buyer}.`
                  : `Prefere ficar: o ${buyer} pagaria ${formatMoney(sheet.newWage)}.`}
            </dd>
          </dl>
        </div>
      </div>
      <footer className="market-bid-foot">
        <button className="btn flat" onClick={() => onAnswer({ kind: "decline" })}>
          <i className="ph-bold ph-x" aria-hidden="true" />
          Recusar
        </button>
        <button className="btn" onClick={() => onAnswer({ kind: "accept" })}>
          <i className="ph-bold ph-check" aria-hidden="true" />
          Aceitar {formatMoney(sheet.fee)}
        </button>
        {sheet.isFinal ? (
          <p className="market-final">Última oferta do {buyer}: não aceita contraproposta.</p>
        ) : (
          <span className="market-counter-box">
            <MoneyStepper label="Contraproposta" value={counter} step={roundStep(sheet.fee)} min={sheet.fee} onChange={setCounter} />
            <button className="btn y" onClick={() => onAnswer({ kind: "counter", fee: counter })}>
              <i className="ph-bold ph-arrows-clockwise" aria-hidden="true" />
              Contraproposta
            </button>
          </span>
        )}
      </footer>
    </article>
  );
}

const MODES = [
  { mode: "expensive", label: "Caro e lento" },
  { mode: "cheap", label: "Barato e rápido" },
] as const;

function ForSale({ state, rows, onList }: { state: SellState; rows: SaleRow[]; onList: (playerId: string, way: SaleWay | null) => void }) {
  const coach = state.coachClubId;
  const onMarket = new Set(saleRows(state).map((row) => row.playerId));
  const squad = Object.values(state.players)
    .filter((p) => p.clubId === coach && !onMarket.has(p.id) && !state.market.loans[p.id])
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const [pick, setPick] = useState("");
  const isOpen = isWindowOpen(state, state.date);
  const chosen = squad.find((p) => p.id === pick)?.id ?? "";
  return (
    <section className="stk market-side-card" aria-labelledby="for-sale-title">
      <header className="market-side-head">
        <h2 id="for-sale-title" className="t-head">
          À venda
        </h2>
        <span className="mute">Preço pedido por jogador</span>
      </header>
      {rows.length === 0 && <p className="market-side-empty">Nenhum jogador à venda.</p>}
      <ul className="market-listings" aria-label="Jogadores à venda">
        {rows.map((row) =>
          row.kind === "listing" ? (
            <li key={row.playerId}>
              <div className="market-listing-top">
                <span className={`market-pos ${row.group}`}>{POSITION_LETTER[row.group]}</span>
                <span className="market-listing-who">
                  <b>{row.name}</b> <small>F {Math.round(row.strength)}</small>
                  <span>{row.hasOffer ? "Proposta na mesa" : `${row.age} anos · contrato até ${formatMonthYear(row.contractUntil)}`}</span>
                </span>
                <span className="market-listing-price">
                  <b>{formatMoney(row.price)}</b>
                  <span>valor {formatMoney(row.value)}</span>
                </span>
                <button className="market-x" aria-label={`Tirar ${row.name} da venda`} onClick={() => onList(row.playerId, null)}>
                  <i className="ph-bold ph-x" aria-hidden="true" />
                </button>
              </div>
              <div className="seg market-modes" role="group" aria-label={`Preço de ${row.name}`}>
                {MODES.map(({ mode, label }) => (
                  <button key={mode} className={row.mode === mode ? "on" : undefined} aria-pressed={row.mode === mode} onClick={() => row.mode !== mode && onList(row.playerId, mode)}>
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ) : null,
        )}
      </ul>
      <div className="market-add">
        <Select
          label="Jogador para vender"
          caption={null}
          className="market-add-pick"
          value={chosen}
          options={[{ value: "", label: "Escolha um jogador…" }, ...squad.map((p) => ({ value: p.id, label: `${p.name} · F ${Math.round(p.strength)}` }))]}
          onChange={setPick}
        />
        <button className="btn sm" disabled={!chosen} onClick={() => chosen && onList(chosen, "cheap")}>
          Pôr à venda
        </button>
        <button className="btn sm" disabled={!chosen || !isOpen} title={isOpen ? undefined : "Leilão só com a janela aberta"} onClick={() => chosen && onList(chosen, "auction")}>
          <i className="ph-bold ph-gavel" aria-hidden="true" />
          Leiloar
        </button>
      </div>
    </section>
  );
}

function Auctions({ state, rows, onList }: { state: SellState; rows: SaleRow[]; onList: (playerId: string, way: SaleWay | null) => void }) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => {
        if (row.kind !== "auction") return null;
        const days = daysBetween(state.date, row.closesOn) + 1;
        const [best] = row.bids;
        return (
          <section key={row.playerId} className="stk market-side-card market-auction" aria-label={`Leilão de ${row.name}`}>
            <header className="market-side-head">
              <h2 className="t-head">
                <i className="ph-bold ph-gavel" aria-hidden="true" /> Leilão
              </h2>
              <span className="mute">lance mínimo {formatMoney(row.minBid)}</span>
            </header>
            <div className="market-auction-who">
              <span className={`market-pos ${row.group}`}>{POSITION_LETTER[row.group]}</span>
              <span className="market-listing-who">
                <b>{row.name}</b>
                <span>
                  {POSITION_NAMES[row.group]} · {row.age} · F {Math.round(row.strength)} · salário {formatMoney(row.wage)}
                </span>
              </span>
              <span className="market-auction-clock">
                <b>
                  <i className="ph-bold ph-timer" aria-hidden="true" /> {days === 1 ? "último dia" : `${days} dias`}
                </b>
                <span>fecha {formatDayMonth(row.closesOn)}</span>
              </span>
            </div>
            {row.bids.length === 0 ? (
              <p className="market-side-empty">Nenhum lance ainda.</p>
            ) : (
              <ol className="market-auction-bids" aria-label="Lances">
                {row.bids.map((bid, index) => {
                  const club = state.clubs[bid.clubId];
                  return (
                    <li key={`${bid.clubId}-${bid.fee}`} className={index === 0 ? "top" : undefined}>
                      {club && <Crest club={club} size={20} />}
                      <b>{club?.shortName ?? bid.clubId}</b>
                      <small>{bid.date === state.date ? "hoje" : formatDayMonth(bid.date)}</small>
                      <span>{formatMoney(bid.fee)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {best && (
              <p className="market-auction-if">
                Se fechar agora: <b>{signed(best.fee)}</b> no caixa e <b>{signed(-row.wage)}</b> na folha.
              </p>
            )}
            <button className="btn sm market-auction-stop" onClick={() => onList(row.playerId, null)}>
              <i className="ph-bold ph-x" aria-hidden="true" />
              Tirar do leilão
            </button>
          </section>
        );
      })}
    </>
  );
}
