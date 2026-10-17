import type { ReactNode } from "react";
import type { ClubFace } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import type { TieBreak } from "@boleiro/engine/sim/tieBreaks";
import type { GroupTable } from "./competitionTables.js";

type Clubs = Readonly<Record<string, ClubFace>>;

// How a level tie goes on, as the card under the bracket tells the coach.
const TIE_BREAK_NOTES: Record<TieBreak, ReactNode> = {
  extraTime: (
    <>
      vai para a <b>prorrogação</b> e, se seguir empatado, para os <b>pênaltis</b>
    </>
  ),
  penalties: (
    <>
      vai direto para os <b>pênaltis</b>
    </>
  ),
  betterSeed: (
    <>
      classifica o <b>melhor colocado</b>
    </>
  ),
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const nameOf = (clubs: Clubs, id: string) => clubs[id]?.shortName ?? id;

/** The coach's group (or the first) as it stands, in the bracket's bottom row. */
export function GroupCard({ group, clubs, coachClubId }: { group: GroupTable; clubs: Clubs; coachClubId: string | null }) {
  const label = group.label ?? "Grupo";
  return (
    <section className="stk bk-group" aria-label={label}>
      <h3>
        {label} <small>fase de grupos</small>
      </h3>
      <table className="tb" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col" className="l">
              Clube
            </th>
            <th scope="col" title="Pontos">
              P
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
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const club = clubs[row.clubId];
            const isMine = row.clubId === coachClubId;
            return (
              <tr key={row.clubId} className={isMine ? "me" : undefined} aria-current={isMine ? "true" : undefined}>
                <td className="bk-pos">
                  <span className={row.zone === "advance" ? "bk-q" : "bk-q no"} aria-hidden="true" />
                  {row.position}
                </td>
                <td className="l bk-club">
                  <span>
                    {club && <Crest club={club} size={20} />}
                    {nameOf(clubs, row.clubId)}
                  </span>
                </td>
                <td className="bk-pts">{row.points}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.draws}</td>
                <td>{row.losses}</td>
                <td>{signed(row.goalDifference)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** The coach's next continental match with its first leg when it is a return, or why there is none. */
export type NextTie =
  | { title: string; sub: string; homeId: string; awayId: string; date: string; ground: string | null; firstLeg: string | null; isTwoLegged: boolean; tieBreak: TieBreak }
  | { title: string; sub: string; none: string };

export function NextTieCard({ next, clubs }: { next: NextTie; clubs: Clubs }) {
  if ("none" in next) {
    return (
      <section className="stk bk-next" aria-label={next.title}>
        <h3>
          {next.title} <small>{next.sub}</small>
        </h3>
        <p className="tables-none">{next.none}</p>
      </section>
    );
  }
  const home = clubs[next.homeId];
  const away = clubs[next.awayId];
  return (
    <section className="stk bk-next" aria-label={next.title}>
      <h3>
        {next.title} <small>{next.sub}</small>
      </h3>
      <div>
        <div className="bk-duel">
          {home && <Crest club={home} size={44} />}
          <b>{nameOf(clubs, next.homeId)}</b>
          <span className="x">×</span>
          <b>{nameOf(clubs, next.awayId)}</b>
          {away && <Crest club={away} size={44} />}
        </div>
        <dl>
          <dt>Quando</dt>
          <dd>{formatBarDate(next.date)}</dd>
          {(next.ground ?? home?.stadium) && (
            <>
              <dt>Onde</dt>
              <dd>{next.ground ?? home?.stadium}</dd>
            </>
          )}
          {next.firstLeg && (
            <>
              <dt>Ida</dt>
              <dd>{next.firstLeg}</dd>
            </>
          )}
        </dl>
      </div>
      <p className="note">
        {next.isTwoLegged ? "Empate no agregado " : "Empate "}
        {TIE_BREAK_NOTES[next.tieBreak]}.{next.isTwoLegged ? " Não existe gol fora de casa." : ""}
      </p>
    </section>
  );
}
