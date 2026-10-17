import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { addLedgers } from "@boleiro/engine/sim/finances/ledger";
import type { CostLine, GameState, RevenueLine } from "@boleiro/engine/sim/gameState";
import { formatDayMonth, monthName } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import type { SponsorsPage } from "@boleiro/game-client/sponsors/sponsorsPage";
import { useServices } from "../app/ServicesContext.js";
import { BankLoanCard } from "../finances/BankLoanCard.js";
import { ConfidenceMeter } from "../finances/ConfidenceMeter.js";
import { boardSummary, closingStatement, statementOf, type BoardSummary, type Statement, type StatementLine } from "../finances/financeSummary.js";
import { FriendliesCard } from "../finances/FriendliesCard.js";
import { useCountUp } from "../finances/useCountUp.js";
import { clubMeters } from "../hub/hubSelectors.js";
import { BoardRequests } from "../market/BoardRequests.js";
import { BrandLogo } from "../sponsors/BrandLogo.js";
import "./finances.css";
import { clubArticle, withArticle } from "@boleiro/data/articles";

const FINANCE_KEYS = [
  "date", "season", "seed", "coachClubId", "clubs", "finances", "boards", "players", "market", "mood", "fixtures", "competitions", "friendlies", "hasMidSeasonWindow", "coach",
] as const;
type FinanceState = Pick<GameState, (typeof FINANCE_KEYS)[number]>;

const DESK_ANSWERS = 3;

type Period = "closing" | "month" | "season";

const ICONS: Record<RevenueLine | CostLine, string> = {
  tickets: "ticket",
  tv: "television-simple",
  membership: "identification-card",
  sponsorship: "handshake",
  otherIncome: "coins",
  prizes: "trophy",
  playerSales: "swap",
  friendlies: "soccer-ball",
  wages: "users-three",
  transferFees: "swap",
  signingFees: "signature",
  agentFees: "briefcase",
  infrastructure: "buildings",
  interest: "bank",
  fines: "gavel",
  bonuses: "medal",
};

