import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatDayMonth, formatRowDate, monthName } from "@boleiro/game-client/format/formatGameDate";
import { useServices } from "../app/ServicesContext.js";
import {
  calendarMonths,
  calendarPage,
  matchAbsences,
  pageFor,
  turnPage,
  upcomingMatches,
  type Absence,
  type MatchEntry,
  type Outcome,
  type PageMatch,
  type UpcomingMatch,
  type WindowRibbon,
} from "../calendar/calendarMonths.js";
import { clubFaceOf, type ClubFace } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { DerbyBadgeOf } from "../rivalries/DerbyBadge.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { useMatchFile } from "../matchPage/MatchFile.js";
import "./calendar.css";

const CALENDAR_KEYS = ["date", "season", "coachClubId", "clubs", "fixtures", "competitions", "players", "discipline", "hasMidSeasonWindow", "nations"] as const;
type CalendarState = Pick<GameState, (typeof CALENDAR_KEYS)[number]>;

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const OUTCOMES: Record<Outcome, { letter: string; word: string }> = {
  win: { letter: "V", word: "vitória" },
  draw: { letter: "E", word: "empate" },
  loss: { letter: "D", word: "derrota" },
};
const ABSENCE_WORDS: Record<Absence["reason"], string> = { injured: "lesionado", suspended: "suspenso" };
// The next game plus the three after it, as the mock's "Em seguida" shows.
const COMING = 4;
const SHOWN_ABSENCES = 2;

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const side = ({ isHome, isNeutral }: Pick<MatchEntry, "isHome" | "isNeutral">) => (isNeutral ? "campo neutro" : isHome ? "casa" : "fora");

type Turn = { start: IsoDate; direction: "back" | "on" };

