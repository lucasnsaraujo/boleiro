import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { BidAnswer } from "@boleiro/engine/sim/transfers/answerBid";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import type { SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import { useServices } from "../app/ServicesContext.js";
import { boardSummary } from "../finances/financeSummary.js";
import { bidSheets } from "../market/bidSheets.js";
import { BuyView, MARKET_KEYS, type MarketState } from "../market/BuyView.js";
import { windowStatus } from "../market/marketSearch.js";
import { SellView } from "../market/SellView.js";
import "./market.css";

type Tab = "busca" | "propostas";
const TAB_PARAM = "aba";

/** Busca: the coach's market, buying on one tab and the offers for his own players on the other. */
export function Market() {
  const { engine } = useServices();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get(TAB_PARAM) === "propostas" ? "propostas" : "busca";
  const [state, setState] = useState<MarketState | null>(null);
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasActionFailed, setActionFailed] = useState(false);
  const [isOutOfTime, setOutOfTime] = useState(false);

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      Promise.all([engine.read(MARKET_KEYS), engine.desk(), engine.marketClock()]).then(
        ([read, onDesk, clock]) => {
          if (!isCurrent()) return;
          setState(read);
          setDesk(onDesk);
          setOutOfTime(clock?.leftSeconds === 0);
        },
        () => isCurrent() && setFailed(true),
      ),
    [engine],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk) return <p className="status">Abrindo o mercado…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  if (!club) {
    return (
      <>
        <h1 className="screen-title">Mercado</h1>
        <p className="status">Sem clube, sem mercado.</p>
      </>
    );
  }

  async function act<T>(run: () => Promise<T>): Promise<T> {
    setActionFailed(false);
    try {
      const result = await run();
      await load();
      return result;
    } catch (error) {
      setActionFailed(true);
      throw error;
    }
  }

  const ask = (request: CoachRequest) => {
    // The clock may run out while the coach looks; the session refuses the signing, so the screen reads it again.
    void act(() => engine.apply({ type: "ask", request })).catch(() => void load());
  };
  const withdraw = (playerId: string) => void act(() => engine.apply({ type: "withdraw", playerId })).catch(() => undefined);
  const declineCounter = (playerId: string) => void act(() => engine.apply({ type: "declineCounter", playerId })).catch(() => undefined);
  const list = (playerId: string, way: SaleWay | null) => void act(() => engine.apply({ type: "listPlayer", playerId, way })).catch(() => undefined);
  const answer = (playerId: string, given: BidAnswer) => act(() => engine.apply({ type: "answerBid", playerId, answer: given }));

  const transferWindow = windowStatus(state.date, state);
  const board = boardSummary(state);
  const offers = bidSheets(state).length;
  const show = (next: Tab) => setParams(next === "busca" ? {} : { [TAB_PARAM]: next }, { replace: true });

  const tabs = (
    <div className="market-tabs" role="tablist" aria-label="Mercado">
      <button role="tab" aria-selected={tab === "busca"} className="market-tab" onClick={() => show("busca")}>
        Buscar
      </button>
      <button role="tab" aria-selected={tab === "propostas"} className="market-tab" onClick={() => show("propostas")}>
        Propostas
        {offers > 0 && <span className="market-tab-n">{offers}</span>}
      </button>
    </div>
  );
  const windowLine = (
    <p className="market-window-line">
      <span className={transferWindow.isOpen ? "market-window open" : "market-window"}>
        {transferWindow.isOpen
          ? `${transferWindow.isOwn ? "Sua janela" : "Janela"} aberta até ${formatDayMonth(transferWindow.date)}`
          : `Janela fechada · abre ${formatDayMonth(transferWindow.date)}`}
      </span>
      {isOutOfTime && (
        <span className="market-out-of-time">
          <i className="ph-bold ph-timer" aria-hidden="true" />
          Seu tempo de mercado acabou: contratações só na próxima janela
        </span>
      )}
      {board && (
        <span className="market-budget">
          Verba <b>{formatMoney(board.transferBudget)}</b>
        </span>
      )}
    </p>
  );

  return (
    <div className="market fills-screen">
      {tab === "busca" ? (
        <BuyView state={state} desk={desk} tabs={tabs} windowLine={windowLine} onAsk={ask} onWithdraw={withdraw} onDeclineCounter={declineCounter} />
      ) : (
        <SellView state={state} tabs={tabs} onAnswer={answer} onList={list} />
      )}
      {hasActionFailed && (
        <p className="toast" role="alert">
          {isOutOfTime ? "Seu tempo de mercado acabou nesta janela." : "O pedido não chegou. Tente de novo."}
        </p>
      )}
    </div>
  );
}
