import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { coachMarketOf } from "@boleiro/engine/sim/transfers/coachMarket";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { SQUAD_CAP, isSquadFull } from "@boleiro/engine/sim/transfers/squadCap";
import { formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import { clauseRequest, requestOptions } from "@boleiro/game-client/market/coachRequests";
import { signingTerms } from "@boleiro/game-client/market/contracts";
import { formatContractLength } from "@boleiro/game-client/format/formatContractLength";
import { assistantPick, contractEndAfter, type ContractTerm } from "@boleiro/engine/sim/transfers/contractTerms";
import { STANCE_LABELS } from "../contracts/renewalText.js";
import type { Scouting } from "@boleiro/game-client/market/scouting";
import { RangeSlider } from "../controls/RangeSlider.js";
import { Select } from "../controls/Select.js";
import { WatchToggle } from "../controls/WatchToggle.js";
import { Crest } from "../clubs/Crest.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { POSITION_GROUP_NAMES, POSITION_NAMES } from "../format/playerLabels.js";
import { BoardRequests } from "./BoardRequests.js";
import { NO_FILTERS, type MarketFilters, type MarketStatus } from "@boleiro/game-client/market/marketFilters";
import { marketClubs, marketLeagues, marketNationalities, searchMarket, strengthBounds, type MarketRow, type Willingness } from "./marketSearch.js";
import { MoneyStepper, roundStep } from "./MoneyStepper.js";
import { offerAdvice } from "./offerAdvice.js";
import { pendingText, requestTitle } from "./requestText.js";

export const MARKET_KEYS = ["date", "coachClubId", "clubs", "players", "market", "finances", "boards", "history", "hasMidSeasonWindow", "coach"] as const;
export type MarketState = Pick<GameState, (typeof MARKET_KEYS)[number]>;

// guess: with no length he takes, a signing offers the club's usual two years.
const DEFAULT_SIGNING_MONTHS = 24;
// The list stays short; "Ver mais" adds another page.
const PAGE = 40;
const DESK_ANSWERS = 3;

const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
const POSITION_SHORT: Record<PositionGroup, string> = { GK: "GOL", DEF: "DEF", MID: "MEI", ATT: "ATA" };
// The season's goals and minutes the coach can ask for at least: a scorer, a regular, a starter.
const MIN_GOALS = [1, 3, 5, 10, 15] as const;
const MIN_MINUTES = [90, 450, 900, 1800] as const;
const STATUSES: readonly { value: MarketStatus; label: string }[] = [
  { value: "freeAgent", label: "Sem clube" },
  { value: "contractEnding", label: "Fim de contrato" },
  { value: "lendable", label: "Para empréstimo" },
  { value: "lentOut", label: "Emprestados por você" },
];
const NO_SAVED = "";
const WILLING: Record<Willingness, string> = { yes: "Toparia vir", maybe: "Talvez venha", no: "Não quer vir" };
// guess: young is 23 or under, old 33 or over, as the approved mock colours ages.
const YOUNG_AGE = 23;
const OLD_AGE = 33;

function situation(row: MarketRow): ReactNode {
  switch (row.status) {
    case "freeAgent":
      return <span className="market-st free">Livre</span>;
    case "contractEnding":
      return <span className="market-st pre">Fim de contrato</span>;
    case "preContract":
      return <span className="market-st quiet">Pré-contrato assinado</span>;
    case "onLoan":
      return <span className="market-st quiet">Emprestado</span>;
    case "lentOut":
      return <span className="market-st quiet">Emprestado por você</span>;
    case "lendable":
      return <span className="market-st sale">Para empréstimo</span>;
    default:
      return <span className="market-st quiet">Sob contrato</span>;
  }
}

function priceText(row: MarketRow): string {
  if (row.price === null) return "—";
  return row.price ? formatMoney(row.price) : "Sem custo";
}

type Props = {
  state: MarketState;
  desk: BoardDesk;
  /** The "Buscar · Propostas" tabs, set where the mock puts them: over the results. */
  tabs: ReactNode;
  windowLine: ReactNode;
  onAsk: (request: CoachRequest) => void;
  onWithdraw: (playerId: string) => void;
  onDeclineCounter: (playerId: string) => void;
  /** The coach's watch list and saved searches. */
  scouting: Scouting;
  onWatch: (playerId: string, isWatched: boolean) => void;
  onSaveFilter: (name: string, filters: MarketFilters) => void;
  onDeleteFilter: (name: string) => void;
};

/** Busca: other clubs' players and free agents, and the offer the coach makes for the one he picks. */
export function BuyView({ state, desk, tabs, windowLine, onAsk, onWithdraw, onDeclineCounter, scouting, onWatch, onSaveFilter, onDeleteFilter }: Props) {
  const [filters, setFilters] = useState<MarketFilters>(NO_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState(NO_SAVED);
  const [naming, setNaming] = useState<string | null>(null);

  const watched = useMemo(() => new Set(scouting.watchList), [scouting.watchList]);
  const found = useMemo(() => searchMarket(state, filters, limit, watched), [state, filters, limit, watched]);
  const bounds = useMemo(() => strengthBounds(state), [state]);
  const leagues = useMemo(() => marketLeagues(state), [state]);
  const clubs = useMemo(() => marketClubs(state, filters.division), [state, filters.division]);
  const nationalities = useMemo(() => marketNationalities(state), [state]);
  const squadSize = useMemo(() => Object.values(state.players).filter((p) => p.clubId === state.coachClubId).length, [state]);
  const chosen = found.rows.find((row) => row.id === chosenId) ?? found.rows[0] ?? null;

  function filter(patch: Partial<MarketFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE);
    setSavedName(NO_SAVED);
  }

  function runSaved(name: string) {
    const saved = scouting.savedFilters.find((entry) => entry.name === name);
    setFilters(saved?.filters ?? NO_FILTERS);
    setLimit(PAGE);
    setSavedName(saved ? name : NO_SAVED);
  }

  function keepSearch() {
    const name = naming?.trim() ?? "";
    if (!name) return;
    onSaveFilter(name, filters);
    setSavedName(name);
    setNaming(null);
  }

  const isFull = isSquadFull(squadSize);
  return (
    <div className="market-buy">
      <div className="market-left">
        <form className="market-search" role="search" aria-label="Buscar jogadores" onSubmit={(event) => event.preventDefault()}>
          <label className="field market-q">
            <i className="ph-bold ph-magnifying-glass" aria-hidden="true" />
            <input type="search" aria-label="Nome" placeholder="Nome do jogador" value={filters.name} onChange={(e) => filter({ name: e.target.value })} />
            <span className="market-q-count">{found.total.toLocaleString("pt-BR")} jogadores</span>
          </label>
          <span className={isFull ? "market-cap full" : "market-cap"} aria-label={`Elenco ${squadSize} de ${SQUAD_CAP}`}>
            <i className="ph-bold ph-users-three" aria-hidden="true" />
            Elenco <b>{squadSize}/{SQUAD_CAP}</b>
          </span>
        </form>
        <div className="market-filters">
          <Select
            label="Posição"
            value={filters.group ?? ""}
            options={[{ value: "", label: "Todas" }, ...GROUPS.map((group) => ({ value: group, label: POSITION_NAMES[group] }))]}
            onChange={(value) => filter({ group: GROUPS.find((g) => g === value) ?? null })}
          />
          <RangeSlider
            label="Força"
            min={bounds.min}
            max={bounds.max}
            value={[filters.minStrength ?? bounds.min, filters.maxStrength ?? bounds.max]}
            onChange={([low, high]) => filter({ minStrength: low > bounds.min ? low : null, maxStrength: high < bounds.max ? high : null })}
          />
          <Select
            label="Liga"
            value={filters.division ?? ""}
            options={[{ value: "", label: "Todas" }, ...leagues]}
            onChange={(value) => filter({ division: leagues.find((league) => league.value === value)?.value ?? null, clubId: null })}
          />
          <Select label="Clube" value={filters.clubId ?? ""} options={[{ value: "", label: "Todos" }, ...clubs]} onChange={(value) => filter({ clubId: value || null })} />
          <Select
            label="Nacionalidade"
            value={filters.nationality ?? ""}
            options={[{ value: "", label: "Todas" }, ...nationalities]}
            onChange={(value) => filter({ nationality: value || null })}
          />
          <Select
            label="Situação"
            value={filters.status ?? ""}
            options={[{ value: "", label: "Todas" }, ...STATUSES]}
            onChange={(value) => filter({ status: STATUSES.find((s) => s.value === value)?.value ?? null })}
          />
          <Select
            label="Gols"
            value={String(filters.minGoals ?? "")}
            options={[{ value: "", label: "Qualquer" }, ...MIN_GOALS.map((goals) => ({ value: String(goals), label: `${goals}+ na temporada` }))]}
            onChange={(value) => filter({ minGoals: value ? Number(value) : null })}
          />
          <Select
            label="Minutos"
            value={String(filters.minMinutes ?? "")}
            options={[{ value: "", label: "Qualquer" }, ...MIN_MINUTES.map((minutes) => ({ value: String(minutes), label: `${minutes.toLocaleString("pt-BR")}+ na temporada` }))]}
            onChange={(value) => filter({ minMinutes: value ? Number(value) : null })}
          />
          {scouting.savedFilters.length > 0 && (
            <Select
              label="Buscas salvas"
              value={savedName}
              options={[{ value: NO_SAVED, label: "Nenhuma" }, ...scouting.savedFilters.map((saved) => ({ value: saved.name, label: saved.name }))]}
              onChange={runSaved}
            />
          )}
          {savedName !== NO_SAVED && (
            <button
              type="button"
              className="btn sm flat"
              onClick={() => {
                onDeleteFilter(savedName);
                setSavedName(NO_SAVED);
              }}
            >
              Apagar busca
            </button>
          )}
          {naming === null ? (
            <button type="button" className="btn sm flat" onClick={() => setNaming("")}>
              <i className="ph-bold ph-bookmark-simple" aria-hidden="true" />
              Salvar busca
            </button>
          ) : (
            <form
              className="market-save-search"
              aria-label="Salvar busca"
              onSubmit={(event) => {
                event.preventDefault();
                keepSearch();
              }}
            >
              <label className="field">
                <input aria-label="Nome da busca" placeholder="Nome da busca" value={naming} autoFocus onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNaming(null)} />
              </label>
              <button className="btn sm go" disabled={!naming.trim()}>
                Salvar
              </button>
            </form>
          )}

        </div>
        <div className="market-tabs-row">
          {tabs}
          <label className="market-toggle">
            Só observados
            <input type="checkbox" role="switch" className="sw-input" checked={filters.isWatchedOnly} onChange={(e) => filter({ isWatchedOnly: e.target.checked })} />
            <span className={filters.isWatchedOnly ? "sw on" : "sw"} aria-hidden="true" />
          </label>
          <label className="market-toggle">
            Só quem toparia vir
            <input type="checkbox" role="switch" className="sw-input" checked={filters.isWillingOnly} onChange={(e) => filter({ isWillingOnly: e.target.checked })} />
            <span className={filters.isWillingOnly ? "sw on" : "sw"} aria-hidden="true" />
          </label>
          {windowLine}
        </div>
        <section className="page market-results" aria-label="Resultados">
          {found.rows.length === 0 ? (
            <p className="market-empty">Ninguém com esse perfil. Afrouxe um filtro.</p>
          ) : (
            <table className="tb" aria-label="Jogadores">
              <thead>
                <tr>
                  <th scope="col" className="l">
                    Pos
                  </th>
                  <th scope="col" className="l">
                    Nome
                  </th>
                  <th scope="col" className="l">
                    Clube
                  </th>
                  <th scope="col">Idade</th>
                  <th scope="col">F</th>
                  <th scope="col">Passe</th>
                  <th scope="col">Salário</th>
                  <th scope="col">Contrato</th>
                  <th scope="col" className="l">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                {found.rows.map((row) => {
                  const owner = row.clubId ? state.clubs[row.clubId] : undefined;
                  const isChosen = chosen?.id === row.id;
                  return (
                    <tr key={row.id} className={isChosen ? "sel" : undefined}>
                      <td className="l">
                        <span className={`market-pos ${row.group}`}>{POSITION_SHORT[row.group]}</span>
                      </td>
                      <td className="l nm">
                        <button className="market-name" aria-pressed={isChosen} onClick={() => setChosenId(row.id)}>
                          {row.name}
                        </button>
                        {row.isWatched && <i className="ph-fill ph-star market-star" role="img" aria-label="Observado" />}
                      </td>
                      <td className="l">
                        {owner ? (
                          <Link className="market-club" to={`/club/${owner.id}`}>
                            <Crest club={owner} size={18} />
                            {owner.shortName}
                          </Link>
                        ) : (
                          <span className="dim">Sem clube</span>
                        )}
                      </td>
                      <td className={row.age <= YOUNG_AGE ? "young" : row.age >= OLD_AGE ? "old" : undefined}>{row.age}</td>
                      <td className="market-f">{Math.round(row.strength)}</td>
                      <td>{priceText(row)}</td>
                      <td>{formatMoney(row.currentWage).replace("R$ ", "")}</td>
                      <td className="dim">{formatMonthYear(row.contractUntil)}</td>
                      <td className="l">{situation(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {found.total > found.rows.length && (
            <p className="market-more">
              {found.rows.length} de {found.total.toLocaleString("pt-BR")}
              <button className="btn sm flat" onClick={() => setLimit(limit + PAGE)}>
                Ver mais
              </button>
            </p>
          )}
        </section>
      </div>

      <aside className="stk market-pick" aria-label="Jogador escolhido">
        {chosen ? (
          <Chosen key={chosen.id} row={chosen} state={state} desk={desk} squadSize={squadSize} onAsk={onAsk} onWithdraw={onWithdraw} onDeclineCounter={onDeclineCounter} onWatch={onWatch} />
        ) : (
          <p className="market-empty">Escolha um jogador na lista.</p>
        )}
        <div className="market-desk">
          <h2 className="lbl">Pedidos à diretoria</h2>
          <BoardRequests desk={desk} state={state} answers={DESK_ANSWERS} onWithdraw={onWithdraw} />
        </div>
      </aside>
    </div>
  );
}

type ChosenProps = {
  row: MarketRow;
  state: MarketState;
  desk: BoardDesk;
  squadSize: number;
  onAsk: (request: CoachRequest) => void;
  onWithdraw: (playerId: string) => void;
  onDeclineCounter: (playerId: string) => void;
  onWatch: (playerId: string, isWatched: boolean) => void;
};

/** The length a signing offers first: the one nearest two years he takes, as the assistant would. */
const firstTerm = (terms: readonly ContractTerm[]): ContractTerm | undefined => assistantPick(terms) ?? terms.find((term) => term.stance !== "refuses");

function Chosen({ row, state, desk, squadSize, onAsk, onWithdraw, onDeclineCounter, onWatch }: ChosenProps) {
  const terms = useMemo(() => signingTerms(state, row.id, row.wage), [state, row.id, row.wage]);
  const [fee, setFee] = useState(row.price ?? 0);
  const [months, setMonths] = useState(() => firstTerm(terms)?.months ?? DEFAULT_SIGNING_MONTHS);
  const [wage, setWage] = useState(() => firstTerm(terms)?.wage ?? row.wage);
  useEffect(() => {
    const first = firstTerm(terms);
    setFee(row.price ?? 0);
    setMonths(first?.months ?? DEFAULT_SIGNING_MONTHS);
    setWage(first?.wage ?? row.wage);
  }, [row.price, row.wage, terms]);

  const owner = row.clubId ? state.clubs[row.clubId] : undefined;
  const options = requestOptions(state, row.id);
  const pending = desk.pending.find((request) => request.playerId === row.id);
  const counter = coachMarketOf(state).counters[row.id];
  const advice = offerAdvice(state, row, fee, wage);
  const isFull = isSquadFull(squadSize);
  const buy = options.find((option) => option.request.kind === "sign");
  const loanIn = options.find((option) => option.request.kind === "loanIn");
  const recall = options.find((option) => option.request.kind === "recall");
  const clause = row.clause !== null ? clauseRequest(state, row.id) : null;
  const clauseShortBy = row.clause !== null ? -offerAdvice(state, row, row.clause, wage).budgetLeft : 0;
  const hasFee = !!row.price && buy?.label === "Comprar";
  const colours = owner ? plateColours(owner.colours) : null;
  const best = advice.atPosition[0]?.strength ?? row.strength;
  const scale = (strength: number) => `${Math.max(8, Math.min(100, strength))}%`;

  // A loanee's purchase keeps his contract; every other signing offers a length.
  const isLoanBuy = row.clubId === state.coachClubId;
  const length = isLoanBuy ? {} : { years: months / 12 };
  const term = terms.find((t) => t.months === months);

  function sign() {
    if (!buy || buy.request.kind !== "sign") return;
    onAsk(hasFee ? { ...buy.request, fee, wage, ...length } : { ...buy.request, wage, ...length });
  }

  return (
    <section className="market-chosen" aria-label={row.name}>
      <header className="market-chosen-top">
        <span className="market-avatar" style={colours ? { background: colours.background, color: colours.text } : undefined} aria-hidden="true">
          {row.name.charAt(0)}
          {owner && (
            <span className="market-avatar-crest">
              <Crest club={owner} size={22} />
            </span>
          )}
        </span>
        <div className="market-chosen-who">
          <h2>{row.name}</h2>
          <p>
            {POSITION_NAMES[row.group]} · {owner ? <Link to={`/club/${owner.id}`}>{owner.shortName}</Link> : "sem clube"} · {row.age} anos
          </p>
        </div>
        <p className="market-chosen-f" aria-label={`Força ${Math.round(row.strength)}`}>
          <b>{Math.round(row.strength)}</b>
          <span>força</span>
        </p>
        <span className="market-chosen-watch">
          <WatchToggle isWatched={row.isWatched} onToggle={() => onWatch(row.id, !row.isWatched)} />
        </span>
      </header>
      <div className="market-chosen-body">
        <dl className="market-kv">
          <dt>Passe</dt>
          <dd>{priceText(row)}</dd>
          <dt>Mercado</dt>
          <dd>{formatMoney(row.value)}</dd>
          <dt>Salário</dt>
          <dd>{formatMoney(row.currentWage)}</dd>
          <dt>Contrato</dt>
          <dd>até {formatMonthYear(row.contractUntil)}</dd>
          {row.clause !== null && (
            <>
              <dt>Multa</dt>
              <dd>{formatMoney(row.clause)}</dd>
            </>
          )}
        </dl>

        {buy && !pending && !counter && (
          <div className="market-offer">
            {hasFee && (
              <div className="market-offer-row">
                <span className="lbl">Oferta</span>
                <MoneyStepper label="Oferta" value={fee} step={roundStep(row.price ?? 0)} hint={`pede ${formatMoney(row.price ?? 0)}`} onChange={setFee} />
              </div>
            )}
            <div className="market-offer-row">
              <span className="lbl">Salário</span>
              <MoneyStepper label="Salário" value={wage} step={roundStep(row.wage)} hint="por mês" onChange={setWage} />
            </div>
            {!isLoanBuy && (
              <div className="market-offer-row">
                <span className="lbl">Prazo</span>
                <div className="market-lengths" role="radiogroup" aria-label="Tempo de contrato">
                  {terms.map((t) => (
                    <button
                      key={t.months}
                      type="button"
                      role="radio"
                      aria-checked={t.months === months}
                      aria-label={`${formatContractLength(t.months)}: ${formatMoney(t.wage)} por mês, ${STANCE_LABELS[t.stance]}`}
                      title={`${formatMoney(t.wage)} por mês · ${STANCE_LABELS[t.stance]}`}
                      className={`market-len ${t.stance}${t.months === months ? " on" : ""}`}
                      disabled={t.stance === "refuses"}
                      onClick={() => {
                        setMonths(t.months);
                        setWage(t.wage);
                      }}
                    >
                      <b>{t.months < 12 ? t.months : t.months / 12}</b>
                      <small>{t.months < 12 ? "meses" : t.months === 12 ? "ano" : "anos"}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isLoanBuy && term && (
              <p className={`market-len-note ${term.stance}`}>
                {STANCE_LABELS[term.stance]} · pede {formatMoney(term.wage)} · até {formatMonthYear(contractEndAfter(state.date, months))}
              </p>
            )}
          </div>
        )}

        <div className="market-fit">
          <span className="market-fit-who">
            <i className="ph-bold ph-user-switch" aria-hidden="true" />
            Auxiliar
          </span>
          <p className={advice.budgetLeft >= 0 ? "ok" : "no"}>
            <i className={advice.budgetLeft >= 0 ? "ph-fill ph-check-circle" : "ph-fill ph-x-circle"} aria-hidden="true" />
            {advice.budgetLeft >= 0 ? (
              <>
                Cabe na verba: sobra <b>{formatMoney(advice.budgetLeft)}</b>
              </>
            ) : (
              <>
                Não cabe na verba: faltam <b>{formatMoney(-advice.budgetLeft)}</b>
              </>
            )}
          </p>
          <p className={row.willing === "no" ? "no" : row.willing === "yes" ? "ok" : "maybe"}>
            <i className={row.willing === "no" ? "ph-fill ph-x-circle" : row.willing === "yes" ? "ph-fill ph-check-circle" : "ph-fill ph-question"} aria-hidden="true" />
            {WILLING[row.willing]}
          </p>
          <p className={advice.replaces ? "ok" : "maybe"}>
            <i className={advice.replaces ? "ph-fill ph-check-circle" : "ph-fill ph-minus-circle"} aria-hidden="true" />
            {advice.replaces ? (
              <>
                Seria titular no lugar de {advice.replaces.name}: <b>{Math.round(advice.replaces.strength)} → {Math.round(row.strength)}</b>
              </>
            ) : (
              "Chegaria como reserva"
            )}
          </p>
        </div>

        {advice.atPosition.length > 0 && (
          <div className="market-compare">
            <span className="lbl">Seus {POSITION_GROUP_NAMES[row.group].toLowerCase()}</span>
            {[{ id: row.id, name: row.name, strength: row.strength, age: row.age, isHim: true }, ...advice.atPosition.map((p) => ({ ...p, isHim: false }))]
              .sort((a, b) => b.strength - a.strength)
              .map((p) => (
                <div key={p.id} className={p.isHim ? "market-compare-row him" : "market-compare-row"}>
                  <span>{p.name}</span>
                  <span className={`meter thin${p.strength < best - 5 ? " mid" : ""}`}>
                    <i style={{ width: scale(p.strength) }} />
                  </span>
                  <b>{Math.round(p.strength)}</b>
                </div>
              ))}
          </div>
        )}

        <div className="market-chosen-foot">
          {pending ? (
            <p className="market-note" role="status">
              {requestTitle(pending, row.name)} na mesa. {pendingText(state, pending)}{" "}
              <button className="btn sm flat" onClick={() => onWithdraw(row.id)}>
                Retirar
              </button>
            </p>
          ) : counter ? (
            <div className="market-counter" role="status">
              <p>
                <b>{state.clubs[counter.clubId]?.shortName ?? "O clube"}</b> pede <b>{formatMoney(counter.fee)}</b> por ele. A proposta vale até {formatDayMonth(counter.until)}.
              </p>
              <div className="market-acts">
                <button className="btn flat" onClick={() => onDeclineCounter(row.id)}>
                  Recusar
                </button>
                <button className="btn go" onClick={() => onAsk({ kind: "sign", playerId: row.id, fee: counter.fee, wage })}>
                  Aceitar {formatMoney(counter.fee)}
                </button>
              </div>
            </div>
          ) : isFull && buy ? (
            <p className="market-note full" role="status">
              Elenco cheio: {squadSize} de {SQUAD_CAP} jogadores. Venda ou empreste alguém antes de contratar.
            </p>
          ) : recall ? (
            <div className="market-acts">
              <button className="btn" onClick={() => onAsk(recall.request)}>
                <i className="ph-bold ph-arrow-u-up-left" aria-hidden="true" />
                {recall.label}
              </button>
            </div>
          ) : !buy && !loanIn ? (
            <p className="market-note">{row.status === "onLoan" ? "Está emprestado; não dá para negociar agora." : "Já assinou com outro clube."}</p>
          ) : null}
          {!pending && !counter && (buy || loanIn) && (
            <div className="market-acts">
              {loanIn && (
                <button className="btn" onClick={() => onAsk(loanIn.request)}>
                  {loanIn.label}
                </button>
              )}
              {buy && (
                <button className="btn go market-go" onClick={sign}>
                  <i className="ph-bold ph-paper-plane-tilt" aria-hidden="true" />
                  {hasFee && fee < (row.price ?? 0) ? "Fazer proposta" : buy.label}
                </button>
              )}
            </div>
          )}
          {!pending && !counter && clause && row.clause !== null && (
            <>
              <button className="btn flat market-clause" disabled={clauseShortBy > 0} onClick={() => onAsk({ kind: "payClause", playerId: row.id, wage, years: months / 12 })}>
                Pagar a multa: {formatMoney(row.clause)}
              </button>
              {clauseShortBy > 0 && <p className="market-note">A multa não cabe na verba: faltam {formatMoney(clauseShortBy)}.</p>}
            </>
          )}
          {row.clubId && (
            <Link className="market-card-link" to={`/squad/${row.id}`}>
              Ver ficha
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
