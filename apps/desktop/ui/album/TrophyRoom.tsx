import { useState } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { TitlePage } from "@boleiro/game-client/album/albumOf";
import { TitlePlate } from "./TitlePlate.js";

type Clubs = Readonly<Record<string, Club>>;

/**
 * Every title of the coach's career, newest first, as the album's trophy pages: a filter per
 * competition, and each plate opening the title's special page.
 */
export function TrophyRoom({ titles, clubs, onOpen }: { titles: readonly TitlePage[]; clubs: Clubs; onOpen: (title: TitlePage) => void }) {
  const [competition, setCompetition] = useState<string | null>(null);
  if (titles.length === 0) {
    return (
      <div className="ab-room is-empty">
        <span className="slot ab-room-slot" aria-hidden="true">
          <i className="ph-bold ph-trophy" />
        </span>
        <p>Nenhum título ainda. A primeira página especial do álbum espera por ele.</p>
      </div>
    );
  }
  const competitions = [...new Map(titles.map((t) => [t.competition, t.name]))];
  const shown = competition ? titles.filter((t) => t.competition === competition) : titles;
  return (
    <div className="ab-room">
      <div className="ab-room-head">
        <p className="ab-room-count">
          <b>{titles.length}</b> {titles.length === 1 ? "título" : "títulos"}
        </p>
        {competitions.length > 1 && (
          <div className="ab-room-filter" role="group" aria-label="Competição">
            <button aria-pressed={competition === null} onClick={() => setCompetition(null)}>
              Todas
            </button>
            {competitions.map(([key, name]) => (
              <button key={key} aria-pressed={competition === key} onClick={() => setCompetition(key)}>
                {name} <small>{titles.filter((t) => t.competition === key).length}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="ab-room-grid" aria-label="Títulos">
        {shown.map((title, i) => (
          <li key={title.id}>
            <TitlePlate title={title} clubs={clubs} order={i} onOpen={onOpen} />
          </li>
        ))}
      </ol>
    </div>
  );
}
