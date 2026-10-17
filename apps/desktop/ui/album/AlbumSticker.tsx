import type { CSSProperties, PointerEvent } from "react";
import { Link } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { AlbumSticker as Sticker, StickerShine } from "@boleiro/game-client/album/albumOf";
import { plateColours } from "../clubs/clubCatalog.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { ROLE_LETTER, ROLE_NAME } from "../round/lineupBoard.js";

type Props = {
  sticker: Sticker;
  club: Pick<Club, "id" | "shortName" | "colours"> | null;
  /** Its place in the order the page sticks them in, for the stagger. */
  order: number;
  /** Whether the page shows games and goals: a season played before the album has none to show. */
  hasNumbers: boolean;
};

const SHINE_WORDS: Record<StickerShine, string> = { idol: "ídolo do clube", topScorer: "artilheiro", award: "premiado" };
// The most a shiny sticker leans towards the pointer, in degrees.
const MAX_TILT = 9;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Pedro, atacante, 38 jogos e 21 gols, brilhante: artilheiro" */
export function stickerLabel(sticker: Sticker, hasNumbers: boolean): string {
  const numbers = hasNumbers ? `, ${plural(sticker.apps, "jogo", "jogos")} e ${plural(sticker.goals, "gol", "gols")}` : "";
  const shine = sticker.shines.length ? `, brilhante: ${sticker.shines.map((s) => SHINE_WORDS[s]).join(" e ")}` : "";
  return `${sticker.name}, ${ROLE_NAME[sticker.role].toLowerCase()}${numbers}${shine}`;
}

/** A shiny sticker leans to the pointer and its foil catches the light where the pointer is. */
function tiltTo(event: PointerEvent<HTMLElement>) {
  if (prefersReducedMotion()) return;
  const card = event.currentTarget;
  const box = card.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  card.style.setProperty("--rx", `${((0.5 - y) * MAX_TILT).toFixed(2)}deg`);
  card.style.setProperty("--ry", `${((x - 0.5) * MAX_TILT).toFixed(2)}deg`);
  card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
  card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
}

function settle(event: PointerEvent<HTMLElement>) {
  for (const name of ["--rx", "--ry", "--mx", "--my"]) event.currentTarget.style.removeProperty(name);
}

/**
 * A player's sticker on a season's page: the club's colours behind his initial, his number on the page
 * and his position. Idols, top scorers and award winners print on foil, which follows the light. A
 * player still in the game opens his page.
 */
export function AlbumSticker({ sticker, club, order, hasNumbers }: Props) {
  const colours = club ? plateColours(club.colours) : { background: "#3C4A40", text: "#FFFFFF" };
  const isShiny = sticker.shines.length > 0;
  const style = { "--c": colours.background, "--ic": colours.text, "--i": order } as CSSProperties;
  const className = `ab-stk${isShiny ? " is-shiny" : ""}`;
  const face = (
    <>
      <span className="ab-art" aria-hidden="true">
        <em>{String(sticker.number).padStart(2, "0")}</em>
        <span className={`pos ${ROLE_LETTER[sticker.role]}`}>{ROLE_LETTER[sticker.role]}</span>
        <b>{sticker.name.trim().charAt(0).toUpperCase()}</b>
        {isShiny && <span className="ab-foil" />}
      </span>
      <span className="ab-name" aria-hidden="true">
        {sticker.name}
      </span>
      {hasNumbers && (
        <span className="ab-nums" aria-hidden="true">
          <span>
            <b>{sticker.apps}</b> J
          </span>
          <span>
            <b>{sticker.goals}</b> G
          </span>
        </span>
      )}
    </>
  );
  const label = stickerLabel(sticker, hasNumbers);
  const pointer = isShiny ? { onPointerMove: tiltTo, onPointerLeave: settle } : {};
  return sticker.isInGame ? (
    <Link className={className} style={style} to={`/squad/${sticker.playerId}`} aria-label={label} title={sticker.honours.join(" · ") || undefined} {...pointer}>
      {face}
    </Link>
  ) : (
    <span className={`${className} is-gone`} style={style} role="img" aria-label={`${label}, fora do jogo`} title={sticker.honours.join(" · ") || undefined} {...pointer}>
      {face}
    </span>
  );
}
