import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { BidAnswer } from "@boleiro/engine/sim/transfers/answerBid";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import type { SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { AssistantPage } from "@boleiro/game-client/assistant/assistantPage";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import type { MarketFilters } from "@boleiro/game-client/market/marketFilters";
import type { Scouting } from "@boleiro/game-client/market/scouting";
import { useServices } from "../app/ServicesContext.js";
import { signingSuggestions } from "../assistant/signingSuggestions.js";
import { boardSummary } from "../finances/financeSummary.js";
import { bidSheets } from "../market/bidSheets.js";
import { BuyView, MARKET_KEYS } from "../market/BuyView.js";
import { windowStatus } from "../market/marketSearch.js";
import { SellView } from "../market/SellView.js";
import "./market.css";

type Tab = "busca" | "propostas";
const TAB_PARAM = "aba";
// The player the screen opens on, sent from the assistant's suggestions.
const FOCUS_PARAM = "jogador";
const KEYS = [...MARKET_KEYS, "seed", "season"] as const;

/** Busca: the coach's market, buying on one tab and the offers for his own players on the other. */
export function Market() {
  const { engine } = useServices();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get(TAB_PARAM) === "propostas" ? "propostas" : "busca";
  const [state, setState] = useState<Pick<GameState, (typeof KEYS)[number]> | null>(null);
  const [advice, setAdvice] = useState<AssistantPage | null>(null);
  const focusId = params.get(FOCUS_PARAM);
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [scouting, setScouting] = useState<Scouting | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasActionFailed, setActionFailed] = useState(false);
  const [isOutOfTime, setOutOfTime] = useState(false);

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      Promise.all([engine.read(KEYS), engine.desk(), engine.marketClock(), engine.scouting(), engine.assistant()]).then(
        ([read, onDesk, clock, scouted, assistantPage]) => {
          if (!isCurrent()) return;
          setState(read);
          setAdvice(assistantPage);
          setDesk(onDesk);
          setScouting(scouted);
          setOutOfTime(clock?.leftSeconds === 0);
        },
        () => isCurrent() && setFailed(true),
      ),
    [engine],
  );

  // The assistant's suggestions for his weak-position tip, as his own screen lists them.
  const suggested = useMemo(
    () => (state && advice?.tip && scouting ? signingSuggestions(state, advice.assistant, advice.tip, new Set(scouting.watchList)).rows : []),
    [state, advice, scouting],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk || !scouting) return <p className="status">Abrindo o mercado…</p>;

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
  // Scouting changes nothing in the game, so the screen takes the session's answer instead of reading the market again.
  const scout = (run: () => Promise<Scouting>) => void run().then(setScouting, () => setActionFailed(true));
  const watch = (playerId: string, isWatched: boolean) => scout(() => engine.apply({ type: "watchPlayer", playerId, isWatched }));
  const saveFilter = (name: string, filters: MarketFilters) => scout(() => engine.apply({ type: "saveFilter", name, filters }));
  const deleteFilter = (name: string) => scout(() => engine.apply({ type: "deleteFilter", name }));
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
        <BuyView
          state={state}
          desk={desk}
          tabs={tabs}
          windowLine={windowLine}
          onAsk={ask}
          onWithdraw={withdraw}
          onDeclineCounter={declineCounter}
          scouting={scouting}
          onWatch={watch}
          onSaveFilter={saveFilter}
          onDeleteFilter={deleteFilter}
          focusId={focusId}
          suggested={suggested}
        />
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
