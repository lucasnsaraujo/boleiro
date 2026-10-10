import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Club } from "../../src/data/clubs.js";
import type { Competition, GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { competitionName } from "../format/competitionName.js";
import { formatDayMonth } from "../format/formatGameDate.js";
import { nextMatch } from "../hub/hubSelectors.js";
import { usePlayRound } from "../hub/usePlayRound.js";
import {
  coachCompetitions,
  competitionStages,
  defaultStage,
  groupTables,
  knockoutTies,
  topScorers,
  type GroupTable,
  type TieView,
  type ZoneKey,
} from "../tables/competitionTables.js";
import "./tables.css";

const TABLES_KEYS = ["date", "season", "coachClubId", "clubs", "fixtures", "competitions", "calendar", "history", "players"] as const;
type TablesState = Pick<GameState, (typeof TABLES_KEYS)[number]>;
type Clubs = Readonly<Record<string, Club>>;

const SCORERS_SHOWN = 10;
// Up to two groups fit one under the other; more get a picker.
const GROUPS_SHOWN_TOGETHER = 2;

export function Tables() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<TablesState | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const round = usePlayRound(() => navigate("/hub"));

  useEffect(() => {
    let current = true;
    engine.read(TABLES_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const competitions = useMemo(() => (state ? coachCompetitions(state) : []), [state]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo as tabelas…</p>;

  const nextId = nextMatch(state)?.fixture.competitionId;
  const shown = competitions.find((c) => c.id === (pickedId ?? nextId)) ?? competitions[0];

  return (
    <div className="tables">
      <header className="tables-head">
        <h1 className="screen-title">Tabelas</h1>
        <div className="tabs" role="tablist" aria-label="Competições">
          {competitions.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === shown?.id} onClick={() => setPickedId(c.id)}>
              {competitionName(c)}
            </button>
          ))}
        </div>
        <button className="btn-main" onClick={() => void round.play()} disabled={round.isPlaying}>
          {round.isPlaying ? "Jogando…" : "Jogar rodada"}
        </button>
      </header>
      {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
      {shown && <CompetitionPanel key={shown.id} competition={shown} state={state} />}
    </div>
  );
}

function CompetitionPanel({ competition, state }: { competition: Competition; state: TablesState }) {
  const [picked, setPicked] = useState<number | null>(null);
  const stages = competitionStages(competition, state.calendar);
  const stage = picked ?? defaultStage(competition, state.coachClubId);
  const scorers = topScorers(competition, state, SCORERS_SHOWN);
  const name = stages[stage]?.name ?? competitionName(competition);

  return (
    <div className="tables-body" role="tabpanel" aria-label={competitionName(competition)}>
      <section className="tables-main">
        {stages.length > 1 && (
          <div className="stages" role="group" aria-label="Fases">
            {stages.map((s) => (
              <button key={s.index} aria-pressed={s.index === stage} disabled={!s.isDrawn} onClick={() => setPicked(s.index)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        {competition.stages[stage]?.kind === "knockout" ? (
          <TieList name={name} ties={knockoutTies(competition, stage, state.fixtures)} clubs={state.clubs} coachClubId={state.coachClubId} />
        ) : (
          <GroupStage key={stage} name={competitionName(competition)} {...groupTables(competition, stage, state.fixtures)} clubs={state.clubs} coachClubId={state.coachClubId} />
        )}
      </section>
      <aside className="scorers" aria-labelledby="scorers-title">
        <h2 id="scorers-title" className="tables-section-title">
          Artilheiros
        </h2>
        {scorers.length === 0 ? (
          <p className="status">Ninguém marcou ainda.</p>
        ) : (
          <ol className="scorer-list" aria-labelledby="scorers-title">
            {scorers.map((s, i) => {
              const club = state.clubs[s.clubId];
              return (
                <li key={s.playerId} className={s.clubId === state.coachClubId ? "scorer mine" : "scorer"}>
                  <span className="scorer-rank">{i + 1}</span>
                  {club ? <Crest club={club} size={18} /> : <span />}
                  <Link className="scorer-name" to={`/squad/${s.playerId}`}>
                    {s.name}
                  </Link>
                  <span className="scorer-goals">{s.goals}</span>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}

type GroupStageProps = { name: string; groups: GroupTable[]; zones: ZoneKey[]; clubs: Clubs; coachClubId: string | null };

function GroupStage({ name, groups, zones, clubs, coachClubId }: GroupStageProps) {
  const ownGroup = Math.max(0, coachClubId ? groups.findIndex((g) => g.rows.some((row) => row.clubId === coachClubId)) : 0);
  const [picked, setPicked] = useState(ownGroup);
  const shown = groups.length > GROUPS_SHOWN_TOGETHER ? groups.slice(picked, picked + 1) : groups;

  return (
    <>
      {groups.length > GROUPS_SHOWN_TOGETHER && (
        <div className="group-picker" role="group" aria-label="Grupos">
          {groups.map((g, i) => (
            <button key={g.label} aria-label={g.label ?? undefined} aria-pressed={i === picked} onClick={() => setPicked(i)}>
              {g.label?.replace("Grupo ", "")}
            </button>
          ))}
        </div>
      )}
      {shown.map((group) => (
        <StandingsTable key={group.label ?? name} label={group.label ?? name} group={group} clubs={clubs} coachClubId={coachClubId} />
      ))}
      {zones.length > 0 && (
        <p className="zone-key">
          {zones.map((z) => (
            <span key={z.zone} className={`zone-${z.zone}`}>
              {z.label}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function StandingsTable({ label, group, clubs, coachClubId }: { label: string; group: GroupTable; clubs: Clubs; coachClubId: string | null }) {
  return (
    <table className="standings" aria-label={label}>
      {group.label && <caption>{group.label}</caption>}
      <thead>
        <tr>
          <th scope="col" className="st-pos">
            #
          </th>
          <th scope="col" className="st-club">
            Clube
          </th>
          <th scope="col" title="Jogos">
            J
          </th>
          <th scope="col" title="Vitórias">
            V
          </th>
          <th scope="col" title="Empates">
            E
          </th>
          <th scope="col" title="Derrotas">
            D
          </th>
          <th scope="col" title="Saldo de gols">
            SG
          </th>
          <th scope="col" className="st-pts" title="Pontos">
            P
          </th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row) => {
          const club = clubs[row.clubId];
          const isMine = row.clubId === coachClubId;
          return (
            <tr key={row.clubId} className={isMine ? "mine" : undefined} aria-current={isMine ? "true" : undefined}>
              <td className={row.zone ? `st-pos zone-${row.zone}` : "st-pos"}>{row.position}</td>
              <td className="st-club">
                <span className="st-club-in">
                  {club && <Crest club={club} size={20} />}
                  <span>{club?.shortName ?? row.clubId}</span>
                </span>
              </td>
              <td>{row.played}</td>
              <td>{row.wins}</td>
              <td>{row.draws}</td>
              <td>{row.losses}</td>
              <td>{signed(row.goalDifference)}</td>
              <td className="st-pts">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const LEG_NAMES = ["Ida", "Volta"];

/** A leg's score from the first club's side, so it reads the same way as the aggregate. */
function legLine(tie: TieView): string {
  const [first] = tie.clubIds;
  return tie.legs
    .map((leg, i) => {
      const legName = tie.legs.length > 1 ? `${LEG_NAMES[i] ?? `${i + 1}º jogo`} ` : "";
      if (leg.homeGoals === null || leg.awayGoals === null) return `${legName}${formatDayMonth(leg.date)}`;
      const [mine, theirs] = leg.homeId === first ? [leg.homeGoals, leg.awayGoals] : [leg.awayGoals, leg.homeGoals];
      return `${legName}${mine} x ${theirs}`;
    })
    .join(" · ");
}

function TieList({ name, ties, clubs, coachClubId }: { name: string; ties: TieView[]; clubs: Clubs; coachClubId: string | null }) {
  const side = (clubId: string, tie: TieView, home: boolean) => {
    const club = clubs[clubId];
    const state = tie.winnerId === null ? "" : tie.winnerId === clubId ? " won" : " lost";
    return (
      <span className={`tie-side${home ? " home" : ""}${state}`}>
        {home && <span className="tie-name">{club?.shortName ?? clubId}</span>}
        {club && <Crest club={club} size={22} />}
        {!home && <span className="tie-name">{club?.shortName ?? clubId}</span>}
      </span>
    );
  };
  return (
    <ul className="ties" aria-label={name}>
      {ties.map((tie) => {
        const [first, second] = tie.clubIds;
        const isMine = coachClubId !== null && tie.clubIds.includes(coachClubId);
        return (
          <li key={`${first}-${second}`} className={isMine ? "tie mine" : "tie"}>
            {side(first, tie, true)}
            <span className="tie-score">
              <span className="box">{tie.aggregate?.[0] ?? ""}</span>
              <span className="box">{tie.aggregate?.[1] ?? ""}</span>
            </span>
            {side(second, tie, false)}
            <span className="tie-legs">
              {legLine(tie)}
              {tie.onPenalties && " · pên."}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
