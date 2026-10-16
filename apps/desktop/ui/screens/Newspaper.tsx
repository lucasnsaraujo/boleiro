import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatGameDate, formatMatchDate } from "@boleiro/game-client/format/formatGameDate";
import type { Edition, EditionTitle, Story } from "@boleiro/game-client/newspaper/roundNewspaper";
import { useServices } from "../app/ServicesContext.js";
import { clubFaceOf } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import "./newspaper.css";

const KEYS = ["season", "clubs", "coachClubId"] as const;
type PaperState = Pick<GameState, (typeof KEYS)[number]>;
type Loaded = { state: PaperState; edition: Edition | null; editions: EditionTitle[] };

// The archive column fits seven editions at 1280x800 (mock design/mocks/newspaper.html); older ones open on request.
const ARCHIVE = 7;
// The side column fits four stories under the masthead; the rest run in the lead's columns.
const SIDE_STORIES = 4;
const KICKER_CLASSES: Record<Story["kind"], string> = { match: "", event: "v", signing: "m", sacking: "d", upset: "z", rivalry: "q", var: "var", controversy: "" };

/** The round's newspaper: the edition of the coach's last match day, or of the day picked in the archive. */
export function Newspaper() {
  const { engine } = useServices();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? undefined;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [isArchiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(KEYS), engine.newspaper(date), engine.newspaperEditions()]).then(
      ([state, edition, editions]) => current && setLoaded({ state, edition, editions }),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine, date]);

  if (failed) return <p className="status error">O jornal não chegou. Volte ao clube e tente de novo.</p>;
  if (!loaded) return <p className="status">Buscando o jornal…</p>;
  const { state, edition, editions } = loaded;
  if (!edition) {
    return (
      <div className="paper-empty">
        <h1 className="screen-title">Jornal do Boleiro</h1>
        <p>O jornal sai depois do primeiro jogo da temporada.</p>
        <Link className="btn" to="/hub">
          Voltar ao clube
        </Link>
      </div>
    );
  }

  const shown = isArchiveOpen ? editions : editions.slice(0, ARCHIVE);
  return (
    <div className="paper fills-screen">
      <Sheet state={state} edition={edition} number={editions.length - editions.findIndex((e) => e.date === edition.date)} />
      <aside className="paper-eds" aria-label="Edições">
        <h2>Edições</h2>
        <ul>
          {shown.map((title, index) => (
            <li key={title.date}>
              <button className={title.date === edition.date ? "paper-ed on" : "paper-ed"} aria-current={title.date === edition.date ? "page" : undefined} onClick={() => setParams(index === 0 ? {} : { date: title.date })}>
                <small>
                  {index === 0 ? "Última" : formatBarDate(title.date)}
                  {title.label && ` · ${title.label}`}
                </small>
                <b>{title.headline}</b>
              </button>
            </li>
          ))}
        </ul>
        {editions.length > ARCHIVE && (
          <button className="btn sm flat" onClick={() => setArchiveOpen(!isArchiveOpen)}>
            <i className="ph-bold ph-archive" aria-hidden="true" />
            {isArchiveOpen ? "Só as últimas" : "Edições mais antigas"}
          </button>
        )}
      </aside>
    </div>
  );
}

