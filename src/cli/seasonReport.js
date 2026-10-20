import { millions } from "./millions.js";
/** Série C and D are long and multi-stage; the report shows their top places only. */
const SHOWN_ROWS = { A: 20, B: 20, C: 8, D: 8 };
const row = (r, i) => `${i + 1} ${r.name}${r.points === null ? "" : ` ${r.points}`}`;
const list = (names) => names.join(", ") || "none";
/** One season as plain text: final tables, cup and estadual winners, movements, top transfers and club money. */
export function seasonReport(summary) {
    if (!summary)
        return [];
    const { tables, promoted, relegated } = summary;
    const tableLine = (division) => {
        const rows = tables[division];
        const shown = rows.slice(0, SHOWN_ROWS[division]).map(row).join(", ");
        return `Série ${division}: ${shown}${rows.length > SHOWN_ROWS[division] ? ` … (${rows.length} clubs)` : ""}`;
    };
    return [
        `## ${summary.season}`,
        "",
        ...["A", "B", "C", "D"].map(tableLine),
        "",
        `Copa do Brasil: ${summary.cupWinner ?? "not finished"}`,
        `Estaduais: ${summary.estaduais.map((e) => `${e.state} ${e.champion}`).join(", ")}`,
        `promoted to A: ${list(promoted.B)}; to B: ${list(promoted.C)}; to C: ${list(promoted.D)}`,
        `relegated from A: ${list(relegated.A)}; from B: ${list(relegated.B)}; from C: ${list(relegated.C)}; from D: ${relegated.D.length} clubs`,
        `top transfers: ${summary.topTransfers.map((t) => `${t.name} (${t.from} → ${t.to}) R$ ${millions(t.fee)}`).join("; ") || "none"}`,
        "",
        "| Division | Clubs | Revenue p10 | Median | p90 |",
        "|---|---|---|---|---|",
        ...summary.money.map((m) => `| ${m.tier} | ${m.clubs} | R$ ${millions(m.p10)} | R$ ${millions(m.median)} | R$ ${millions(m.p90)} |`),
        "",
        `cash less board loans at the end: richest: ${summary.richest.map((c) => `${c.name} (${c.tier}) R$ ${millions(c.cash)}`).join(", ")}; poorest: ${summary.poorest.map((c) => `${c.name} (${c.tier}) R$ ${millions(c.cash)}`).join(", ")}`,
        "",
    ];
}
