import type { Club } from "@boleiro/data/clubs";
import { formatContractLength } from "@boleiro/game-client/format/formatContractLength";
import { formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { ContractRow } from "@boleiro/game-client/market/contracts";
import { POSITION_BADGES } from "../format/playerLabels.js";
import "./contractsEnding.css";
import { clubArticle, withArticle } from "@boleiro/data/articles";

const SKIP_WORDS = { notInPlans: "fora dos planos", playerUnwilling: "ele não topa", wageCap: "sem espaço na folha" } as const;

type Props = {
  rows: readonly ContractRow[];
  clubs: Readonly<Record<string, Club>>;
  /** Whether the assistant runs the coach's contracts. */
  isAssistantOn: boolean;
  /** The players with a request on the board's desk. */
  onDesk: ReadonlySet<string>;
  onRenew: (playerId: string) => void;
};

function situation(row: ContractRow, clubs: Props["clubs"]) {
  if (row.leavesForId) return <span className="chip bad">Assinou com {clubs[row.leavesForId] ? withArticle(clubs[row.leavesForId]?.shortName ?? "", clubArticle(row.leavesForId)) : "outro clube"}</span>;
  if (row.isPreContractOpen) return <span className="chip wait">Pré-contrato liberado</span>;
  return <span className="chip off">Último ano</span>;
}

function plan(row: ContractRow, isAssistantOn: boolean) {
  if (!isAssistantOn) return <span className="ce-plan mute">Você decide</span>;
  if (!row.plan) return <span className="ce-plan mute">–</span>;
  if (row.plan.kind === "skips") return <span className="ce-plan skip">Deixa acabar: {SKIP_WORDS[row.plan.reason]}</span>;
  return (
    <span className="ce-plan">
      <i className="ph-bold ph-user-switch" aria-hidden="true" />
      Renova em {formatDayMonth(row.plan.on)}, {formatContractLength(row.plan.months)}
    </span>
  );
}

/** The coach's players in their contract's last year, the soonest to end first, each with what the assistant will do and a way into the renewal screen. */
export function ContractsEnding({ rows, clubs, isAssistantOn, onDesk, onRenew }: Props) {
  if (!rows.length) {
    return (
      <p className="ce-empty">
        <i className="ph-bold ph-seal-check" aria-hidden="true" />
        Nenhum contrato acaba nos próximos doze meses.
      </p>
    );
  }
  return (
    <table className="tb hub-table ce-table" aria-label="Contratos no último ano">
      <thead>
        <tr>
          <th scope="col" className="l">
            <abbr title="Posição">P</abbr>
          </th>
          <th scope="col" className="l">
            Nome
          </th>
          <th scope="col">Idade</th>
          <th scope="col">
            <abbr title="Força">F</abbr>
          </th>
          <th scope="col">Salário</th>
          <th scope="col">Até</th>
          <th scope="col" className="l">
            Situação
          </th>
          <th scope="col" className="l">
            Auxiliar
          </th>
          <th scope="col">
            <span className="ce-sr">Renovar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const badge = POSITION_BADGES[row.group];
          return (
            <tr key={row.playerId} style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
              <td className="l">
                <span className={`pos ${badge.colour}`}>{badge.letter}</span>
              </td>
              <td className="l nm">{row.name}</td>
              <td>{row.age}</td>
              <td className="sq-strength">{Math.round(row.strength)}</td>
              <td>{formatMoney(row.wage).replace("R$ ", "")}</td>
              <td className={row.isPreContractOpen ? "ce-until soon" : "ce-until"}>{formatMonthYear(row.until)}</td>
              <td className="l">{situation(row, clubs)}</td>
              <td className="l">{plan(row, isAssistantOn)}</td>
              <td>
                {onDesk.has(row.playerId) ? (
                  <span className="ce-desk">Na mesa</span>
                ) : (
                  <button className="btn sm" onClick={() => onRenew(row.playerId)} disabled={!!row.leavesForId} aria-label={`Renovar com ${row.name}`}>
                    <i className="ph-bold ph-signature" aria-hidden="true" />
                    Renovar
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
