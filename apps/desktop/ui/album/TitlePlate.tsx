import type { CSSProperties } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { TitlePage } from "@boleiro/game-client/album/albumOf";
import { plateColours } from "../clubs/clubCatalog.js";
import { CompetitionLogo } from "../competitions/CompetitionLogo.js";

type Clubs = Readonly<Record<string, Club>>;

/** What a plate says under the competition: the deciding score, or why there is none. */
function plateDetail(title: TitlePage, clubs: Clubs): string {
  const { decider } = title;
  if (!decider) return "jogo do título não guardado";
  const opponentId = decider.homeId === title.clubId ? decider.awayId : decider.homeId;
  const [own, other] = decider.homeId === title.clubId ? [decider.homeGoals, decider.awayGoals] : [decider.awayGoals, decider.homeGoals];
  const opponent = clubs[opponentId]?.shortName ?? decider.clubs[opponentId]?.name ?? opponentId;
  const shootout = decider.penaltyWinnerId ? " (pên.)" : "";
  return decider.kind === "league" ? `título decidido: ${own} × ${other} ${opponent}` : `final: ${own} × ${other} ${opponent}${shootout}`;
}

/** A title as the album prints it on its page: a plate in the club's colours that opens the title's special page. */
export function TitlePlate({ title, clubs, order = 0, onOpen }: { title: TitlePage; clubs: Clubs; order?: number; onOpen: (title: TitlePage) => void }) {
  const club = clubs[title.clubId];
  const colours = club ? plateColours(club.colours) : { background: "#0B7A3B", text: "#FFFFFF" };
  const detail = plateDetail(title, clubs);
  return (
    <button
      className="ab-plate"
      style={{ "--c": colours.background, "--ic": colours.text, "--i": order } as CSSProperties}
      aria-label={`${title.name} ${title.season}, ${detail}: abrir a página do título`}
      onClick={() => onOpen(title)}
    >
      <span className="ab-plate-trophy" aria-hidden="true">
        <CompetitionLogo competitionKey={title.competition} season={title.season} size={30} name={title.name} isNamedBeside />
      </span>
      <span className="ab-plate-year" aria-hidden="true">
        {title.season}
      </span>
      <b aria-hidden="true">{title.name}</b>
      <small aria-hidden="true">{detail}</small>
    </button>
  );
}
