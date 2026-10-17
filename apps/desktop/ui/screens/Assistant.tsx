import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { AssistantCandidate, AssistantRefusal } from "@boleiro/engine/sim/coach/assistant";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { AssistantPage } from "@boleiro/game-client/assistant/assistantPage";
import { formatBarDate, formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { useServices } from "../app/ServicesContext.js";
import { readWorthSigning, signingSuggestions, type Suggestion } from "../assistant/signingSuggestions.js";
import { Crest } from "../clubs/Crest.js";
import { AssistantAreas } from "../events/AssistantAreas.js";
import { useCountUp } from "../finances/useCountUp.js";
import { MARKET_KEYS } from "../market/BuyView.js";
import { ROLE_LETTER, ROLE_NAME } from "../round/lineupBoard.js";
import "./assistant.css";

const KEYS = [...MARKET_KEYS, "seed", "season"] as const;
type AssistantState = Pick<GameState, (typeof KEYS)[number]>;
type Loaded = { page: AssistantPage; state: AssistantState; watched: ReadonlySet<string> };

const LEVELS = [1, 2, 3, 4, 5] as const;
const ROLE_PLURAL: Record<keyof typeof ROLE_NAME, string> = { goleiro: "Goleiros", lateral: "Laterais", zagueiro: "Zagueiros", meia: "Meias", atacante: "Atacantes" };
const GROUP_WORD: Record<PositionGroup, string> = { GK: "goleiro", DEF: "defensor", MID: "meia", ATT: "atacante" };
const REFUSALS: Record<AssistantRefusal, string> = {
  wageCap: "A diretoria vetou: o salário dele estoura o teto da folha.",
  noClub: "Sem clube, ninguém vem trabalhar com você.",
  unknown: "Ele já acertou com outro clube.",
};
// The avatars' paper colours: muted inks of the album, picked by the name so a person keeps his.
const AVATAR_INKS = ["#3C4A40", "#5C584B", "#2E4A63", "#6B3B2E", "#4B3B63", "#2F5A4A"] as const;
// Stickers land one after another, top to bottom.
const LAY_STAGGER_MS = 60;

const lay = (index: number): CSSProperties => ({ animationDelay: `${index * LAY_STAGGER_MS}ms` });
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function inkOf(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_INKS[hash % AVATAR_INKS.length] ?? AVATAR_INKS[0];
}

function Avatar({ name, size }: { name: string; size: "lg" | "sm" }) {
  return (
    <span className={`av asst-av ${size}`} style={{ background: inkOf(name) }} aria-hidden="true">
      {name.charAt(0)}
    </span>
  );
}

function Pips({ level, size }: { level: number; size: "lg" | "sm" }) {
  return (
    <span className={`asst-pips ${size}`} aria-hidden="true">
      {LEVELS.map((pip) => (
        <i key={pip} className={pip <= level ? "on" : undefined} style={{ animationDelay: `${120 + pip * 70}ms` }} />
      ))}
    </span>
  );
}

/** What the level means, in the assistant's own trade: how far off his reads of a player and of a kid are. */
function accuracyText({ assistant, readError, starsSharper }: AssistantPage): string {
  const points = plural(readError, "ponto", "pontos");
  const kids = starsSharper ? `e tira ${plural(starsSharper, "estrela", "estrelas")} de dúvida no potencial dos juniores` : "e vê os juniores como os olheiros";
  if (assistant.level === 5) return `No nível 5 ele quase não erra: no máximo ${points} na força que vê num jogador, e acerta o potencial dos juniores no primeiro ano.`;
  return `No nível ${assistant.level} ele erra até ${points} na força que vê num jogador, ${kids}.`;
}

function candidateNote(candidate: AssistantCandidate): string {
  if (!candidate.formerPlayer) return `sem clube · ${plural(candidate.years, "ano", "anos")} de auxiliar`;
  const role = GROUP_WORD[candidate.formerPlayer.group];
  return candidate.years ? `seu ex-${role} · parou há ${plural(candidate.years, "ano", "anos")}` : `seu ex-${role} · parou nesta virada`;
}

/** The assistant's screen (the approved assistant mock): who he is and how good, what he runs for the coach, his tips and who could replace him. */
export function Assistant() {
  const { engine } = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hasFailed, setFailed] = useState(false);
  const [isElevenOpen, setElevenOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      Promise.all([engine.assistant(), engine.read(KEYS), engine.scouting()]).then(
        ([page, state, scouting]) => isCurrent() && setLoaded({ page, state, watched: new Set(scouting.watchList) }),
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

  // Searching the market for his suggestions is the screen's heaviest work: once per read of the game.
  const suggestions = useMemo(
    () => (loaded?.page.tip && loaded.state.coachClubId ? signingSuggestions(loaded.state, loaded.page.assistant, loaded.page.tip, loaded.watched) : null),
    [loaded],
  );
  const tipKey = loaded?.page.tip ? `assistant:${loaded.page.assistant.id}:${loaded.page.tip.playerId}:${loaded.state.date}` : null;
  const weakShown = useCountUp(Math.round(loaded?.page.tip?.read ?? 0), tipKey);

  async function act(id: string, command: () => Promise<string | null>) {
    setBusyId(id);
    setRefusal(null);
    try {
      setRefusal(await command());
      await load();
    } catch {
      setRefusal("Não deu agora. Tente fora da rodada.");
    } finally {
      setBusyId(null);
    }
  }

  const hire = (candidate: AssistantCandidate) =>
    act(candidate.id, async () => {
      const answer = await engine.apply({ type: "hireAssistant", candidateId: candidate.id });
      return answer.refusal && REFUSALS[answer.refusal];
    });
  const fire = () =>
    act("fire", async () => {
      await engine.apply({ type: "fireAssistant" });
      return null;
    });
  const watch = (row: Suggestion) =>
    act(row.id, async () => {
      await engine.apply({ type: "watchPlayer", playerId: row.id, isWatched: !row.isWatched });
      return null;
    });

  if (hasFailed) return <p className="status error">O auxiliar não abriu. Volte ao clube e tente de novo.</p>;
  if (!loaded) return <p className="status">Chamando o auxiliar…</p>;

  const { page, state } = loaded;
  const { assistant, tip } = page;
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const isOwn = !assistant.since;
  const captain = page.captainName ? `, ${page.captainName} de capitão` : "";

  return (
    <div className="asst fills-screen">
      <div className="asst-side">
        <section className="stk asst-me" aria-labelledby="asst-name" style={lay(0)}>
          <div className="asst-who">
            <span key={assistant.id} className="asst-av-wrap">
              <Avatar name={assistant.name} size="lg" />
            </span>
            <div>
              <h1 id="asst-name">{assistant.name}</h1>
              <p>
                {isOwn ? "Auxiliar do clube" : assistant.formerPlayer ? `Seu auxiliar e seu ex-${GROUP_WORD[assistant.formerPlayer.group]}` : "Seu auxiliar"} · {assistant.age} anos
                <br />
                {isOwn ? "Já estava no clube quando você chegou" : `Com você desde ${formatMonthYear(assistant.since ?? state.date)}`}
              </p>
            </div>
          </div>
          <div className="asst-level">
            <div>
              <span className="lbl">Nível</span>
              <div className="asst-level-row" role="meter" aria-label="Nível do auxiliar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={assistant.level}>
                <Pips key={assistant.id} level={assistant.level} size="lg" />
                <b>
                  {assistant.level}
                  <small> de 5</small>
                </b>
              </div>
            </div>
            <div className="asst-wage">
              {isOwn ? (
                <>
                  <b>Sem custo</b>pago pelo clube
                </>
              ) : (
                <>
                  <b>{formatMoney(assistant.wage)}</b>por mês
                </>
              )}
            </div>
          </div>
          <p className="asst-acc">{accuracyText(page)}</p>
          {club && (
            <>
              <button className="btn y asst-pick" aria-expanded={isElevenOpen} aria-controls="asst-eleven" onClick={() => setElevenOpen(!isElevenOpen)}>
                <i className="ph-bold ph-strategy" aria-hidden="true" />
                Escalar time
              </button>
              <p className="asst-cap">
                Hoje ele escala o {page.formation}
                {captain}
              </p>
              {isElevenOpen && (
                <ol id="asst-eleven" className="asst-eleven" aria-label="Time do auxiliar">
                  {page.eleven.map((starter, index) => (
                    <li key={starter.playerId} style={{ animationDelay: `${index * 28}ms` }}>
                      <span className={`pos ${ROLE_LETTER[starter.role]}`} title={ROLE_NAME[starter.role]}>
                        {ROLE_LETTER[starter.role]}
                      </span>
                      <span className="asst-eleven-name">{starter.name}</span>
                      <b>{Math.round(starter.read)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {!isOwn && (
            <button className="btn flat sm asst-fire" disabled={busyId !== null} onClick={() => void fire()}>
              Dispensar e voltar ao auxiliar do clube
            </button>
          )}
        </section>
        <div style={lay(1)} className="asst-lay">
          <AssistantAreas onChange={() => void load()} />
        </div>
      </div>

      <section className="page asst-tips" aria-labelledby="asst-tips-title">
        <header className="asst-hd" style={lay(1)}>
          <h2 id="asst-tips-title">Dicas</h2>
          <span>Atualizadas hoje, {formatBarDate(state.date)}</span>
        </header>

        {!club && <p className="asst-empty">Sem clube, sem dicas. Ele espera você acertar com alguém.</p>}

        {tip && (
          <div className="asst-weak" style={lay(2)}>
            <div className="asst-weak-fig">
              <span className={`pos ${ROLE_LETTER[tip.role]}`}>{ROLE_LETTER[tip.role]}</span>
              <span className="asst-weak-big">{weakShown}</span>
            </div>
            <div>
              <q>
                “Seu {ROLE_NAME[tip.role].toLowerCase()} é o mais fraco do time: {tip.name}, {Math.round(tip.read)}.”
              </q>
              <p>
                {tip.backup
                  ? `O reserva, ${tip.backup.name}, tem ${Math.round(tip.backup.read)} e ${tip.backup.age} anos. `
                  : "Não há reserva da posição no elenco. "}
                Vale um {ROLE_NAME[tip.role].toLowerCase()} de {Math.round(readWorthSigning(tip))} ou mais.
              </p>
            </div>
          </div>
        )}

        {tip && suggestions && (
          <div className="asst-sg" style={lay(3)}>
            <h3>
              {ROLE_PLURAL[tip.role]} que ele indica <span>topam vir e cabem no orçamento de {formatMoney(suggestions.budget)}</span>
            </h3>
            {suggestions.rows.length === 0 && <p className="asst-empty">Ninguém que valha a pena cabe no orçamento agora. Ele volta a olhar na próxima janela.</p>}
            <ul aria-label="Indicações do auxiliar">
              {suggestions.rows.map((row) => {
                const from = row.clubId ? state.clubs[row.clubId] : undefined;
                return (
                  <li key={row.id} className="asst-sr">
                    {from ? <Crest club={from} size={28} /> : <i className="ph-bold ph-handshake asst-free" aria-hidden="true" />}
                    <div className="asst-sr-who">
                      <b>{row.name}</b>
                      <small>
                        {from?.shortName ?? "Sem clube"} · {row.age} anos · contrato até {row.contractUntil.slice(0, 4)}
                      </small>
                    </div>
                    <span className="asst-sr-f" title="Força, como ele vê">
                      {Math.round(row.read)}
                    </span>
                    <div className="asst-sr-m">
                      <b>{row.price ? formatMoney(row.price) : "Sem custo"}</b>
                      <small>{row.price ? "pedem pelo passe" : "chega de graça"}</small>
                    </div>
                    <span className={row.willing === "yes" ? "asst-sr-y" : "asst-sr-y mid"}>
                      <i className={row.willing === "yes" ? "ph-fill ph-check-circle" : "ph-fill ph-question"} aria-hidden="true" />
                      {row.willing === "yes" ? "Topa vir" : "Talvez"}
                    </span>
                    <div className="asst-sr-act">
                      <button
                        className="btn sm asst-eye"
                        aria-pressed={row.isWatched}
                        aria-label={`Observar ${row.name}`}
                        title={row.isWatched ? "Observando" : "Observar"}
                        disabled={busyId !== null}
                        onClick={() => void watch(row)}
                      >
                        <i className={row.isWatched ? "ph-fill ph-eye" : "ph-bold ph-eye"} aria-hidden="true" />
                      </button>
                      <Link className="btn sm go" to={`/market?jogador=${encodeURIComponent(row.id)}`} aria-label={`Fazer proposta por ${row.name}`} title="Fazer proposta">
                        <span className="asst-go-label">Proposta</span>
                        <i className="ph-bold ph-arrow-right" aria-hidden="true" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {club && (
          <div className="asst-more" style={lay(4)}>
            <p className="asst-mt">
              <i className="ph-bold ph-signature" aria-hidden="true" />
              <span>
                {!page.duties.contracts ? (
                  "Os contratos estão com você: ele não renova ninguém."
                ) : page.renewals.length ? (
                  <>
                    {page.renewals.slice(0, 3).map((renewal, index, shown) => (
                      <span key={renewal.playerId}>
                        <b>{renewal.name}</b>
                        {index < shown.length - 2 ? ", " : index === shown.length - 2 ? " e " : ""}
                      </span>
                    ))}
                    {page.renewals.length > 3 ? ` e mais ${page.renewals.length - 3}` : ""} {page.renewals.length === 1 ? "está" : "estão"} no último ano. Ele renova em{" "}
                    {formatDayMonth(page.nextReview)}; você muda isso na aba Contratos do clube.
                  </>
                ) : (
                  `Ninguém para renovar agora. Ele volta a olhar os contratos em ${formatDayMonth(page.nextReview)}.`
                )}
              </span>
            </p>
            <p className="asst-mt">
              <i className="ph-bold ph-strategy" aria-hidden="true" />
              <span>
                {page.duties.lineup ? (
                  <>
                    No dia do jogo ele escala <b>o melhor time</b> no {page.formation}; você muda o que quiser na escalação.
                  </>
                ) : (
                  <>
                    Escalação com você: fica <b>o seu último time</b>, e ele só troca quem não puder jogar.
                  </>
                )}
              </span>
            </p>
          </div>
        )}

        {club && (
          <div className="asst-hire" style={lay(5)}>
            <h3>{assistant.level < 5 ? "Auxiliares melhores" : "Ninguém melhor no mercado"}</h3>
            {refusal && (
              <p className="status error" role="status">
                {refusal}
              </p>
            )}
            <ul aria-label="Auxiliares para chamar">
              {page.candidates.map((candidate) => (
                <li key={candidate.id} className={candidate.formerPlayer ? "asst-hr former" : "asst-hr"}>
                  <Avatar name={candidate.name} size="sm" />
                  <div>
                    <b>{candidate.name}</b>
                    <small>{candidateNote(candidate)}</small>
                  </div>
                  <span className="asst-hr-lvl" aria-label={`Nível ${candidate.level}`}>
                    <Pips level={candidate.level} size="sm" />
                    <span>{candidate.level}</span>
                  </span>
                  <div className="asst-hr-pay">
                    <b>{formatMoney(candidate.wage)}</b>
                    <small>por mês</small>
                  </div>
                  <button className="btn sm" disabled={busyId !== null} aria-label={`Chamar ${candidate.name}`} onClick={() => void hire(candidate)}>
                    Chamar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
