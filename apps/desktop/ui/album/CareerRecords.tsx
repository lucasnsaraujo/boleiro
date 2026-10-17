import type { CSSProperties } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { AlbumRecords } from "@boleiro/game-client/album/albumOf";
import { Crest } from "../clubs/Crest.js";
import { matchText, MoreRecords, RecordLine } from "./RecordLines.js";

type Clubs = Readonly<Record<string, Club>>;

const DIVISION_NAMES: Record<string, string> = { A: "Série A", B: "Série B", C: "Série C", D: "Série D" };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The coach's records from his album on the left page, the records and idols of each club he ran on the right. */
export function CareerRecords({ records, clubs, coachName }: { records: AlbumRecords; clubs: Clubs; coachName: string }) {
  const clubName = (id: string) => clubs[id]?.shortName ?? id;
  const counters = [
    { label: records.titles === 1 ? "título" : "títulos", value: records.titles },
    { label: records.seasons === 1 ? "temporada" : "temporadas", value: records.seasons },
    { label: records.clubs === 1 ? "clube" : "clubes", value: records.clubs },
  ];
  return (
    <div className="ab-spread is-records">
      <section className="ab-page is-left" aria-labelledby="ab-career-title">
        <header className="ab-ph">
          <div className="ab-ph-text">
            <h2 id="ab-career-title">Recordes de {coachName || "sua carreira"}</h2>
            <p>Do álbum: os jogos e gols de cada temporada que ele imprimiu</p>
          </div>
        </header>
        <ul className="ab-counters">
          {counters.map((counter, i) => (
            <li key={counter.label} style={{ "--i": i } as CSSProperties}>
              <b>{counter.value}</b>
              <span>{counter.label}</span>
            </li>
          ))}
        </ul>
        <dl className="history-records ab-records">
          <RecordLine
            term="Artilheiro de uma temporada"
            mark={records.topSeasonScorer ? { main: `${records.topSeasonScorer.name}, ${plural(records.topSeasonScorer.count, "gol", "gols")}`, detail: `${clubName(records.topSeasonScorer.clubId)} ${records.topSeasonScorer.season ?? ""}` } : null}
          />
          <RecordLine term="Mais jogos com você" mark={records.mostApps ? { main: `${records.mostApps.name}, ${plural(records.mostApps.count, "jogo", "jogos")}`, detail: clubName(records.mostApps.clubId) } : null} />
          <RecordLine
            term="Melhor campanha"
            mark={records.bestFinish ? { main: `${records.bestFinish.position}º na ${DIVISION_NAMES[records.bestFinish.division] ?? records.bestFinish.division}`, detail: `${clubName(records.bestFinish.clubId)} ${records.bestFinish.season}` } : null}
          />
        </dl>
      </section>
      <section className="ab-page is-right" aria-label="Recordes dos clubes">
        {records.byClub.map(({ clubId, records: club, idols }) => (
          <article key={clubId} className="ab-clubrec" aria-label={`Recordes: ${clubName(clubId)}`}>
            <h3>
              {clubs[clubId] && <Crest club={clubs[clubId]} size={26} />}
              {clubName(clubId)}
            </h3>
            <dl className="history-records">
              <RecordLine term="Maior vitória" mark={matchText(club.biggestWin, clubs)} />
              <RecordLine term="Maior derrota" mark={matchText(club.biggestLoss, clubs)} />
              <MoreRecords records={club} clubs={clubs} />
            </dl>
            {idols.length > 0 && (
              <p className="ab-clubrec-idols">
                <span className="lbl">Ídolos</span> {idols.map((idol) => `${idol.name} (${idol.apps} jogos)`).join(" · ")}
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
