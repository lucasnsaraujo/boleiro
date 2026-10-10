import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { calendarMonths, type CalendarEntry, type Outcome } from "../calendar/calendarMonths.js";
import { Crest } from "../clubs/Crest.js";
import { formatRowDate, monthName } from "../format/formatGameDate.js";
import { usePlayRound } from "../hub/usePlayRound.js";
import "./calendar.css";

const CALENDAR_KEYS = ["date", "season", "coachClubId", "clubs", "fixtures", "competitions"] as const;
type CalendarState = Pick<GameState, (typeof CALENDAR_KEYS)[number]>;

const OUTCOME_LETTERS: Record<Outcome, string> = { win: "V", draw: "E", loss: "D" };

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function Calendar() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<CalendarState | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const round = usePlayRound(() => navigate("/hub"));

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

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo o calendário…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const shown = months.find((m) => m.month === (picked ?? Number(state.date.slice(5, 7))));
  const games = (entries: readonly CalendarEntry[]) => entries.filter((e) => e.kind === "match").length;

  return (
    <div className="calendar">
      <header className="calendar-head">
        <div>
          <h1 className="screen-title">Calendário {state.season}</h1>
          <p className="screen-sub">{club ? club.shortName : "Sem clube"}</p>
        </div>
        <button className="btn-main" onClick={() => void round.play()} disabled={round.isPlaying}>
          {round.isPlaying ? "Jogando…" : "Jogar rodada"}
        </button>
      </header>
      {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
      <div className="months" role="group" aria-label="Meses">
        {months.map(({ month, entries, hasWindow }) => {
          const count = games(entries);
          const name = capitalized(monthName(month));
          return (
            <button
              key={month}
              className={hasWindow ? "month in-window" : "month"}
              aria-pressed={month === shown?.month}
              aria-label={`${name}, ${plural(count, "jogo", "jogos")}`}
              onClick={() => setPicked(month)}
            >
              <span className="month-name">{monthName(month).slice(0, 3)}</span>
              <span className="month-games">{count > 0 ? plural(count, "jogo", "jogos") : "–"}</span>
            </button>
          );
        })}
      </div>
      <p className="months-key">
        <span className="window-mark" aria-hidden="true" /> janela de transferências
      </p>
      {shown && (
        <section className="month-list" aria-labelledby="month-title">
          <h2 id="month-title" className="month-title">
            {capitalized(monthName(shown.month))}
          </h2>
          {shown.entries.length === 0 ? (
            <p className="status">Sem jogos em {monthName(shown.month)}.</p>
          ) : (
            <ul aria-labelledby="month-title">
              {shown.entries.map((entry) => (
                <CalendarRow key={entry.kind === "match" ? entry.fixtureId : `${entry.date}-window`} entry={entry} state={state} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function CalendarRow({ entry, state }: { entry: CalendarEntry; state: CalendarState }) {
  const isToday = entry.date === state.date;
  if (entry.kind === "window") {
    return (
      <li className="cal-row window">
        <span className="cal-date">{formatRowDate(entry.date)}</span>
        <span className="cal-window">{entry.opens ? "Abre a janela de transferências" : "Fecha a janela de transferências"}</span>
      </li>
    );
  }
  const opponent = state.clubs[entry.opponentId];
  const { result } = entry;
  return (
    <li className={isToday ? "cal-row today" : "cal-row"}>
      <span className="cal-date">{isToday ? "Hoje" : formatRowDate(entry.date)}</span>
      <span className="cal-competition">{entry.competition}</span>
      <span className="cal-side">{entry.isHome ? "casa" : "fora"}</span>
      <span className="cal-opponent">
        {opponent && <Crest club={opponent} size={22} />}
        <span>{opponent?.shortName ?? entry.opponentId}</span>
      </span>
      {result ? (
        <span className="cal-result">
          <span className="box">{result.homeGoals}</span>
          <span className="box">{result.awayGoals}</span>
          <span className={`cal-outcome ${result.outcome}`} title={result.onPenalties ? "nos pênaltis" : undefined}>
            {OUTCOME_LETTERS[result.outcome]}
            {result.onPenalties && <small> pên.</small>}
          </span>
        </span>
      ) : (
        <span className="cal-result" />
      )}
    </li>
  );
}
