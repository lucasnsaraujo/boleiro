import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Division } from "../../src/data/players.js";
import type { PositionGroup } from "../../src/engine/match.js";
import type { GameState } from "../../src/sim/gameState.js";
import type { CoachRequest } from "../../src/sim/transfers/coachRequest.js";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { boardSummary } from "../finances/financeSummary.js";
import { formatDayMonth } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { POSITION_NAMES } from "../format/playerLabels.js";
import type { BoardDesk } from "../market/boardDesk.js";
import { BoardRequests } from "../market/BoardRequests.js";
import { requestOptions } from "../market/coachRequests.js";
import { NO_FILTERS, searchMarket, windowStatus, type MarketFilters, type MarketRow, type MarketStatus, type Willingness } from "../market/marketSearch.js";
import { pendingText, requestTitle } from "../market/requestText.js";
import "./market.css";

const MARKET_KEYS = ["date", "coachClubId", "clubs", "players", "market", "finances", "boards"] as const;
type MarketState = Pick<GameState, (typeof MARKET_KEYS)[number]>;

// The list stays short; "Ver mais" adds another page.
const PAGE = 15;
const DESK_ANSWERS = 4;

const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
const POSITION_SHORT: Record<PositionGroup, string> = { GK: "GOL", DEF: "DEF", MID: "MEI", ATT: "ATA" };
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const STATUSES: readonly { value: MarketStatus; label: string }[] = [
  { value: "freeAgent", label: "Sem clube" },
  { value: "contractEnding", label: "Fim de contrato" },
  { value: "lendable", label: "Para empréstimo" },
];
const WILLING: Record<Willingness, string> = { yes: "Quer vir", maybe: "Talvez", no: "Não quer" };

function priceText(row: MarketRow): string {
  if (row.status === "onLoan") return "Emprestado";
  if (row.status === "preContract") return "Já assinou";
  if (row.status === "contractEnding") return "Pré-contrato";
  return row.price ? formatMoney(row.price) : "Sem custo";
}

const asNumber = (value: string): number | null => (value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value));

