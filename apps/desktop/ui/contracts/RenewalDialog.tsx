import { useCallback, useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatContractLength } from "@boleiro/game-client/format/formatContractLength";
import { formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import { renewalSheet, type AssistantPlan, type RenewalOption, type RenewalSheet } from "@boleiro/game-client/market/contracts";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { POSITION_NAMES } from "../format/playerLabels.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { inPortuguese } from "../market/marketSearch.js";
import { MoneyStepper, roundStep } from "../market/MoneyStepper.js";
import { answerText, pendingText, requestTitle } from "../market/requestText.js";
import { playerCard } from "../squad/playerCard.js";
import { renewalSay, STANCE_LABELS } from "./renewalText.js";
import "./renewal.css";

const RENEWAL_KEYS = ["date", "season", "coachClubId", "coach", "clubs", "players", "finances", "market", "mood", "eventMemory", "hasMidSeasonWindow", "discipline", "competitions", "fixtures", "history"] as const;
type RenewalState = Pick<GameState, (typeof RENEWAL_KEYS)[number]>;

// The peel-off animation's length (renewal.css, ct-peel).
const LEAVE_MS = 200;
const STANCE_TONES = { wants: "ok", agrees: "ok", hard: "off", refuses: "bad" } as const;
const SKIP_WORDS: Record<Extract<AssistantPlan, { kind: "skips" }>["reason"], string> = {
  notInPlans: "fora dos planos",
  playerUnwilling: "ele não topa nenhum tempo",
  wageCap: "sem espaço na folha",
};

type Props = {
  playerId: string;
  onClose: () => void;
  /** After a request goes on the desk or comes off it, or the assistant's switch moves, for the screen behind to read again. */
  onChange?: () => void;
};

/** "R$ 52,3 mi → 52,7 mi": the second amount drops the currency it shares with the first. */
const fromTo = (before: number, after: number) => `${formatMoney(before)} → ${formatMoney(after).replace("R$ ", "")}`;

function AssistantLine({ sheet }: { sheet: RenewalSheet }) {
  if (!sheet.isAssistantOn) return <span>Você cuida dos contratos</span>;
  const { plan } = sheet;
  if (!plan) return <span>O auxiliar não chega a olhar este contrato</span>;
  if (plan.kind === "skips") {
    return (
      <span>
        O auxiliar deixaria acabar
        <br />
        <b>{SKIP_WORDS[plan.reason]}</b>
      </span>
    );
  }
  return (
    <span>
      O auxiliar renova sozinho
      <br />
      <b>
        em {formatDayMonth(plan.on)}, por {formatContractLength(plan.months)}
      </b>
    </span>
  );
}

/**
 * The renewal screen, stuck over the hub (approved mock design/mocks/contract.html): who he is and his
 * contract, what he says, each length with his ask and how he takes it, what the pick does to the wage bill,
 * the assistant's plan with its switch, and the request that goes to the board.
 */
export function RenewalDialog({ playerId, onClose: close, onChange }: Props) {
  const { engine } = useServices();
  const [state, setState] = useState<RenewalState | null>(null);
  // Focus moves in, and the page behind turns inert, once the sheet is there to hold it.
  const title = useDialogFocus<HTMLHeadingElement>(state !== null, { isModal: true });
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [offer, setOffer] = useState<number | null>(null);
  const [isNegotiating, setNegotiating] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [hasFailed, setFailed] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  /** Peels the sheet off the page before it goes; at once with reduced motion. */
  function onClose() {
    if (isLeaving) return;
    if (prefersReducedMotion()) return close();
    setLeaving(true);
    window.setTimeout(close, LEAVE_MS);
  }

  const load = useCallback(
    () =>
      Promise.all([engine.read(RENEWAL_KEYS), engine.desk()]).then(
        ([read, onDesk]) => {
          setState(read);
          setDesk(onDesk);
        },
        () => setFailed(true),
      ),
    [engine],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const sheet = state ? renewalSheet(state, playerId) : null;
  const card = state ? playerCard(state, playerId) : null;
  // He may refuse every length (asked to leave, an offer waiting, a sour squad): the cards still show why.
  const chosen = sheet && (sheet.options.find((o) => o.months === months) ?? sheet.options.find((o) => o.isAssistantPick) ?? sheet.options.find((o) => o.stance !== "refuses") ?? sheet.options[0]);

  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setFailed(false);
    try {
      await change();
      await load();
      onChange?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const ask = (option: RenewalOption, wage: number) => void act(() => engine.apply({ type: "ask", request: { kind: "renew", playerId, years: option.months / 12, wage } }));
  const withdraw = () => void act(() => engine.apply({ type: "withdraw", playerId }));
  const switchAssistant = (isOn: boolean) => void act(() => engine.apply({ type: "setAssistantDuty", duty: "contracts", isOn }));

  function pick(option: RenewalOption) {
    if (option.stance === "refuses") return;
    setMonths(option.months);
    setOffer(null);
  }

  // A radio group: the arrows move the choice to the next length he'll talk about, focus going with it.
  function moveChoice(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const open = sheet?.options.filter((option) => option.stance !== "refuses") ?? [];
    if (!step || !chosen || !open.length) return;
    event.preventDefault();
    const at = open.findIndex((option) => option.months === chosen.months);
    const next = open[(at + step + open.length) % open.length];
    if (!next) return;
    pick(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-months="${next.months}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isBusy) onClose();
    const number = Number(event.key);
    const option = sheet?.options[number - 1];
    if (option && !(event.target instanceof HTMLInputElement)) pick(option);
  }

  if (!state || !desk || !sheet || !card || !chosen) {
    const isGone = state !== null && desk !== null;
    return createPortal(
      <div className="ct-veil" onKeyDown={(event) => event.key === "Escape" && close()}>
        <p className="stk ct-status" role="status">
          {hasFailed ? "Não deu para abrir o contrato." : isGone ? "Não dá para renovar com ele agora." : "Abrindo o contrato…"}
          {(hasFailed || isGone) && (
            <button className="btn sm" onClick={close} autoFocus>
              Fechar
            </button>
          )}
        </p>
      </div>,
      document.body,
    );
  }

  const player = state.players[playerId];
  const club = player ? state.clubs[player.clubId] : undefined;
  const colours = club ? plateColours(club.colours) : { background: "#1b6b3a", text: "#ffffff" };
  const art = { "--c1": club?.colours.primary ?? colours.background, "--c2": club?.colours.secondary ?? colours.text } as CSSProperties;
  const nationality = player?.nationalities[0];
  const counter = sheet.counter;
  const wage = offer ?? (counter && counter.months === chosen.months ? counter.wage : chosen.wage);
  const billAfter = sheet.bill - sheet.wage + wage;
  const isOverCap = wage > sheet.wage && billAfter > sheet.wageCap;
  const isRefused = chosen.stance === "refuses";
  const pending = desk.pending.find((request) => request.playerId === playerId);
  const lastAnswer = desk.answers.filter((answer) => answer.request.playerId === playerId && answer.request.kind === "renew").at(-1);
  const leavesFor = card.contract.leavesForId ? state.clubs[card.contract.leavesForId] : undefined;
  const clubName = (clubId: string) => state.clubs[clubId]?.shortName ?? clubId;
  const say = renewalSay({ age: card.age, preferredMonths: sheet.preferredMonths, mood: sheet.mood, options: sheet.options }, clubName);
  const lengthWords = formatContractLength(chosen.months);

  const foot = leavesFor ? (
    <div className="ct-acts">
      <p className="ct-note" role="status">
        Já assinou pré-contrato com o <b>{leavesFor.shortName}</b>: não dá mais para renovar.
      </p>
      <button className="btn" onClick={onClose}>
        Fechar
      </button>
    </div>
  ) : pending ? (
    <div className="ct-acts">
      <p className="ct-note" role="status">
        <i className="ph-bold ph-stamp" aria-hidden="true" />
        <span>
          <b>{requestTitle(pending, card.name)}</b> na mesa{pending.kind === "renew" ? `, ${formatContractLength(pending.years * 12)}${pending.wage ? ` a ${formatMoney(pending.wage)}` : ""}` : ""}. {pendingText(state, pending)}
        </span>
      </p>
      <button className="btn flat" onClick={withdraw} disabled={isBusy}>
        Retirar
      </button>
      <button className="btn" onClick={onClose}>
        Fechar
      </button>
    </div>
  ) : (
    <div className="ct-acts">
      <button className="btn flat" onClick={onClose}>
        Agora não
      </button>
      <button className={isNegotiating ? "btn on" : "btn"} aria-pressed={isNegotiating} onClick={() => setNegotiating(!isNegotiating)}>
        <i className="ph-bold ph-chats-circle" aria-hidden="true" />
        Negociar salário
      </button>
      <button className="btn go ct-go" onClick={() => ask(chosen, wage)} disabled={isBusy || isOverCap || isRefused}>
        <i className="ph-bold ph-signature" aria-hidden="true" />
        {isRefused ? "Ele não aceita renovar" : `Renovar por ${lengthWords}`}
      </button>
    </div>
  );

  return createPortal(
    <div className={isLeaving ? "ct-veil out" : "ct-veil"} onKeyDown={onKeyDown} onMouseDown={(event) => event.target === event.currentTarget && !isBusy && onClose()}>
      <section className="ct" role="dialog" aria-modal="true" aria-labelledby="ct-title">
        <aside className="ct-l">
          <div className="ct-stk" aria-hidden="true">
            <div className="ct-art" style={art}>
              {club && (
                <span className="ct-crest">
                  <Crest club={club} size={26} />
                </span>
              )}
              <b>{card.name.charAt(0)}</b>
              <span className="ct-f">{Math.round(card.strength)}</span>
            </div>
            <div className="ct-nm">{card.name}</div>
            <div className="ct-sb">
              {POSITION_NAMES[card.group]} · {card.age}
              {nationality ? ` · ${inPortuguese(nationality)}` : ""}
            </div>
          </div>
          <dl className="ct-kv">
            <dt>Jogos pelo clube</dt>
            <dd>{card.atClub.apps}</dd>
            <dt>Gols</dt>
            <dd>{card.atClub.goals}</dd>
            <dt>Salário hoje</dt>
            <dd>{formatMoney(sheet.wage)}</dd>
            <dt>Multa</dt>
            <dd>{formatMoney(sheet.clause)}</dd>
            <dt>Contrato</dt>
            <dd className="ct-until">até {formatMonthYear(sheet.until)}</dd>
          </dl>
        </aside>

        <div className="ct-r">
          <button className="ct-x" aria-label="Fechar a renovação" onClick={onClose} disabled={isBusy}>
            <i className="ph-bold ph-x" aria-hidden="true" />
          </button>
          <h2 id="ct-title" ref={title} tabIndex={-1}>
            Renovar com {card.name}
          </h2>
          <p className="ct-sub">
            O contrato acaba em <b>{formatMonthYear(sheet.until)}</b>.{" "}
            {sheet.isPreContractOpen ? (
              <>Outros clubes <b>já podem</b> assinar pré-contrato com ele.</>
            ) : (
              <>A partir de {formatDayMonth(sheet.preContractFrom)} de {sheet.preContractFrom.slice(0, 4)} ele pode assinar pré-contrato com outro clube.</>
            )}
          </p>

          <div className="ct-say">
            <span className="ct-av" style={{ background: colours.background, color: colours.text }} aria-hidden="true">
              {card.name.charAt(0)}
            </span>
            <p>{say}</p>
          </div>

          <div className="ct-opts" role="radiogroup" aria-label="Tempo de contrato" onKeyDown={moveChoice}>
            {sheet.options.map((option, index) => {
              const isOn = option.months === chosen.months;
              return (
                <button
                  key={option.months}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  tabIndex={isOn ? 0 : -1}
                  data-months={option.months}
                  aria-label={`${formatContractLength(option.months)}: ${formatMoney(option.wage)} por mês, ${STANCE_LABELS[option.stance]}`}
                  className={`ct-o${isOn ? " on" : ""}${option.stance === "refuses" ? " no" : ""}`}
                  style={{ "--i": index } as CSSProperties}
                  disabled={option.stance === "refuses" || !!pending || !!leavesFor}
                  onClick={() => pick(option)}
                >
                  {option.isAssistantPick && (
                    <span className="ct-aux">
                      <i className="ph-bold ph-user-switch" aria-hidden="true" />
                      Auxiliar
                    </span>
                  )}
                  <span className="ct-o-d">{formatContractLength(option.months)}</span>
                  <span className="ct-o-w">{formatMoney(option.wage)}</span>
                  <span className="ct-o-t">
                    por mês
                    <br />
                    Total {formatMoney(option.total)}
                  </span>
                  <span className={`chip ${STANCE_TONES[option.stance]}`}>{STANCE_LABELS[option.stance]}</span>
                </button>
              );
            })}
          </div>

          {counter && !pending && (
            <div className="ct-counter" role="status">
              <p>
                Ele pede <b>{formatMoney(counter.wage)}</b> por mês para renovar por {formatContractLength(counter.months)}. Vale até {formatDayMonth(counter.until)}.
              </p>
              <button
                className="btn sm go"
                onClick={() => {
                  const option = sheet.options.find((o) => o.months === counter.months);
                  if (option) ask(option, counter.wage);
                }}
                disabled={isBusy}
              >
                Aceitar {formatMoney(counter.wage)}
              </button>
            </div>
          )}

          {isNegotiating && !pending && !leavesFor && (
            <div className="ct-offer">
              <span className="lbl">Sua oferta</span>
              <MoneyStepper label="Salário oferecido" value={wage} step={roundStep(chosen.wage)} hint={`ele pede ${formatMoney(chosen.wage)}`} onChange={setOffer} />
            </div>
          )}

          <div className="ct-sum">
            <div>
              Folha mensal
              <b key={`bill-${wage}`} className="ct-tick">
                {fromTo(sheet.bill, billAfter)}
              </b>
            </div>
            <div>
              Fim do contrato
              <b key={`end-${chosen.months}`} className="ct-tick">
                {formatMonthYear(chosen.until)}, aos {chosen.ageAtEnd}
              </b>
            </div>
            <div className="ct-aut">
              <AssistantLine sheet={sheet} />
              <button
                type="button"
                role="switch"
                aria-checked={sheet.isAssistantOn}
                aria-label="O auxiliar cuida dos contratos"
                className={sheet.isAssistantOn ? "sw on" : "sw"}
                disabled={isBusy}
                onClick={() => switchAssistant(!sheet.isAssistantOn)}
              />
            </div>
          </div>

          {(isOverCap || hasFailed || (lastAnswer && !pending)) && (
            <p className={isOverCap || hasFailed ? "ct-warn" : "ct-last"} role={isOverCap || hasFailed ? "alert" : undefined}>
              {hasFailed ? "Não deu para mandar agora. Tente fora da rodada." : isOverCap ? `Passa do teto da folha, ${formatMoney(sheet.wageCap)}: a diretoria não aprova.` : lastAnswer && answerText(lastAnswer)}
            </p>
          )}

          {foot}
        </div>
      </section>
    </div>,
    document.body,
  );
}