const SUPPORTERS_NOTE: Record<GameState["mood"][string]["supporters"], string> = {
  calm: "A organizada está tranquila.",
  pressure: "A organizada cobra o time.",
  protest: "A organizada protesta no CT.",
  violence: "A organizada está em pé de guerra.",
};

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The first day of next month, when the month closes. */
function nextClosing(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function Finances() {
  const { engine } = useServices();
  const [state, setState] = useState<FinanceState | null>(null);
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [sponsors, setSponsors] = useState<SponsorsPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => engine.read(FINANCE_KEYS).then(setState), [engine]);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(FINANCE_KEYS), engine.desk(), engine.sponsors()]).then(
      ([read, onDesk, onKit]) => {
        if (!current) return;
        setState(read);
        setDesk(onDesk);
        setSponsors(onKit);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const clubId = state?.coachClubId ?? null;
  const finance = clubId ? state?.finances[clubId] : undefined;
  const closing = finance?.lastClosing ?? null;
  const closingKey = closing && clubId ? `${clubId}:${closing.month}` : null;
  const board = state ? boardSummary(state) : null;
  // The cash counts up the first time the screen shows a new closing.
  const cash = useCountUp(board?.cash ?? 0, closingKey);

  /** Runs a command against the game and reads it again; a refusal (during a round, say) shows instead. */
  async function run<T>(command: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const result = await command();
      await reload();
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk) return <p className="status">Abrindo as finanças…</p>;
  const club = clubId ? state.clubs[clubId] : undefined;
  if (!club || !board || !finance || !clubId) {
    return (
      <>
        <h1 className="screen-title">Finanças</h1>
        <p className="status">Sem clube, sem diretoria.</p>
      </>
    );
  }

  const shown: Period = period ?? (closing ? "closing" : "month");
  const thisMonth = capitalised(monthName(Number(state.date.slice(5, 7))));
  const periods: { id: Period; label: string; title: string }[] = [
    ...(closing ? [{ id: "closing" as const, label: capitalised(monthName(Number(closing.month.slice(5, 7)))), title: `Fechamento de ${closingStatement(closing).month}` }] : []),
    { id: "month", label: thisMonth, title: `${thisMonth} até hoje` },
    { id: "season", label: `Temporada ${state.season}`, title: `Temporada ${state.season}` },
  ];
  const statement: Statement =
    shown === "closing" && closing ? closingStatement(closing) : shown === "season" ? statementOf(addLedgers(finance.season, finance.month)) : statementOf(finance.month);
  const title = periods.find((p) => p.id === shown)?.title ?? "";
  const meters = clubMeters(state, clubId);

  return (
    <div className="finances">
      <div className="page fin">
        <div className="fin-hd">
          <h1>Finanças</h1>
          <div className="seg" role="tablist" aria-label="Período">
            {periods.map((p) => (
              <button key={p.id} role="tab" aria-selected={p.id === shown} className={p.id === shown ? "on" : undefined} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <section className="fin-statement" aria-label={title}>
          <div className="fin-cash">
            <div className="fin-big">
              <span>Caixa {withArticle(club.shortName, clubArticle(club.id), "de")}</span>
              <b>{formatMoney(cash)}</b>
            </div>
            <div className="fin-k">
              <span>{statement.net >= 0 ? "Lucro" : "Prejuízo"}</span>
              <b className={statement.net >= 0 ? "up" : "dn"}>
                {statement.net >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(statement.net))}
              </b>
            </div>
            <div className="fin-k">
              <span>Folha mensal</span>
              <b>{formatMoney(board.wageBill)}</b>
            </div>
            <div className="fin-k">
              <span>Dívida</span>
              <b>{formatMoney(board.debt)}</b>
            </div>
          </div>

          <Alerts board={board} desk={desk} state={state} />

          <div className="fin-flow">
            <Column title="Entrou" total={statement.totalRevenue} lines={statement.revenue} scale={Math.max(1, ...statement.revenue.map((l) => l.amount), ...statement.costs.map((l) => l.amount))} tone="up" />
            <Column title="Saiu" total={statement.totalCosts} lines={statement.costs} scale={Math.max(1, ...statement.revenue.map((l) => l.amount), ...statement.costs.map((l) => l.amount))} tone="dn" />
          </div>
          {!closing && <p className="fin-first">O primeiro fechamento sai em {formatDayMonth(nextClosing(state.date))}.</p>}
        </section>

        <div className="fin-foot">
          <div className="fin-budget">
            <span className="lbl">Verba para contratar</span>
            <b>{formatMoney(board.transferBudget)}</b>
            <small>teto da folha {formatMoney(board.wageCap)}</small>
            <Link to="/market" className="btn sm fin-market">
              Ir ao mercado
            </Link>
          </div>
          {sponsors && <SponsorsCard page={sponsors} />}
          <section className="fin-desk" aria-labelledby="desk-title">
            <h2 id="desk-title" className="lbl">
              Pedidos à diretoria
            </h2>
            <BoardRequests desk={desk} state={state} answers={DESK_ANSWERS} onWithdraw={(playerId) => void engine.apply({ type: "withdraw", playerId }).then(setDesk)} />
          </section>
        </div>
      </div>

      <aside className="fin-side">
        <section className="stk fin-conf" aria-label="Confiança">
          <ConfidenceMeter label="Diretoria" value={meters.board} detail={board.mood} note={board.goal ? <>Meta: <b>{board.goal}</b>. Resultados e torcida pesam.</> : "Resultados e torcida pesam."} />
          <ConfidenceMeter label="Torcida" value={meters.fans} note={SUPPORTERS_NOTE[state.mood[clubId]?.supporters ?? "calm"]} />
          <Demands state={state} clubId={clubId} board={board} />
        </section>
        <section className="stk fin-offers" aria-labelledby="offers-title">
          <h2 id="offers-title">Propostas</h2>
          <FriendliesCard state={state} isBusy={isBusy} onBook={(opponentId, date, isHome) => run(() => engine.apply({ type: "bookFriendly", opponentId, date, isHome }))} />
          <BankLoanCard
            key={finance.bankLoan ? "loan" : "offer"}
            finance={finance}
            isBusy={isBusy}
            onTake={(amount, months) => run(() => engine.apply({ type: "takeBankLoan", amount, months }))}
            onRepay={async () => void (await run(() => engine.apply({ type: "repayBankLoan" })))}
          />
          {error && (
            <p className="fin-refusal" role="alert">
              {error}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

// The footer lists the kit's biggest deals by logo; the rest are counted.
const SPONSOR_CHIPS = 4;

/** The kit's deals on the finances screen: each brand's logo and yearly value, the biggest first, and their total. */
function SponsorsCard({ page }: { page: SponsorsPage }) {
  const deals = page.contracts.toSorted((a, b) => b.yearly - a.yearly);
  const rest = deals.slice(SPONSOR_CHIPS);
  return (
    <section className="fin-spon" aria-labelledby="fin-spon-title">
      <h2 id="fin-spon-title" className="lbl">
        <Link to="/sponsors">Patrocínio</Link>
      </h2>
      <b>
        {formatMoney(page.total)}
        <small> por ano na camisa</small>
      </b>
      <ul aria-label="Na camisa">
        {deals.slice(0, SPONSOR_CHIPS).map((deal) => (
          <li key={`${deal.slot}:${deal.brandId}`} aria-label={`${deal.brandName}: ${formatMoney(deal.yearly)} por ano`}>
            <span className="fin-spon-mk">
              <BrandLogo brandId={deal.brandId} name={deal.brandName} height={13} maxWidth={56} />
            </span>
            <span>{formatMoney(deal.yearly)}</span>
          </li>
        ))}
        {rest.length > 0 && (
          <li className="fin-spon-rest" aria-label={`Mais ${rest.length}: ${formatMoney(rest.reduce((sum, d) => sum + d.yearly, 0))} por ano`}>
            <span className="fin-spon-mk">+{rest.length}</span>
            <span>{formatMoney(rest.reduce((sum, d) => sum + d.yearly, 0))}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function Column({ title, total, lines, scale, tone }: { title: string; total: number; lines: readonly StatementLine[]; scale: number; tone: "up" | "dn" }) {
  return (
    <div className={`fin-col ${tone}`}>
      <h3>
        {title}
        <b className={tone}>{formatMoney(total)}</b>
      </h3>
      {lines.length === 0 ? (
        <p className="fin-none">Nada ainda.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={line.line} className="fin-it">
              <i className={`ph-bold ph-${ICONS[line.line]} ic`} aria-hidden="true" />
              <b>{line.label}</b>
              <span className="v">{formatMoney(line.amount)}</span>
              <span className="fb" aria-hidden="true">
                <i style={{ width: `${Math.round((100 * line.amount) / scale)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Alerts({ board, desk, state }: { board: BoardSummary; desk: BoardDesk; state: FinanceState }) {
  if (!board.lateWages && desk.forcedSales.length === 0) return null;
  return (
    <ul className="fin-alerts" aria-label="Avisos">
      {board.lateWages && (
        <li>
          Salários atrasados: {formatMoney(board.lateWages.owed)} em aberto
          {board.lateWages.months > 1 ? ` há ${board.lateWages.months} meses` : ""}. No segundo mês a diretoria vende um jogador.
        </li>
      )}
      {desk.forcedSales.toReversed().map((sale, index) => (
        <li key={`${sale.date}-${index}`}>
          {formatDayMonth(sale.date)}: a diretoria vendeu {sale.name} por {formatMoney(sale.fee)}
          {sale.buyerId ? ` ${withArticle(state.clubs[sale.buyerId]?.shortName ?? sale.buyerId, clubArticle(sale.buyerId), "a")}` : " ao exterior"}.
        </li>
      ))}
    </ul>
  );
}

/** What the board asks of the coach this season and how far he is: the table target and the wage cap. */
function Demands({ state, clubId, board }: { state: FinanceState; clubId: string; board: BoardSummary }) {
  const target = state.boards[clubId];
  const isUnderCap = board.wageBill <= board.wageCap;
  return (
    <div className="fin-obj">
      <span className="lbl">A diretoria cobra</span>
      {target && board.goal && (
        <div className={target.games > 0 && target.position <= target.targetPosition ? "ok" : undefined}>
          <i className={target.games > 0 && target.position <= target.targetPosition ? "ph-fill ph-check-circle" : "ph-bold ph-circle-dashed"} aria-hidden="true" />
          {capitalised(board.goal)}
          <span>{target.games > 0 ? `${target.position}º agora` : "liga não começou"}</span>
        </div>
      )}
      <div className={isUnderCap ? "ok" : undefined}>
        <i className={isUnderCap ? "ph-fill ph-check-circle" : "ph-bold ph-circle-dashed"} aria-hidden="true" />
        Folha até {formatMoney(board.wageCap)}
        <span>{formatMoney(board.wageBill)}</span>
      </div>
    </div>
  );
}