function Sheet({ state, edition, number }: { state: PaperState; edition: Edition; number: number }) {
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const name = (id: string) => edition.names[id] ?? id;
  const { lead, match, next, ownPlace } = edition;
  const home = match && clubFaceOf(state.clubs, match.homeId);
  const away = match && clubFaceOf(state.clubs, match.awayId);
  const goals = (lead?.body ?? "").match(/(Gols: .*|Sem gols\.)$/)?.[0] ?? "";
  const deck = club && ownPlace ? `${club.shortName} chega a ${ownPlace.points} pontos e ${ownPlace.position === 1 ? "lidera" : `é o ${ownPlace.position}º`} ${edition.results.title ? `da ${edition.results.title}` : "na tabela"}.` : match ? goals : lead?.body;
  const isOwn = (story: Story) => story.kind === "event" && story.clubIds[0] === state.coachClubId;
  const sideStories = edition.side.filter((story) => !isOwn(story)).slice(0, SIDE_STORIES);
  const ownStories = edition.side.filter((story) => !sideStories.includes(story));
  return (
    <article className="paper-sheet" aria-label={`Jornal do Boleiro, ${formatGameDate(edition.date)}`}>
      <span className="paper-tape l" aria-hidden="true" />
      <span className="paper-tape r" aria-hidden="true" />
      <header className="paper-mast">
        <div className="l">
          <b>{club?.stadium ?? "Brasil"}</b>
          <br />
          {capitalised(formatMatchDate(edition.date))} de {edition.date.slice(0, 4)}
        </div>
        <h1>
          <span>Jornal do</span>Boleiro
        </h1>
        <div className="r">
          <b>{edition.round.endsWith("rodada") ? `Edição da ${edition.round}` : "Edição do dia"}</b>
          <br />
          Temporada {state.season} · nº {number} · R$ 4,00
        </div>
      </header>
      <div className="paper-dl">
        <span>{[edition.results.title, "Mercado", "Bastidores"].filter(Boolean).join(" · ")}</span>
        {next && (
          <span>
            {capitalised(formatMatchDate(next.date).split(",")[0] ?? "")} tem {name(next.homeId)} × {name(next.awayId)}
          </span>
        )}
      </div>
      <div className="paper-body">
        <div className="paper-lead">
          {lead && <span className="paper-kick">{lead.kicker}</span>}
          <h2>{lead?.headline}</h2>
          {deck && <p className="paper-deck">{deck}</p>}
          {match?.result && (
            <>
              <div className="paper-board" aria-label={`${name(match.homeId)} ${match.result.homeGoals} a ${match.result.awayGoals} ${name(match.awayId)}`}>
                <div className="t">
                  {home && <Crest club={home} size={30} />}
                  {name(match.homeId)}
                </div>
                <div className="s">
                  {match.result.homeGoals}
                  <span>×</span>
                  {match.result.awayGoals}
                </div>
                <div className="t a">
                  {name(match.awayId)}
                  {away && <Crest club={away} size={30} />}
                </div>
              </div>
              <div className="paper-gls">
                <div>{ownPlace ? goals : ""}</div>
                <div>{state.clubs[match.homeId]?.stadium}</div>
              </div>
            </>
          )}
          {ownStories.length > 0 && (
            <div className="paper-cols">
              {ownStories.map((story) => (
                <p key={`${story.date}${story.headline}`}>
                  <b>{story.kicker === "Bastidores" ? "" : `${story.kicker}: `}{story.headline}.</b> {story.body}
                </p>
              ))}
            </div>
          )}
          {edition.table.length > 0 && (
            <div className="paper-tbl">
              <b>Topo da tabela</b>
              {edition.table.map((row, index) => (
                <span key={row.clubId} className={row.clubId === state.coachClubId ? "own" : undefined}>
                  {index + 1} {name(row.clubId)} <b>{row.points}</b>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="paper-side">
          {sideStories.length === 0 && <p className="paper-quiet">Dia calmo no futebol brasileiro.</p>}
          {sideStories.map((story) => (
            <div key={`${story.date}${story.kind}${story.headline}`} className={story.kind === "rivalry" ? "paper-st quote" : "paper-st"}>
              <span className={`paper-kick ${KICKER_CLASSES[story.kind]}`}>
                {story.kind === "var" && <i className="ph-fill ph-monitor-play" aria-hidden="true" />}
                {story.kicker}
              </span>
              <h3>{story.headline}</h3>
              {story.body && <p>{story.body}</p>}
            </div>
          ))}
        </div>
      </div>
      {edition.results.lines.length > 0 && (
        <div className="paper-res">
          <span className="h">
            Resultados
            <br />
            {edition.round || edition.results.title}
          </span>
          {edition.results.lines.map((line) => (
            <span key={line.homeId}>
              {name(line.homeId)}{" "}
              <b>
                {line.homeGoals} × {line.awayGoals}
              </b>{" "}
              {name(line.awayId)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
