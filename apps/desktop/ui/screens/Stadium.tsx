import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorksAnswer, WorksRefusal } from "@boleiro/engine/sim/stadium/stadiumWorks";
import { formatDayMonth, formatRowDate } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { StadiumBowl } from "../stadium/StadiumBowl.js";
import { STADIUM_KEYS, stadiumView, type Forecast, type StadiumState, type StadiumView } from "../stadium/stadiumView.js";
import "./stadium.css";
import { clubArticle, withArticle } from "@boleiro/data/articles";

const seats = (n: number) => n.toLocaleString("pt-BR");

const REFUSALS: Record<WorksRefusal, string> = {
  building: "já tem uma obra em andamento",
  shared: "o estádio não é só do clube, a obra não é com ela",
  capacity: "passaria do tamanho do maior estádio do país",
  trust: "não confia no seu trabalho agora",
  cash: "quer metade da obra no caixa antes de assinar",
};

function fullness(share: number): string {
  if (share >= 0.88) return "lotado";
  if (share >= 0.75) return "quase lotado";
  if (share >= 0.5) return "bom público";
  return "arquibancada vazia";
}

export function Stadium() {
  const { engine } = useServices();
  const [state, setState] = useState<StadiumState | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  /** The switch as the coach just flipped it, until the game has it. */
  const [switched, setSwitched] = useState<boolean | null>(null);
  const [chosenSeats, setChosenSeats] = useState<number | null>(null);
  const [answer, setAnswer] = useState<WorksAnswer | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = useMemo(() => state && stadiumView(state), [state]);

  const reload = useCallback(() => engine.read(STADIUM_KEYS).then(setState), [engine]);

  useEffect(() => {
    let current = true;
    engine.read(STADIUM_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo o estádio…</p>;
  if (!view) {
    return (
      <>
        <h1 className="screen-title">Estádio</h1>
        <p className="status">Sem clube, sem estádio.</p>
      </>
    );
  }

  const price = draft ?? view.price;
  const isAssistant = switched ?? view.isAssistantPricing;

  /** Runs a command against the game; a refusal (during a round, say) shows instead of changing anything. */
  async function run(command: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await command();
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  const applyPrice = (next: number) =>
    run(async () => {
      await engine.apply({ type: "priceTickets", price: next });
      setDraft(null);
    });

  /**
   * The switch is the assistant's ticket price duty: handed back, he sets his price at once. It flips on
   * the click, so the price controls answer straight away; the game follows in order.
   */
  function toggleAssistant() {
    const isOn = !isAssistant;
    setSwitched(isOn);
    setDraft(null);
    engine
      .apply({ type: "setAssistantDuty", duty: "ticketPrice", isOn })
      .then(reload)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setSwitched(null));
  }

  const askWorks = (seatsAsked: number) =>
    run(async () => {
      setAnswer(await engine.apply({ type: "askStadiumWorks", seats: seatsAsked }));
    });

  function chooseWorks(seatsChosen: number) {
    setChosenSeats(seatsChosen);
    setAnswer(null);
  }

  return (
    <div className="stadium">
      <section className="page std-hero" aria-labelledby="std-title">
        <Header view={view} />
        <div className="std-mid">
          <div className="std-bowl-wrap">
            <StadiumBowl share={view.forecastAt(price)?.share ?? 0} visitorColour={view.next?.opponent.colours.primary ?? null} />
            <p className="std-cap">
              <span><i className="std-key full" />Previsto</span>
              <span><i className="std-key empty" />Vazio</span>
              <span><i className="std-key away" style={view.next ? { background: view.next.opponent.colours.primary } : undefined} />Visitante</span>
            </p>
          </div>
          <div className="std-fc">
            <ForecastFigures view={view} price={price} />
            <div className="std-price">
              <span className="lbl" id="std-price-label">Ingresso</span>
              <div className="std-price-row">
                <span className="std-tag" aria-live="polite">
                  R$ {price}
                  <small>{price !== view.price ? `era R$ ${view.price}` : isAssistant ? "do auxiliar" : "atual"}</small>
                </span>
                <PriceTrack view={view} price={price} disabled={isAssistant || isBusy} onChange={setDraft} />
                <span className="std-mm">
                  <button type="button" aria-label="Baixar o preço" disabled={isAssistant || isBusy || price <= view.bounds.min} onClick={() => setDraft(Math.max(view.bounds.min, price - 5))}>
                    <i className="ph-bold ph-minus" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Subir o preço" disabled={isAssistant || isBusy || price >= view.bounds.max} onClick={() => setDraft(Math.min(view.bounds.max, price + 5))}>
                    <i className="ph-bold ph-plus" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </div>
            <dl className="std-why">
              {view.factors(price).map((factor) => (
                <div key={factor.label}>
                  <dt>{factor.label}</dt>
                  <dd className={factor.push}>
                    {factor.push !== "none" && <i className={`ph-bold ph-arrow-${factor.push}`} aria-hidden="true" />}
                    {factor.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="std-acts">
          <button type="button" className="std-aux" role="switch" aria-checked={isAssistant} disabled={isBusy} onClick={toggleAssistant}>
            <span className={isAssistant ? "sw on" : "sw"} aria-hidden="true" />
            <span>
              Auxiliar define o preço
              <br />
              <b>{isAssistant ? `Ligado: R$ ${view.assistantPrice}, a média da divisão` : "Desligado: você decide"}</b>
            </span>
          </button>
          {error && (
            <p className="std-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn go std-go" disabled={isBusy || price === view.price} onClick={() => void applyPrice(price)}>
            <i className="ph-bold ph-ticket" aria-hidden="true" />
            Aplicar preço
          </button>
        </div>
      </section>

      <aside className="std-side">
        <LastGames view={view} />
        <Works view={view} chosen={chosenSeats ?? view.options.find((o) => o.answer.approved)?.answer.quote.seats ?? view.options[0]?.answer.quote.seats ?? 0} onChoose={chooseWorks} answer={answer} isBusy={isBusy} onAsk={(n) => void askWorks(n)} />
      </aside>
    </div>
  );
}

function Header({ view }: { view: StadiumView }) {
  const { club, next, sharedWith } = view;
  return (
    <header className="std-hd">
      <div>
        <h1 id="std-title">{club.stadium}</h1>
        <p>
          <b>{seats(club.capacity)} lugares</b>
          {sharedWith.length > 0 && ` · dividido com ${sharedWith.map((other) => withArticle(other.shortName, clubArticle(other.id))).join(" e ")}`}
        </p>
      </div>
      {next ? (
        <div className="stk std-next">
          <Crest club={next.opponent} size={32} />
          <div>
            <b>
              {next.opponent.shortName}, {formatRowDate(next.fixture.date).split(" ")[0]} {formatDayMonth(next.fixture.date)}
            </b>
            <small>
              {next.competition}
              {next.weight ? ` · ${next.weight.toLowerCase()}` : ""}
            </small>
          </div>
        </div>
      ) : (
        <div className="stk std-next">
          <div>
            <b>Sem jogo em casa</b>
            <small>Nenhum jogo marcado</small>
          </div>
        </div>
      )}
    </header>
  );
}

function ForecastFigures({ view, price }: { view: StadiumView; price: number }) {
  const forecast = view.forecastAt(price);
  const now = view.forecastAt(view.price);
  if (!forecast || !now) return <p className="std-was">Sem jogo em casa marcado: a previsão volta com o próximo.</p>;
  const delta = forecast.gate - now.gate;
  return (
    <>
      <div className="std-big">
        <div>
          <span>Público previsto</span>
          <b data-testid="std-crowd">{seats(forecast.crowd)}</b>
          <small className={forecast.share >= 0.5 ? "up" : "dn"}>
            {Math.round(forecast.share * 100)}% · {fullness(forecast.share)}
          </small>
        </div>
        <div>
          <span>Renda</span>
          <b data-testid="std-gate">{formatMoney(forecast.gate)}</b>
          {delta !== 0 && <small className={delta > 0 ? "up" : "dn"}>{`${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta))}`}</small>}
        </div>
      </div>
      {price !== view.price && <Was price={view.price} forecast={now} />}
    </>
  );
}

function Was({ price, forecast }: { price: number; forecast: Forecast }) {
  return (
    <p className="std-was">
      Com R$ {price}:{" "}
      <b>
        {seats(forecast.crowd)} pessoas, {formatMoney(forecast.gate)}
      </b>
      .
    </p>
  );
}

function PriceTrack({ view, price, disabled, onChange }: { view: StadiumView; price: number; disabled: boolean; onChange: (price: number) => void }) {
  const { min, max } = view.bounds;
  const at = (value: number) => `${((value - min) / (max - min)) * 100}%`;
  return (
    <span className="std-track">
      <b style={{ width: at(price) }} />
      <s style={{ left: at(view.assistantPrice) }} />
      <span className="std-track-mark" style={{ left: at(view.assistantPrice) }}>
        média
      </span>
      <u style={{ left: at(price) }} />
      <em style={{ left: 0 }}>R$ {min}</em>
      <em style={{ left: "100%" }}>R$ {max}</em>
      <input type="range" aria-labelledby="std-price-label" min={min} max={max} step={1} value={price} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </span>
  );
}

function LastGames({ view }: { view: StadiumView }) {
  return (
    <section className="stk std-att" aria-labelledby="std-att-title">
      <h2 id="std-att-title">Últimos jogos em casa</h2>
      {view.lastGames.length === 0 ? (
        <p className="std-empty">O primeiro jogo em casa aparece aqui, com público e renda.</p>
      ) : (
        <ol>
          {view.lastGames.map((game) => (
            <li key={`${game.date}-${game.opponent?.id ?? ""}`} className="std-ar">
              <span className="std-dt">{formatDayMonth(game.date)}</span>
              {game.opponent ? <Crest club={game.opponent} size={22} /> : <span />}
              <div className="std-nm">
                <b>{game.opponent?.shortName ?? "—"}</b>
                <small>
                  {game.competition} · R$ {game.price}
                </small>
                <span className={`meter thin ${game.share < 0.6 ? "mid" : ""}`}>
                  <i style={{ width: `${Math.min(100, Math.round(game.share * 100))}%` }} />
                </span>
              </div>
              <div className="std-r">
                <b>{game.crowd > 0 ? seats(game.crowd) : "Portões fechados"}</b>
                <small>{formatMoney(game.gate)}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type WorksProps = { view: StadiumView; chosen: number; onChoose: (seats: number) => void; answer: WorksAnswer | null; isBusy: boolean; onAsk: (seats: number) => void };

function Works({ view, chosen, onChoose, answer, isBusy, onAsk }: WorksProps) {
  const { works, options, board } = view;
  if (works) {
    const share = works.paid / works.cost;
    return (
      <section className="stk std-obra" aria-labelledby="std-obra-title">
        <h2 id="std-obra-title">Obra em andamento</h2>
        <p className="std-obra-big">
          <b>+{seats(works.seats)} lugares</b>
          <span>pronta em {formatDayMonth(works.opensOn)} de {works.opensOn.slice(0, 4)}</span>
        </p>
        <div className="std-ok">
          <span>Pago</span>
          <span className="meter">
            <i style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
          <b>{formatMoney(works.paid)}</b>
        </div>
        <p className="std-bd">
          Obra de {formatMoney(works.cost)}, paga em parcelas mensais. Os lugares abrem no dia da entrega.
        </p>
        {answer?.approved && <p className="std-answer good" role="status">Diretoria aprovou: a obra começou.</p>}
      </section>
    );
  }
  const option = options.find((o) => o.answer.quote.seats === chosen) ?? options[0];
  const coverage = option ? Math.min(1, Math.max(0, board.cash / (option.answer.quote.cost / 2))) : 0;
  return (
    <section className="stk std-obra" aria-labelledby="std-obra-title">
      <h2 id="std-obra-title">Pedir obra à diretoria</h2>
      <fieldset className="std-opts">
        <legend className="std-legend">Tamanho da obra</legend>
        {options.map(({ answer: verdict, gainPerGame }) => {
          const { seats: added, cost, months } = verdict.quote;
          return (
            <label key={added} className={added === chosen ? "std-opt on" : "std-opt"}>
              <input type="radio" name="std-works" value={added} checked={added === chosen} onChange={() => onChoose(added)} />
              <b>+{seats(added)} lugares</b>
              <span>{months} meses de obra</span>
              <em>
                {formatMoney(cost)}
                <small>{gainPerGame > 0 ? `+${formatMoney(gainPerGame)}/jogo` : "sem ganho hoje"}</small>
              </em>
            </label>
          );
        })}
      </fieldset>
      {option && (
        <>
          <div className="std-ok">
            <span>Diretoria</span>
            <span className={`meter ${option.answer.approved ? "" : "low"}`}>
              <i style={{ width: `${Math.round((option.answer.approved ? 1 : coverage) * 100)}%` }} />
            </span>
            <b>{option.answer.approved ? "Aprova" : "Recusa"}</b>
          </div>
          <p className="std-bd">
            Diretoria {Math.round(board.confidence * 100)}% com você, caixa livre de {formatMoney(board.cash)}. Paga em {option.answer.quote.months} parcelas durante a obra.
            {!option.answer.approved && ` Hoje ela recusaria: ${REFUSALS[option.answer.reason]}.`}
          </p>
        </>
      )}
      {answer && !answer.approved && (
        <p className="std-answer bad" role="status">
          Diretoria recusou: {REFUSALS[answer.reason]}.
        </p>
      )}
      <button type="button" className="btn std-send" disabled={isBusy || !option} onClick={() => option && onAsk(option.answer.quote.seats)}>
        <i className="ph-bold ph-paper-plane-tilt" aria-hidden="true" />
        Enviar pedido
      </button>
    </section>
  );
}
