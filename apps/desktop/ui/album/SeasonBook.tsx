import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { AlbumSeason } from "@boleiro/game-client/album/albumOf";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { plateColours } from "../clubs/clubCatalog.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { AlbumSticker } from "./AlbumSticker.js";

type Clubs = Readonly<Record<string, Club>>;

// A leaf turns in 760 ms and fades out by 830 ms once it lies down. The page it uncovers as it lifts is
// the new season's from the start; the page it lands on changes once the leaf covers it, a little past half way.
const TURN_MS = 840;
const SWAP_MS = 430;

type Turn = { key: number; direction: "forward" | "back" };

const DIVISION_NAMES: Record<string, string> = { A: "Série A", B: "Série B", C: "Série C", D: "Série D" };

function seasonLine(page: AlbumSeason, coachName: string): string {
  if (page.status === "live") return `${coachName ? `${coachName} · ` : ""}temporada em andamento`;
  if (page.status === "unprinted") return "Temporada de antes do álbum";
  const finish = page.finish ? `${DIVISION_NAMES[page.finish.division] ?? page.finish.division}, ${page.finish.position}º lugar` : "Temporada encerrada";
  const titles = page.titleIds.length ? ` · ${page.titleIds.length === 1 ? "1 título" : `${page.titleIds.length} títulos`}` : "";
  return `${finish}${titles}`;
}

/** The tab of a season on the album's edge: the year and what it was. */
function tabCaption(page: AlbumSeason): string {
  if (page.status === "live") return "agora";
  if (page.status === "unprinted") return "antes";
  return page.finish ? `${page.finish.position}º ${page.finish.division}` : "–";
}

type Props = {
  clubId: string;
  seasons: readonly AlbumSeason[];
  clubs: Clubs;
  coachName: string;
  /** The right page for the season shown. */
  children: (season: AlbumSeason) => ReactNode;
};

/**
 * A club's seasons in the coach's album, one spread each: the squad's stickers on the left page, what
 * the season left on the right, and a tab per season on the album's edge. Picking another season turns
 * the page across the spine; the stickers of an older season stick in as the leaf lands.
 */
export function SeasonBook({ clubId, seasons, clubs, coachName, children }: Props) {
  const [wanted, setWanted] = useState(0);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [isSettled, setSettled] = useState(false);
  const timers = useRef<number[]>([]);
  const turns = useRef(0);
  const club = clubs[clubId];
  const page = seasons[Math.min(left, seasons.length - 1)];
  const rightPage = seasons[Math.min(right, seasons.length - 1)];

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function pick(index: number) {
    if (index === wanted) return;
    setWanted(index);
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    if (prefersReducedMotion()) {
      setLeft(index);
      setRight(index);
      setSettled(true);
      return;
    }
    // Older seasons lie further into the album: turning to one lifts the right page over to the left.
    const direction = index > wanted ? "forward" : "back";
    setTurn({ key: ++turns.current, direction });
    const [uncovered, covered] = direction === "forward" ? [setRight, setLeft] : [setLeft, setRight];
    uncovered(index);
    setSettled(direction === "back");
    timers.current.push(window.setTimeout(() => covered(index), SWAP_MS));
    timers.current.push(window.setTimeout(() => setTurn(null), TURN_MS));
  }

  if (!page || !rightPage || !club) return null;
  const colours = plateColours(club.colours);
  const shiny = page.stickers.filter((s) => s.shines.length).length;
  const hasNumbers = page.status !== "unprinted";
  return (
    <div className="ab-book" style={{ "--c": colours.background, "--ic": colours.text } as CSSProperties}>
      <div className="ab-spread">
        <section className="ab-page is-left" aria-labelledby="ab-season-club">
          <div key={`${page.season}-${page.clubId}`} className={`ab-leftpage${isSettled ? " is-settled" : ""}`}>
            <header className="ab-ph">
              <span className="ab-year">{page.season}</span>
              <div className="ab-ph-text">
                <h2 id="ab-season-club">{club.shortName}</h2>
                <p>{seasonLine(page, coachName)}</p>
              </div>
              <p className="ab-count">
                <b>{page.stickers.length}</b> figurinhas
                {shiny > 0 && (
                  <span>
                    <i className="ab-swatch" aria-hidden="true" /> {shiny} {shiny === 1 ? "brilhante" : "brilhantes"}
                  </span>
                )}
              </p>
            </header>
            {page.status === "unprinted" && <p className="note ab-note">Temporada jogada antes do álbum: o jogo não guardou o elenco nem os jogos de cada um. Ficaram os premiados e os artilheiros.</p>}
            {page.since && <p className="note ab-note">Jogos contados a partir de {formatDayMonth(page.since)}: o jogo salvo é de antes do álbum.</p>}
            {page.stickers.length === 0 ? (
              <p className="ab-empty">Nenhuma figurinha nesta página.</p>
            ) : (
              <ol className="ab-grid" aria-label={`Figurinhas de ${page.season}`}>
                {page.stickers.map((sticker, i) => (
                  <li key={sticker.playerId}>
                    <AlbumSticker sticker={sticker} club={club} order={i} hasNumbers={hasNumbers} />
                  </li>
                ))}
              </ol>
            )}
            <footer className="ab-legend">
              <span>
                <i className="ab-swatch" aria-hidden="true" /> Brilhante: ídolo, artilheiro ou premiado
              </span>
              <span className="ab-pgno">{page.season} · 1</span>
            </footer>
          </div>
        </section>
        <section className="ab-page is-right" aria-label={`O que ${rightPage.season} deixou`}>
          <div key={`${rightPage.season}-${rightPage.clubId}`} className="ab-rightpage">
            {children(rightPage)}
            <span className="ab-pgno is-right">{rightPage.season} · 2</span>
          </div>
        </section>
        {turn && (
          <div key={turn.key} className={`ab-turn is-${turn.direction}`} aria-hidden="true">
            <span className="ab-cast" />
            <div className="ab-leaf">
              <span className="ab-leaf-face is-front" />
              <span className="ab-leaf-face is-back" />
            </div>
          </div>
        )}
      </div>
      {seasons.length > 1 && (
        <nav className="ab-years" aria-label="Temporadas">
          {seasons.map((season, i) => (
            <button key={`${season.season}-${season.clubId}`} aria-current={i === wanted ? "page" : undefined} onClick={() => pick(i)}>
              {season.season}
              <small>{tabCaption(season)}</small>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
