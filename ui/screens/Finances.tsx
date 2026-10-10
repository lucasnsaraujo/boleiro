import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { boardSummary, closingStatement, type ClosingStatement, type StatementLine } from "../finances/financeSummary.js";
import { useCountUp } from "../finances/useCountUp.js";
import { formatDayMonth } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import type { BoardDesk } from "../market/boardDesk.js";
import { BoardRequests } from "../market/BoardRequests.js";
import "./finances.css";

const FINANCE_KEYS = ["date", "coachClubId", "clubs", "finances", "boards", "players", "market"] as const;
type FinanceState = Pick<GameState, (typeof FINANCE_KEYS)[number]>;

const DESK_ANSWERS = 3;

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(FINANCE_KEYS), engine.desk()]).then(
      ([read, onDesk]) => {
        if (!current) return;
        setState(read);
        setDesk(onDesk);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const clubId = state?.coachClubId ?? null;
  const closing = clubId ? (state?.finances[clubId]?.lastClosing ?? null) : null;
  const closingKey = closing && clubId ? `${clubId}:${closing.month}` : null;
  const board = state ? boardSummary(state) : null;
  // The cash counts up the first time the screen shows a new closing.
  const cash = useCountUp(board?.cash ?? 0, closingKey);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk) return <p className="status">Abrindo as finanças…</p>;
  const club = clubId ? state.clubs[clubId] : undefined;
  if (!club || !board) {
    return (
      <>
        <h1 className="screen-title">Finanças</h1>
        <p className="status">Sem clube, sem diretoria.</p>
      </>
    );
  }

  const statement = closing && closingStatement(closing);

  return (
    <div className="finances">
      <section className="fin-band" aria-label="Caixa">
        <div className="fin-cash">
          <p className="fin-cash-label">Caixa do {club.shortName}</p>
          <p className="fin-cash-n">{formatMoney(cash)}</p>
        </div>
        <dl className="fin-board">
          <div>
            <dt>Verba para contratar</dt>
            <dd>{formatMoney(board.transferBudget)}</dd>
          </div>
          <div>
            <dt>Folha por mês</dt>
            <dd>
              {formatMoney(board.wageBill)} <small>de {formatMoney(board.wageCap)}</small>
            </dd>
          </div>
          {board.goal && (
            <div>
              <dt>Meta</dt>
              <dd>{board.goal}</dd>
            </div>
          )}
          <div>
            <dt>Diretoria</dt>
            <dd>{board.mood}</dd>
          </div>
        </dl>
      </section>

      {(board.lateWages || desk.forcedSales.length > 0) && (
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
              {sale.buyerId ? ` ao ${state.clubs[sale.buyerId]?.shortName ?? sale.buyerId}` : " ao exterior"}.
            </li>
          ))}
        </ul>
      )}

      <div className="fin-body">
        {statement ? <Statement statement={statement} /> : <p className="status">O primeiro fechamento sai em {formatDayMonth(nextClosing(state.date))}.</p>}
        <section className="fin-desk" aria-labelledby="desk-title">
          <h2 id="desk-title" className="fin-title">
            Pedidos à diretoria
          </h2>
          <BoardRequests desk={desk} state={state} answers={DESK_ANSWERS} onWithdraw={(playerId) => void engine.withdraw(playerId).then(setDesk)} />
          <Link to="/market" className="btn-main fin-market">
            Ir ao mercado
          </Link>
        </section>
      </div>
    </div>
  );
}

function Lines({ title, lines, total }: { title: string; lines: readonly StatementLine[]; total: number }) {
  return (
    <div className="fin-col">
      <h3 className="fin-col-title">{title}</h3>
      <dl>
        {lines.map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{formatMoney(line.amount)}</dd>
          </div>
        ))}
        <div className="fin-total">
          <dt>Total</dt>
          <dd>{formatMoney(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Statement({ statement }: { statement: ClosingStatement }) {
  const title = `Fechamento de ${statement.month}`;
  return (
    <section className="fin-statement" aria-label={title}>
      <h2 className="fin-title">{title}</h2>
      <div className="fin-cols">
        <Lines title="Receitas" lines={statement.revenue} total={statement.totalRevenue} />
        <Lines title="Despesas" lines={statement.costs} total={statement.totalCosts} />
      </div>
      <p className={statement.net >= 0 ? "fin-net good" : "fin-net bad"}>
        <span>{statement.net >= 0 ? "Lucro" : "Prejuízo"}</span>
        <strong>{formatMoney(Math.abs(statement.net))}</strong>
        <small>Caixa no fechamento: {formatMoney(statement.cash)}</small>
      </p>
    </section>
  );
}