export function Calendar() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<CalendarState | null>(null);
  const [failed, setFailed] = useState(false);
  const [turn, setTurn] = useState<Turn | null>(null);
  const round = usePlayRound(() => navigate("/hub"));
  const matchFile = useMatchFile();

  useEffect(() => {
    let current = true;
    engine.read(CALENDAR_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const months = useMemo(() => (state ? calendarMonths(state) : []), [state]);
  const start = turn?.start ?? (state ? pageFor(state.season, state.date) : null);
  const page = useMemo(() => (state && start ? calendarPage(state, start) : null), [state, start]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !page) return <p className="status">Abrindo o calendário…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const shownMonths = new Set(page.months.map((m) => m.month));
  const coming = upcomingMatches(state, COMING);
  const [next, ...following] = coming;
  const go = (to: IsoDate) => setTurn({ start: to, direction: to < page.start ? "back" : "on" });

  return (
    <div className="agenda fills-screen">
      <h1 className="sr-only">Calendário {state.season}</h1>
      <section className="page agenda-cal" aria-labelledby="agenda-title">
        <header className="agenda-head">
          <h2 id="agenda-title">{page.title}</h2>
          <div className="agenda-months" role="group" aria-label="Meses">
            {months.map(({ month, entries }) => {
              const count = entries.filter((e) => e.kind === "match").length;
              return (
                <button
                  key={month}
                  aria-pressed={shownMonths.has(month)}
                  aria-label={`${capitalized(monthName(month))}, ${plural(count, "jogo", "jogos")}`}
                  title={`${capitalized(monthName(month))} · ${plural(count, "jogo", "jogos")}`}
                  onClick={() => go(pageFor(state.season, `${state.season}-${String(month).padStart(2, "0")}-01`))}
                >
                  {monthName(month).slice(0, 3)}
                </button>
              );
            })}
          </div>
          <button className="agenda-turn" aria-label="Semanas anteriores" disabled={!page.hasPrevious} onClick={() => go(turnPage(state.season, page.start, -1))}>
            <i className="ph-bold ph-caret-left" aria-hidden="true" />
          </button>
          <button className="agenda-turn" aria-label="Próximas semanas" disabled={!page.hasNext} onClick={() => go(turnPage(state.season, page.start, 1))}>
            <i className="ph-bold ph-caret-right" aria-hidden="true" />
          </button>
        </header>
        <div className="agenda-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div key={page.start} className="agenda-days" data-turn={turn?.direction}>
          {page.days.map((day) => (
            <div
              key={day.date}
              className={["agenda-day", !day.isInSeason && "off", day.isPast && "past", day.isToday && "today"].filter(Boolean).join(" ")}
              style={{ gridRow: day.row, gridColumn: day.column }}
              aria-hidden="true"
            >
              <span className="agenda-n">
                {day.day}
                {day.day === 1 && ` ${monthName(Number(day.date.slice(5, 7))).slice(0, 3)}`}
                {day.isToday && <span className="agenda-today-tag">Hoje</span>}
              </span>
            </div>
          ))}
          {page.months.map(({ month, matches, windows }) =>
            matches.length + windows.length === 0 ? null : (
              <ul key={month} className="agenda-entries" aria-label={capitalized(monthName(month))}>
                {matches.map((match) => (
                  <MatchChip key={match.fixtureId} match={match} clubId={state.coachClubId} opponent={clubFaceOf(state.clubs, match.opponentId) ?? undefined} isToday={match.date === state.date} onOpen={matchFile.open} />
                ))}
                {windows.map((ribbon) => (
                  <WindowMark key={ribbon.opensOn} ribbon={ribbon} />
                ))}
              </ul>
            ),
          )}
        </div>
      </section>

      <aside className="agenda-side">
        <section className="stk agenda-next" aria-labelledby="agenda-next-title">
          <span className="lbl">Hoje · {formatBarDate(state.date)}</span>
          {next ? (
            <NextMatch match={next} state={state} />
          ) : (
            <>
              <h3 id="agenda-next-title">{club ? "Nenhum jogo marcado" : "Sem clube"}</h3>
              <p className="agenda-next-none">{club ? "A temporada do clube acabou." : "Sem clube, sem jogos. As propostas chegam com os dias."}</p>
            </>
          )}
          <button className="btn y agenda-play" onClick={() => void round.play()} disabled={round.isPlaying}>
            <i className={club ? "ph-bold ph-soccer-ball" : "ph-bold ph-hourglass-medium"} aria-hidden="true" />
            {playRoundLabel(round.isPlaying, club !== undefined)}
          </button>
          {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
        </section>
        {following.length > 0 && (
          <section className="stk agenda-coming" aria-labelledby="agenda-coming-title">
            <h3 id="agenda-coming-title">Em seguida</h3>
            <ul>
              {following.map((match) => {
                const opponent = clubFaceOf(state.clubs, match.opponentId);
                return (
                  <li key={match.fixtureId}>
                    <span className="agenda-coming-date">
                      {formatRowDate(match.date)}
                      {match.date.slice(5, 7) !== state.date.slice(5, 7) && <small> {monthName(Number(match.date.slice(5, 7))).slice(0, 3)}</small>}
                    </span>
                    <span aria-hidden="true">{opponent && <Crest club={opponent} size={22} />}</span>
                    <span>
                      <b>{opponent?.shortName ?? match.opponentId}</b>
                      <small>
                        {match.label} · {side(match)}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>
      {matchFile.file}
    </div>
  );
}

function MatchChip({ match, clubId, opponent, isToday, onOpen }: { match: PageMatch; clubId: string | null; opponent: ClubFace | undefined; isToday: boolean; onOpen: (fixtureId: string) => void }) {
  const { result } = match;
  // The coach's goals first, as the outcome letter reads.
  const score = result
    ? `${match.isHome ? result.homeGoals : result.awayGoals}×${match.isHome ? result.awayGoals : result.homeGoals}${result.isAfterExtraTime ? " (prorr.)" : ""}${result.onPenalties ? " pên." : ""} · `
    : "";
  return (
    <li
      className={result ? `agenda-match played ${result.outcome}` : "agenda-match"}
      style={{ gridRow: match.row, gridColumn: match.column, ["--stack" as string]: match.stack }}
      title={match.postponedFrom && `Adiado de ${formatDayMonth(match.postponedFrom)}`}
    >
      {result && <button type="button" className="agenda-open" aria-label={`Ficha do jogo contra ${opponent?.shortName ?? match.opponentId}`} onClick={() => onOpen(match.fixtureId)} />}
      <span className="sr-only">{isToday ? "Hoje" : formatRowDate(match.date)}, </span>
      {clubId === match.sideId && <DerbyBadgeOf homeId={clubId} awayId={match.opponentId} />}
      <span className="agenda-match-crest" aria-hidden="true">
        {opponent && <Crest club={opponent} size={22} />}
      </span>
      <span className="agenda-match-text">
        <b>{opponent?.shortName ?? match.opponentId}</b>
        <small>
          {score}
          {match.competition}
          {match.postponedFrom && <span className="sr-only"> · adiado de {formatDayMonth(match.postponedFrom)}</span>}
          {match.postponedFrom && <span aria-hidden="true"> · adiado</span>} · {side(match)}
        </small>
      </span>
      {result && (
        <span className="agenda-res">
          <span aria-hidden="true">{OUTCOMES[result.outcome].letter}</span>
          <span className="sr-only">, {OUTCOMES[result.outcome].word}</span>
        </span>
      )}
    </li>
  );
}

function WindowMark({ ribbon }: { ribbon: WindowRibbon }) {
  const { status, opensOn, closesOn } = ribbon;
  return (
    <li className="agenda-window" style={{ gridRow: ribbon.row }}>
      <i className="ph-fill ph-flag-banner" aria-hidden="true" />
      {status === "opens" && (
        <>
          <span>Abre a janela de transferências</span>
          <span className="agenda-window-when">
            {formatDayMonth(opensOn)} a {formatDayMonth(closesOn)}
          </span>
        </>
      )}
      {status === "closes" && (
        <>
          <span>Fecha a janela de transferências</span>
          <span className="agenda-window-when">{formatDayMonth(closesOn)}</span>
        </>
      )}
      {status === "open" && (
        <>
          <span>Janela de transferências aberta</span>
          <span className="agenda-window-when">até {formatDayMonth(closesOn)}</span>
        </>
      )}
    </li>
  );
}

function NextMatch({ match, state }: { match: UpcomingMatch; state: CalendarState }) {
  // The coach's side in it: his club, or his national team.
  const coachSide = clubFaceOf(state.clubs, match.sideId) ?? undefined;
  const opponent = clubFaceOf(state.clubs, match.opponentId) ?? undefined;
  const [home, away] = match.isHome ? [coachSide, opponent] : [opponent, coachSide];
  const ground = match.ground ?? (match.isNeutral ? "Campo neutro" : home?.stadium);
  const absences = matchAbsences(state, match);
  const isToday = match.date === state.date;
  return (
    <>
      <h3 id="agenda-next-title">{match.label}</h3>
      {state.coachClubId === match.sideId && (
        <div className="agenda-derby">
          <DerbyBadgeOf homeId={match.sideId} awayId={match.opponentId} isNamed />
        </div>
      )}
      <div className="agenda-vs">
        {home && <Crest club={home} size={56} />}
        <span className="agenda-x" aria-hidden="true">
          ×
        </span>
        {away && <Crest club={away} size={56} />}
      </div>
      <dl>
        {!isToday && (
          <>
            <dt>Quando</dt>
            <dd>{formatBarDate(match.date)}</dd>
          </>
        )}
        {ground && (
          <>
            <dt>Onde</dt>
            <dd>{ground}</dd>
          </>
        )}
        <dt>Desfalques</dt>
        <dd>
          {absences.length === 0
            ? "Nenhum"
            : absences.slice(0, SHOWN_ABSENCES).map(({ name, reason }, index) => (
                <span key={index}>
                  {name}, {ABSENCE_WORDS[reason]}
                </span>
              ))}
          {absences.length > SHOWN_ABSENCES && <span>e mais {absences.length - SHOWN_ABSENCES}</span>}
        </dd>
      </dl>
    </>
  );
}
