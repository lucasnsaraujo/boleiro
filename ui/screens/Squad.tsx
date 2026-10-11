import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { formatMonthYear } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { POSITION_GROUP_NAMES, TRAIT_SHORT } from "../format/playerLabels.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { useFlip } from "../motion/useFlip.js";
import { nextSort, sortedSquad, squadRows, statusText, type SquadSort, type SquadSortKey } from "../squad/squadRows.js";
import "./squad.css";

const SQUAD_KEYS = ["date", "coachClubId", "clubs", "players", "discipline", "competitions", "fixtures"] as const;
type SquadState = Pick<GameState, (typeof SQUAD_KEYS)[number]>;

type Column = { title: string; sortKey: SquadSortKey | null; className: string };

const COLUMNS: readonly Column[] = [
  { title: "Jogador", sortKey: "name", className: "sq-name" },
  { title: "Força", sortKey: "strength", className: "sq-num" },
  { title: "Idade", sortKey: "age", className: "sq-num" },
  { title: "Característica", sortKey: null, className: "sq-trait" },
  { title: "Cansaço", sortKey: "fatigue", className: "sq-num" },
  { title: "Situação", sortKey: null, className: "sq-status" },
  { title: "Contrato", sortKey: "contractUntil", className: "sq-contract" },
  { title: "Salário", sortKey: "wage", className: "sq-wage" },
];

const BY_STRENGTH: SquadSort = { key: "strength", descending: true };
// Damping ratio 0.94: the rows settle with weight and no visible overshoot.
const ROW_SLIDE = springTiming({ stiffness: 500, damping: 42 });

/** A re-sorted row slides from where it was on a spring; with reduced motion it only fades back in. */
function slideSquadRow(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  if (prefersReducedMotion()) {
    row.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    return;
  }
  row.animate([{ transform: `translateY(${offset}px)` }, { transform: "none" }], ROW_SLIDE);
}

export function Squad() {
  const { engine } = useServices();
  const [state, setState] = useState<SquadState | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SquadSort>(BY_STRENGTH);

  useEffect(() => {
    let current = true;
    engine.read(SQUAD_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const rows = useMemo(() => (state ? squadRows(state) : []), [state]);
  const groups = useMemo(() => sortedSquad(rows, sort), [rows, sort]);
  const table = useRef<HTMLTableElement>(null);
  useFlip(table, groups.flatMap((group) => group.rows.map((p) => p.id)).join(), slideSquadRow);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo o elenco…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;

  return (
    <div className="squad">
      <header className="squad-head">
        <div>
          <h1 className="screen-title">Elenco</h1>
          <p className="screen-sub">{club ? `${club.shortName} · ${rows.length} jogadores` : "Sem clube"}</p>
        </div>
        {club && (
          <Link to="/lineup" className="btn-main">
            Escalação
          </Link>
        )}
      </header>
      {!club ? (
        <p className="status">Sem clube, sem elenco.</p>
      ) : (
        <table ref={table} className="squad-table" aria-label={`Elenco do ${club.shortName}`}>
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const isSorted = column.sortKey === sort.key;
                return (
                  <th
                    key={column.title}
                    scope="col"
                    className={column.className}
                    aria-sort={column.sortKey === null ? undefined : isSorted ? (sort.descending ? "descending" : "ascending") : "none"}
                  >
                    {column.sortKey === null ? (
                      column.title
                    ) : (
                      <button className={isSorted ? "sq-sort on" : "sq-sort"} onClick={() => column.sortKey && setSort(nextSort(sort, column.sortKey))}>
                        {column.title}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map(({ group, rows: players }) => (
            <tbody key={group}>
              <tr className="sq-group">
                <th scope="rowgroup" colSpan={COLUMNS.length}>
                  {POSITION_GROUP_NAMES[group]}
                </th>
              </tr>
              {players.map((p) => (
                <tr key={p.id} data-flip={p.id} className={p.status ? `sq-row ${p.status.kind}` : "sq-row"}>
                  <td className="sq-name">
                    <Link to={`/squad/${p.id}`}>{p.name}</Link>
                  </td>
                  <td className="sq-num sq-strength">{Math.round(p.strength)}</td>
                  <td className="sq-num">{p.age}</td>
                  <td className="sq-trait">{p.trait ? TRAIT_SHORT[p.trait] : ""}</td>
                  <td className="sq-num">{p.fatigue > 0 ? p.fatigue : "–"}</td>
                  <td className="sq-status">{statusText(p.status)}</td>
                  <td className="sq-contract">{formatMonthYear(p.contractUntil)}</td>
                  <td className="sq-wage">{formatMoney(p.wage)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
}
