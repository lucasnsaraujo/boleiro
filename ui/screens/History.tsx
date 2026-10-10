import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Club } from "../../src/data/clubs.js";
import type { GameState } from "../../src/sim/gameState.js";
import type { CrowdMark, MatchMark, TransferMark } from "../../src/sim/history/history.js";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { competitionKeyName } from "../format/competitionName.js";
import { formatMonthYear } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { championRoll, clubPast, coachCareer, rollKeys, scorerRoll, type CareerStint } from "../history/historySelectors.js";
import { usePlayRound } from "../hub/usePlayRound.js";
import "./history.css";

const HISTORY_KEYS = ["season", "coachClubId", "clubs", "history", "coach"] as const;
type HistoryState = Pick<GameState, (typeof HISTORY_KEYS)[number]>;
type Clubs = Readonly<Record<string, Club>>;

const TABS = [
  { id: "clube", title: "Clube" },
  { id: "campeoes", title: "Campeões" },
  { id: "artilheiros", title: "Artilheiros" },
  { id: "carreira", title: "Carreira" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const IDOLS_SHOWN = 8;

const isTabId = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Champions, top scorers, a club's records and idols, and the coach's career, kept across seasons. */
export function History() {
  const { engine, game } = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<HistoryState | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedTab, setPickedTab] = useState<TabId | null>(null);
  const [pickedClubId, setPickedClubId] = useState<string | null>(null);
  const round = usePlayRound(() => navigate("/hub"));

  useEffect(() => {
    let current = true;
    engine.read(HISTORY_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const keys = useMemo(() => (state ? rollKeys(state.clubs, state.coachClubId) : []), [state]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo a história…</p>;

  const clubId = pickedClubId ?? state.coachClubId ?? state.history.coach.stints.at(-1)?.clubId ?? null;
  const tabs = TABS.filter((tab) => tab.id !== "clube" || clubId);
  const asked = params.get("aba");
  const wanted = pickedTab ?? (isTabId(asked) ? asked : "clube");
  const shown = tabs.find((tab) => tab.id === wanted) ?? tabs[0];

  function openClub(id: string) {
    setPickedClubId(id);
    setPickedTab("clube");
  }

  return (
    <div className="history">
      <header className="history-head">
        <h1 className="screen-title">História</h1>
        <div className="history-tabs" role="tablist" aria-label="Seções">
          {tabs.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={tab.id === shown?.id} onClick={() => setPickedTab(tab.id)}>
              {tab.title}
            </button>
          ))}
        </div>
        <button className="btn-main" onClick={() => void round.play()} disabled={round.isPlaying}>
          {round.isPlaying ? "Jogando…" : state.coachClubId ? "Jogar rodada" : "Esperar propostas"}
        </button>
      </header>
      {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
      <div className="history-body" role="tabpanel" aria-label={shown?.title}>
        {shown?.id === "clube" && clubId && <ClubPanel state={state} clubId={clubId} />}
        {shown?.id === "campeoes" && <ChampionsPanel state={state} keys={keys} onOpenClub={openClub} />}
        {shown?.id === "artilheiros" && <ScorersPanel state={state} keys={keys} />}
        {shown?.id === "carreira" && <CareerPanel state={state} coachName={game.current?.coachName ?? "Técnico"} />}
      </div>
    </div>
  );
}

function ClubPanel({ state, clubId }: { state: HistoryState; clubId: string }) {
  const club = state.clubs[clubId];
  const past = clubPast(state, clubId);
  const titleCount = past.titles.reduce((sum, t) => sum + t.seasons.length, 0);
  if (!club) return null;
  return (
    <>
      <section className="history-band">
        <Crest club={club} size={64} />
        <h2 className="history-band-name">{club.shortName}</h2>
        <p className="history-count">
          <span className="history-count-n">{titleCount}</span>
          <span className="history-count-l">{titleCount === 1 ? "título" : "títulos"}</span>
        </p>
      </section>
      <div className="history-columns">
        <div>
          <section aria-labelledby="history-titles-title">
            <h3 id="history-titles-title" className="history-section-title">
              Títulos
            </h3>
            {past.titles.length === 0 ? (
              <p className="history-empty">Nenhum título desde {state.history.seasons[0]?.season ?? state.season}.</p>
            ) : (
              <ul className="history-list" aria-labelledby="history-titles-title">
                {past.titles.map((title) => (
                  <li key={title.key} className="history-line">
                    <span className="history-line-main">
                      <b className="history-times">{title.seasons.length}x</b> {competitionKeyName(title.key)}
                    </span>
                    <span className="history-line-side">{title.seasons.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="history-finishes-title">
            <h3 id="history-finishes-title" className="history-section-title">
              Campanhas
            </h3>
            {past.finishes.length === 0 ? (
              <p className="history-empty">A primeira temporada ainda não terminou.</p>
            ) : (
              <ul className="history-list" aria-labelledby="history-finishes-title">
                {past.finishes.map((finish) => (
                  <li key={finish.season} className="history-line">
                    <span className="history-line-main">{finish.season}</span>
                    <span className="history-line-side">
                      Série {finish.division} · <b>{finish.position}º</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div>
          <section aria-labelledby="history-records-title">
            <h3 id="history-records-title" className="history-section-title">
              Recordes
            </h3>
            <dl className="history-records">
              <RecordLine term="Maior vitória" mark={matchText(past.records.biggestWin, state.clubs)} />
              <RecordLine term="Maior derrota" mark={matchText(past.records.biggestLoss, state.clubs)} />
              <RecordLine term="Maior público" mark={crowdText(past.records.biggestCrowd, state.clubs)} />
              <RecordLine term="Maior venda" mark={transferText(past.records.recordSale, state.clubs, "para")} />
              <RecordLine term="Maior contratação" mark={transferText(past.records.recordSigning, state.clubs, "de")} />
            </dl>
          </section>
          <section aria-labelledby="history-idols-title">
            <h3 id="history-idols-title" className="history-section-title">
              Ídolos
            </h3>
            {past.idols.length === 0 ? (
              <p className="history-empty">Nenhum ídolo ainda.</p>
            ) : (
              <ol className="history-list" aria-labelledby="history-idols-title">
                {past.idols.slice(0, IDOLS_SHOWN).map((idol) => (
                  <li key={idol.playerId} className="history-line">
                    <span className="history-line-main">{idol.name}</span>
                    <span className="history-line-side">
                      {plural(idol.apps, "jogo", "jogos")} · {plural(idol.goals, "gol", "gols")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

type RecordText = { main: string; detail: string } | null;

function RecordLine({ term, mark }: { term: string; mark: RecordText }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        {mark ? mark.main : "–"}
        {mark && <small>{mark.detail}</small>}
      </dd>
    </div>
  );
}

const nameOf = (clubs: Clubs, id: string) => clubs[id]?.shortName ?? id;

function matchText(mark: MatchMark | null, clubs: Clubs): RecordText {
  if (!mark) return null;
  return { main: `${mark.goalsFor} x ${mark.goalsAgainst} ${nameOf(clubs, mark.opponentId)}`, detail: `${competitionKeyName(mark.competition)} ${mark.season}` };
}

function crowdText(mark: CrowdMark | null, clubs: Clubs): RecordText {
  if (!mark) return null;
  return { main: mark.crowd.toLocaleString("pt-BR"), detail: `x ${nameOf(clubs, mark.opponentId)}, ${competitionKeyName(mark.competition)} ${mark.season}` };
}

function transferText(mark: TransferMark | null, clubs: Clubs, preposition: "para" | "de"): RecordText {
  if (!mark) return null;
  const other = mark.otherClubId ? nameOf(clubs, mark.otherClubId) : preposition === "para" ? "o exterior" : "fora";
  return { main: formatMoney(mark.fee), detail: `${mark.name}, ${preposition} ${other}` };
}

function ChampionsPanel({ state, keys, onOpenClub }: { state: HistoryState; keys: readonly string[]; onOpenClub: (id: string) => void }) {
  const rows = championRoll(state.history, keys);
  if (rows.length === 0) return <p className="history-empty">Nenhum título decidido ainda.</p>;
  return (
    <table className="history-roll" aria-label="Campeões">
      <RollHead keys={keys} />
      <tbody>
        {rows.map((row) => (
          <tr key={row.season}>
            <th scope="row">
              {row.season}
              {row.isCurrent && <small>em andamento</small>}
            </th>
            {row.champions.map((championId, i) => {
              const champion = championId ? state.clubs[championId] : undefined;
              return (
                <td key={keys[i]}>
                  {champion ? (
                    <button className={championId === state.coachClubId ? "history-cell is-mine" : "history-cell"} onClick={() => onOpenClub(champion.id)}>
                      <Crest club={champion} size={20} />
                      <span>{champion.shortName}</span>
                    </button>
                  ) : (
                    <span className="history-none">–</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScorersPanel({ state, keys }: { state: HistoryState; keys: readonly string[] }) {
  const rows = scorerRoll(state.history, keys);
  if (rows.length === 0) return <p className="history-empty">A primeira temporada ainda não terminou.</p>;
  return (
    <table className="history-roll" aria-label="Artilheiros">
      <RollHead keys={keys} />
      <tbody>
        {rows.map((row) => (
          <tr key={row.season}>
            <th scope="row">{row.season}</th>
            {row.scorers.map((scorer, i) => {
              const club = scorer ? state.clubs[scorer.clubId] : undefined;
              return (
                <td key={keys[i]}>
                  {scorer ? (
                    <span className={scorer.clubId === state.coachClubId ? "history-cell is-mine" : "history-cell"}>
                      {club && <Crest club={club} size={20} />}
                      <span>{scorer.name}</span>
                      <b className="history-goals">{scorer.goals}</b>
                    </span>
                  ) : (
                    <span className="history-none">–</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RollHead({ keys }: { keys: readonly string[] }) {
  return (
    <thead>
      <tr>
        <th scope="col">Ano</th>
        {keys.map((key) => (
          <th key={key} scope="col">
            {competitionKeyName(key)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function exitText(stint: CareerStint): string {
  switch (stint.left) {
    case null:
      return "no cargo";
    case "fired":
      return stint.firedAt ? `demitido em ${stint.firedAt.position}º (meta ${stint.firedAt.targetPosition}º)` : "demitido";
    case "contractEnded":
      return "fim de contrato";
    case "moved":
      return "trocou de clube";
  }
}

function CareerPanel({ state, coachName }: { state: HistoryState; coachName: string }) {
  const stints = coachCareer(state.history.coach);
  const { coach } = state;
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const offers = coach.offers.length;
  return (
    <>
      <section className="history-band">
        {club && <Crest club={club} size={64} />}
        <div className="history-coach">
          <h2 className="history-band-name">{coachName}</h2>
          <p className="screen-sub">
            {club && coach.contract ? `${club.shortName} · ${formatMoney(coach.contract.salary)} por mês até ${coach.contract.untilSeason}` : "Sem clube"}
          </p>
        </div>
        <dl className="history-stats">
          <div>
            <dt>Reputação</dt>
            <dd>{coach.reputation}</dd>
          </div>
          <div>
            <dt>Títulos</dt>
            <dd>{state.history.coach.trophies.length}</dd>
          </div>
          <div>
            <dt>Demissões</dt>
            <dd>{state.history.coach.firings.length}</dd>
          </div>
        </dl>
      </section>
      {offers > 0 && (
        <p className="history-offers">
          <span>{plural(offers, "proposta", "propostas")} na mesa</span>
          <Link to="/offers" className="history-offers-link">
            Ver propostas
          </Link>
        </p>
      )}
      <section aria-labelledby="history-stints-title">
        <h3 id="history-stints-title" className="history-section-title">
          Clubes
        </h3>
        {stints.length === 0 ? (
          <p className="history-empty">Nenhum clube ainda.</p>
        ) : (
          <ul className="history-list" aria-labelledby="history-stints-title">
            {stints.map((stint) => {
              const at = state.clubs[stint.clubId];
              return (
                <li key={`${stint.clubId}-${stint.from}`} className="history-stint">
                  <span className="history-stint-club">
                    {at && <Crest club={at} size={22} />}
                    {at?.shortName ?? stint.clubId}
                  </span>
                  <span className="history-line-side">
                    {formatMonthYear(stint.from)} – {stint.until ? formatMonthYear(stint.until) : "hoje"}
                  </span>
                  <span className="history-line-side">{plural(stint.seasons, "temporada", "temporadas")}</span>
                  <span className="history-stint-titles">{stint.titles.length === 0 ? "–" : stint.titles.map(competitionKeyName).join(", ")}</span>
                  <span className={stint.left === "fired" ? "history-stint-exit is-fired" : "history-stint-exit"}>{exitText(stint)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
