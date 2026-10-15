import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { POSITION_BADGES, POSITION_GROUP_NAMES, TRAIT_SHORT } from "../format/playerLabels.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { useFlip } from "../motion/useFlip.js";
import { nextSort, sortedSquad, statusText, type SquadRow, type SquadSort, type SquadSortKey } from "./squadRows.js";

type Column = { title: string; label?: string; sortKey: SquadSortKey | null; className: string };

const COLUMNS: readonly Column[] = [
  { title: "P", label: "Posição", sortKey: null, className: "l sq-pos" },
  { title: "Nome", sortKey: "name", className: "l" },
  { title: "F", label: "Força", sortKey: "strength", className: "" },
  { title: "Energia", sortKey: "energy", className: "l" },
  { title: "Salário", sortKey: "wage", className: "" },
  { title: "Passe", sortKey: "value", className: "" },
  { title: "G", label: "Gols", sortKey: "goals", className: "" },
  { title: "Car.", label: "Característica", sortKey: null, className: "l" },
  { title: "Idade", sortKey: "age", className: "" },
];

const BY_STRENGTH: SquadSort = { key: "strength", descending: true };
// Damping ratio 0.94: the rows settle with weight and no visible overshoot.
const ROW_SLIDE = springTiming({ stiffness: 500, damping: 42 });
// A moving row rides one layer higher for each row it travels, up to 9: the sticky header (hub.css) sits at 10.
const ROW_HEIGHT = 24;
const ROW_LAYERS = 9;
const OLD = 33;
const YOUNG = 21;

/**
 * A re-sorted row slides from where it was on a spring, lifted with a shadow; the farther it travels the
 * higher it rides over the others. With reduced motion it only fades back in.
 */
function slideSquadRow(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  if (prefersReducedMotion()) {
    row.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    return;
  }
  const zIndex = String(Math.min(ROW_LAYERS, 1 + Math.round(Math.abs(offset) / ROW_HEIGHT)));
  row.animate(
    [
      { transform: `translateY(${offset}px)`, boxShadow: "0 10px 22px rgba(20, 35, 26, 0.28)", zIndex },
      { transform: "none", boxShadow: "0 0 0 rgba(20, 35, 26, 0)", zIndex },
    ],
    ROW_SLIDE,
  );
}

function energyClass(energy: number): string {
  if (energy < 70) return "en low";
  return energy < 85 ? "en mid" : "en";
}

type Props = { rows: readonly SquadRow[]; clubName: string; selectedId: string | null; onSelect: (id: string) => void };

/** Where a key moves the pick, from the row at `index` of `count`; null for a key that doesn't move it. */
function rowAfterKey(key: string, index: number, count: number): number | null {
  if (key === "ArrowDown") return Math.min(index + 1, count - 1);
  if (key === "ArrowUp") return Math.max(index - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * The squad as Brasfoot lists it, by position; a click picks a player for the sticker, his name opens his screen.
 * From the keyboard, Tab stops on the picked row alone, the arrows (Home, End) move the pick, Enter and Space pick the focused row.
 */
export function SquadTable({ rows, clubName, selectedId, onSelect }: Props) {
  const [sort, setSort] = useState<SquadSort>(BY_STRENGTH);
  const groups = useMemo(() => sortedSquad(rows, sort), [rows, sort]);
  const table = useRef<HTMLTableElement>(null);
  const order = groups.flatMap((group) => group.rows.map((p) => p.id));
  useFlip(table, order.join(), slideSquadRow);
  const tabStopId = selectedId !== null && order.includes(selectedId) ? selectedId : order[0];

  function pickByKey(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
      return;
    }
    const next = rowAfterKey(event.key, order.indexOf(id), order.length);
    if (next === null) return;
    const nextId = order[next];
    if (nextId === undefined) return;
    event.preventDefault();
    table.current?.querySelectorAll<HTMLTableRowElement>("tbody tr")[next]?.focus();
    onSelect(nextId);
  }

  return (
    <table ref={table} className="tb hub-table" aria-label={`Elenco do ${clubName}`}>
      <thead>
        <tr>
          {COLUMNS.map((column) => {
            const isSorted = column.sortKey === sort.key;
            return (
              <th
                key={column.title}
                scope="col"
                className={column.className}
                title={column.label}
                aria-sort={column.sortKey === null ? undefined : isSorted ? (sort.descending ? "descending" : "ascending") : "none"}
              >
                {column.sortKey === null ? (
                  <abbr title={column.label}>{column.title}</abbr>
                ) : (
                  <button className={isSorted ? "sq-sort on" : "sq-sort"} aria-label={column.label ?? column.title} onClick={() => column.sortKey && setSort(nextSort(sort, column.sortKey))}>
                    {column.title}
                  </button>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      {groups.map(({ group, rows: players }) => (
        <tbody key={group} aria-label={POSITION_GROUP_NAMES[group]}>
          {players.map((p) => {
            const badge = POSITION_BADGES[p.group];
            const isSelected = p.id === selectedId;
            return (
              <tr
                key={p.id}
                data-flip={p.id}
                className={isSelected ? "sel" : undefined}
                aria-current={isSelected ? "true" : undefined}
                tabIndex={p.id === tabStopId ? 0 : -1}
                onClick={() => onSelect(p.id)}
                onKeyDown={(event) => pickByKey(event, p.id)}
              >
                <td className="l">
                  <span className={`pos ${badge.colour}`}>{badge.letter}</span>
                </td>
                <td className="l nm">
                  <span className="sq-name">
                    <Link to={`/squad/${p.id}`} onClick={(event) => event.stopPropagation()}>
                      {p.name}
                    </Link>
                    {p.status?.kind === "injured" && <i className="ph-fill ph-first-aid flag inj" role="img" aria-label={statusText(p.status)} title={statusText(p.status)} />}
                    {p.status?.kind === "suspended" && <span className="rc flag" role="img" aria-label={statusText(p.status)} title={statusText(p.status)} />}
                    {p.isLastContractYear && (
                      <i className="ph-bold ph-hourglass-medium flag ctr" role="img" aria-label={`Contrato acaba em ${formatMonthYear(p.contractUntil)}`} title={`Contrato acaba em ${formatMonthYear(p.contractUntil)}`} />
                    )}
                  </span>
                </td>
                <td className="sq-strength">{Math.round(p.strength)}</td>
                <td className="l">
                  <span className={energyClass(p.energy)}>
                    <i style={{ width: `${p.energy}%` }} />
                  </span>
                  {p.energy}%
                </td>
                <td>{formatMoney(p.wage).replace("R$ ", "")}</td>
                <td>{formatMoney(p.value).replace("R$ ", "")}</td>
                <td>{p.goals}</td>
                <td className="l dim">{p.trait ? TRAIT_SHORT[p.trait] : "–"}</td>
                <td className={p.age >= OLD ? "old" : p.age <= YOUNG ? "young" : undefined}>{p.age}</td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
