import type { Competition } from "@boleiro/engine/sim/gameState";
import type { EditionHost } from "@boleiro/engine/sim/hosts/venue";
import { competitionEditionOf, type CompetitionEdition } from "@boleiro/game-client/format/competitionEdition";
import { competitionLogoOf } from "./competitionLogos.js";
import "./competitionLogo.css";

type Props = {
  /** The competition's key ("serie-a", "state-sp", "world-cup") and the season of its edition, when the logo may change with it. */
  competitionKey: string;
  season: number | null;
  /** The slot's height in CSS pixels; a wide logo fills up to 1.3 times as much width. */
  size: number;
  /** The competition's name: the logo's alternative text and title, unless the name is printed beside it (a title would join the name of the heading or tab around it). */
  name: string;
  host?: EditionHost | null;
  isNamedBeside?: boolean;
  className?: string;
};

// Under this height the sticker's white cut thins, as it would swallow a tab-sized logo.
const SMALL = 32;

/** A competition's logo as a die-cut sticker, like a club's crest: the real one, or the one the game draws for it. */
export function CompetitionLogo({ competitionKey, season, size, name, host = null, isNamedBeside = false, className }: Props) {
  const logo = competitionLogoOf(competitionKey, season, size, host);
  return (
    <img
      className={`crest comp-logo${size < SMALL ? " is-small" : ""} ${className ?? ""}`}
      src={logo.url}
      alt={isNamedBeside ? "" : name}
      title={isNamedBeside ? undefined : name}
      width={logo.width}
      height={logo.height}
      data-logo={logo.isReal ? "real" : "drawn"}
      draggable={false}
    />
  );
}

/** A game competition's logo. */
export function CompetitionMark({ competition, size, name, isNamedBeside = true, className }: { competition: Competition; size: number; name: string; isNamedBeside?: boolean; className?: string }) {
  return <EditionLogo edition={competitionEditionOf(competition)} size={size} name={name} isNamedBeside={isNamedBeside} className={className} />;
}

/** The logo of a competition's edition, as a view carries it. */
export function EditionLogo({ edition, size, name, isNamedBeside = true, className }: { edition: CompetitionEdition; size: number; name: string; isNamedBeside?: boolean; className?: string }) {
  return <CompetitionLogo competitionKey={edition.key} season={edition.season} host={edition.host} size={size} name={name} isNamedBeside={isNamedBeside} className={className} />;
}

/** The file of a game competition's logo for a slot `size` pixels tall, for a card that lays the image out itself. */
export function competitionLogoUrlOf(competition: Competition, size: number): string {
  const { key, season, host } = competitionEditionOf(competition);
  return competitionLogoOf(key, season, size, host).url;
}
