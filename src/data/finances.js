import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";
export const BASES = ["published", "estimate", "guess"];
const DIVISIONS = ["A", "B", "C", "D"];
const SIZES = ["small", "median", "large"];
const FIELDS = [
    "revenue_total", "broadcasting", "matchday", "membership", "sponsorship", "player_sales", "wage_bill", "net_debt",
];
function oneOf(options, value, field, row) {
    const match = options.find((option) => option === value);
    if (match === undefined)
        throw new Error(`finances ${row}: invalid ${field} "${value ?? ""}"`);
    return match;
}
function money(value, field, row, { signed = false } = {}) {
    const parsed = Number(value);
    if (!value || !Number.isFinite(parsed) || (!signed && parsed < 0)) {
        throw new Error(`finances ${row}: invalid ${field} "${value ?? ""}"`);
    }
    return parsed;
}
function toFinances(row, label) {
    const source = row.source ?? "";
    if (!source)
        throw new Error(`finances ${label}: missing source`);
    const season = money(row.season, "season", label);
    return {
        season,
        revenue: {
            total: money(row.revenue_total, "revenue_total", label),
            broadcasting: money(row.broadcasting, "broadcasting", label),
            matchday: money(row.matchday, "matchday", label),
            membership: money(row.membership, "membership", label),
            sponsorship: money(row.sponsorship, "sponsorship", label),
            playerSales: money(row.player_sales, "player_sales", label),
        },
        wageBill: money(row.wage_bill, "wage_bill", label),
        netDebt: money(row.net_debt, "net_debt", label, { signed: true }),
        basis: oneOf(BASES, row.basis, "basis", label),
        guessedFields: (row.guessed_fields ?? "")
            .split(";")
            .filter((name) => name !== "")
            .map((name) => oneOf(FIELDS, name, "guessed_fields", label)),
        source,
    };
}
/** Série A clubs from their accounts, plus small/median/large estimates for Série B–D. Values in BRL. */
export function parseFinances(csv) {
    const clubs = [];
    const divisionEstimates = [];
    for (const row of parseCsv(csv)) {
        const label = row.club_id || `${row.division ?? ""}/${row.size ?? ""}`;
        const division = oneOf(DIVISIONS, row.division, "division", label);
        const finances = toFinances(row, label);
        if (row.club_id)
            clubs.push({ ...finances, clubId: row.club_id, division });
        else
            divisionEstimates.push({ ...finances, division, size: oneOf(SIZES, row.size, "size", label) });
    }
    return { clubs, divisionEstimates };
}
export function loadFinances() {
    return parseFinances(readDataFile("finances.csv"));
}
