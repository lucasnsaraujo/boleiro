import { Link } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { Crest } from "../clubs/Crest.js";
import { citizenshipText } from "../format/citizenshipText.js";
import { POSITION_NAMES, TRAIT_LONG } from "../format/playerLabels.js";
import { playerCard } from "./playerCard.js";
import { statusText, type SQUAD_KEYS, type SquadRow } from "./squadRows.js";

type Props = { state: Pick<GameState, (typeof SQUAD_KEYS)[number]>; row: SquadRow; club: Club };

/** The picked player as the hub's sticker: who he is, his contract and his numbers. */
export function PlayerSticker({ state, row, club }: Props) {
  const card = playerCard(state, row.id);
  if (!card) return null;
  const seasonGoals = card.season.goals.reduce((sum, { goals }) => sum + goals, 0);
  return (
    <section className="stk hub-card" aria-label={`Jogador: ${card.name}`}>
      <div className="hub-card-top">
        <Crest club={club} size={34} />
        <div>
          <b>
            <Link to={`/squad/${card.id}`}>{card.name}</Link>
          </b>
          <span>
            {POSITION_NAMES[card.group]} · {card.age} anos{citizenshipText(card.nationalities)}
          </span>
        </div>
        <span className="hub-card-strength" aria-label={`Força ${Math.round(card.strength)}`}>
          {Math.round(card.strength)}
        </span>
      </div>
      <div className="hub-card-body">
        <dl className="hub-card-kv">
          <dt>Contrato</dt>
          <dd>até {formatMonthYear(card.contract.until)}</dd>
          <dt>Passe</dt>
          <dd>{formatMoney(row.value)}</dd>
          <dt>Salário</dt>
          <dd>{formatMoney(card.contract.wage)} por mês</dd>
          <dt>Car.</dt>
          <dd>{card.trait ? TRAIT_LONG[card.trait] : "–"}</dd>
          {card.status && (
            <>
              <dt>Situação</dt>
              <dd className="hub-card-out">{statusText(card.status)}</dd>
            </>
          )}
        </dl>
        <table className="hub-card-stats">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{state.season}</th>
              <th scope="col">{club.shortName}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Jogos</th>
              <td>–</td>
              <td>{card.atClub.apps}</td>
            </tr>
            <tr>
              <th scope="row">Gols</th>
              <td>{seasonGoals}</td>
              <td>{card.atClub.goals}</td>
            </tr>
            <tr>
              <th scope="row">Minutos</th>
              <td>{card.season.minutes}</td>
              <td>–</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