export function Market() {
  const { engine } = useServices();
  const [state, setState] = useState<MarketState | null>(null);
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<MarketFilters>(NO_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [chosen, setChosen] = useState<MarketRow | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(MARKET_KEYS), engine.desk()]).then(
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

  const found = useMemo(() => (state ? searchMarket(state, filters, limit) : { total: 0, rows: [] }), [state, filters, limit]);
  const clubs = useMemo(
    () =>
      state
        ? Object.values(state.clubs)
            .filter((club) => club.id !== state.coachClubId && club.division !== null && (!filters.division || club.division === filters.division))
            .sort((a, b) => a.shortName.localeCompare(b.shortName, "pt-BR"))
        : [],
    [state, filters.division],
  );

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk) return <p className="status">Abrindo o mercado…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  if (!club) {
    return (
      <>
        <h1 className="screen-title">Mercado</h1>
        <p className="status">Sem clube, sem pedidos à diretoria.</p>
      </>
    );
  }

  const transferWindow = windowStatus(state.date);
  const board = boardSummary(state);

  function filter(patch: Partial<MarketFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE);
  }

  async function ask(request: CoachRequest) {
    setDesk(await engine.ask(request));
  }

  async function withdraw(playerId: string) {
    setDesk(await engine.withdraw(playerId));
  }

  return (
    <div className="market">
      <header className="market-head">
        <div>
          <h1 className="screen-title">Mercado</h1>
          <p className={transferWindow.isOpen ? "market-window open" : "market-window"}>
            {transferWindow.isOpen ? `Janela aberta até ${formatDayMonth(transferWindow.date)}` : `Janela fechada · abre ${formatDayMonth(transferWindow.date)}`}
          </p>
        </div>
        {board && (
          <dl className="market-money">
            <div>
              <dt>Verba</dt>
              <dd>{formatMoney(board.transferBudget)}</dd>
            </div>
            <div>
              <dt>Folga na folha</dt>
              <dd>{formatMoney(Math.max(0, board.wageCap - board.wageBill))}</dd>
            </div>
          </dl>
        )}
      </header>

      <form className="market-filters" role="search" aria-label="Buscar jogadores" onSubmit={(event) => event.preventDefault()}>
        <input type="search" className="mf-name" aria-label="Nome" placeholder="Nome" value={filters.name} onChange={(e) => filter({ name: e.target.value })} />
        <select aria-label="Posição" value={filters.group ?? ""} onChange={(e) => filter({ group: GROUPS.find((g) => g === e.target.value) ?? null })}>
          <option value="">Posição</option>
          {GROUPS.map((group) => (
            <option key={group} value={group}>
              {POSITION_NAMES[group]}
            </option>
          ))}
        </select>
        <span className="mf-range">
          <input type="number" min={1} max={99} aria-label="Força mínima" placeholder="Força" value={filters.minStrength ?? ""} onChange={(e) => filter({ minStrength: asNumber(e.target.value) })} />
          <span aria-hidden="true">–</span>
          <input type="number" min={1} max={99} aria-label="Força máxima" placeholder="máx" value={filters.maxStrength ?? ""} onChange={(e) => filter({ maxStrength: asNumber(e.target.value) })} />
        </span>
        <select aria-label="Divisão" value={filters.division ?? ""} onChange={(e) => filter({ division: DIVISIONS.find((d) => d === e.target.value) ?? null, clubId: null })}>
          <option value="">Divisão</option>
          {DIVISIONS.map((division) => (
            <option key={division} value={division}>
              Série {division}
            </option>
          ))}
        </select>
        <select aria-label="Clube" value={filters.clubId ?? ""} onChange={(e) => filter({ clubId: e.target.value || null })}>
          <option value="">Clube</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shortName}
            </option>
          ))}
        </select>
        <select aria-label="Situação" value={filters.status ?? ""} onChange={(e) => filter({ status: STATUSES.find((s) => s.value === e.target.value)?.value ?? null })}>
          <option value="">Situação</option>
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </form>

      <div className="market-body">
        <section className="market-list">
          {found.rows.length === 0 ? (
            <p className="status">Ninguém com esse perfil.</p>
          ) : (
            <table className="market-table" aria-label="Jogadores">
              <thead>
                <tr>
                  <th scope="col" className="mt-name">
                    Jogador
                  </th>
                  <th scope="col">Pos</th>
                  <th scope="col" className="mt-num">
                    Idade
                  </th>
                  <th scope="col" className="mt-num">
                    Força
                  </th>
                  <th scope="col">Clube</th>
                  <th scope="col" className="mt-num">
                    Preço
                  </th>
                  <th scope="col">Interesse</th>
                </tr>
              </thead>
              <tbody>
                {found.rows.map((row) => {
                  const owner = row.clubId ? state.clubs[row.clubId] : undefined;
                  return (
                    <tr key={row.id} className={chosen?.id === row.id ? "mt-row on" : "mt-row"}>
                      <td className="mt-name">
                        <button aria-pressed={chosen?.id === row.id} onClick={() => setChosen(row)}>
                          {row.name}
                        </button>
                      </td>
                      <td>{POSITION_SHORT[row.group]}</td>
                      <td className="mt-num">{row.age}</td>
                      <td className="mt-num mt-strength">{Math.round(row.strength)}</td>
                      <td>{owner ? <ClubPlate club={owner} size="row" /> : <span className="mt-free">Sem clube</span>}</td>
                      <td className="mt-num">{priceText(row)}</td>
                      <td className={`mt-willing ${row.willing}`}>{WILLING[row.willing]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="market-count">
            {found.rows.length} de {found.total.toLocaleString("pt-BR")} jogadores
            {found.total > found.rows.length && (
              <button className="btn-quiet" onClick={() => setLimit(limit + PAGE)}>
                Ver mais
              </button>
            )}
          </p>
        </section>

        <aside className="market-side">
          {chosen ? (
            <Chosen row={chosen} state={state} desk={desk} onAsk={(request) => void ask(request)} onWithdraw={(id) => void withdraw(id)} />
          ) : (
            <p className="market-pick">Escolha um jogador na lista.</p>
          )}
          <h2 className="market-side-title">Pedidos à diretoria</h2>
          <BoardRequests desk={desk} state={state} answers={DESK_ANSWERS} onWithdraw={(id) => void withdraw(id)} />
        </aside>
      </div>
    </div>
  );
}

type ChosenProps = { row: MarketRow; state: MarketState; desk: BoardDesk; onAsk: (request: CoachRequest) => void; onWithdraw: (playerId: string) => void };

function Chosen({ row, state, desk, onAsk, onWithdraw }: ChosenProps) {
  const owner = row.clubId ? state.clubs[row.clubId] : undefined;
  const options = requestOptions(state, row.id);
  const pending = desk.pending.find((request) => request.playerId === row.id);
  return (
    <section className="chosen" aria-label={row.name}>
      <div className="chosen-top">
        <p className="chosen-strength" aria-label={`Força ${Math.round(row.strength)}`}>
          {Math.round(row.strength)}
        </p>
        <div className="chosen-who">
          <h2 className="chosen-name">{row.name}</h2>
          <p className="chosen-sub">
            {POSITION_NAMES[row.group]} · {row.age} anos
          </p>
        </div>
      </div>
      <p className="chosen-club">{owner ? <ClubPlate club={owner} size="row" /> : <span className="mt-free">Sem clube</span>}</p>
      <dl className="chosen-facts">
        <div>
          <dt>Preço</dt>
          <dd>{priceText(row)}</dd>
        </div>
        <div>
          <dt>Salário pedido</dt>
          <dd>{formatMoney(row.wage)} por mês</dd>
        </div>
        <div>
          <dt>Interesse</dt>
          <dd className={`mt-willing ${row.willing}`}>{WILLING[row.willing]}</dd>
        </div>
      </dl>
      {pending ? (
        <p className="chosen-pending">
          {requestTitle(pending, row.name)} na mesa. {pendingText(state, pending)}{" "}
          <button className="btn-quiet" onClick={() => onWithdraw(row.id)}>
            Retirar
          </button>
        </p>
      ) : options.length > 0 ? (
        <div className="chosen-actions">
          {options.map((option, index) => (
            <button key={option.label} className={index === 0 ? "btn-main" : "btn-quiet"} onClick={() => onAsk(option.request)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="chosen-pending">{row.status === "onLoan" ? "Está emprestado; não dá para negociar agora." : "Já assinou com outro clube."}</p>
      )}
      {row.clubId && (
        <Link className="btn-quiet chosen-card" to={`/squad/${row.id}`}>
          Ver ficha
        </Link>
      )}
    </section>
  );
}
