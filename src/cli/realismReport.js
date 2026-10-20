import { loadFinances } from "../data/finances.js";
import { loadPlayers } from "../data/players.js";
import { realDivisionRates, realSerieARates } from "../engine/calibration.js";
import { DIVISION_GAPS, realCupUpsets } from "../engine/cupUpsets.js";
import { realCardsPerGame } from "../sim/discipline/cardRates.js";
import { isBrazilian } from "../sim/transfers/willingToJoin.js";
import { MATCH_INJURIES_PER_HOUR } from "../sim/players/matchInjuryChance.js";
import { millions } from "./millions.js";
const DIVISIONS = ["A", "B", "C", "D"];
const CARD_ROWS = [
    { key: "A", label: "Série A" },
    { key: "B", label: "Série B" },
    { key: "C", label: "Série C", note: "guess: Série B rates" },
    { key: "D", label: "Série D", note: "guess: Série B rates" },
    { key: "cup", label: "Copa do Brasil" },
    { key: "state", label: "Estaduais", note: "guess: cup rates" },
];
const pct = (share, digits = 1) => `${(share * 100).toFixed(digits)}%`;
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
const operating = (f) => f.revenue.total - f.revenue.playerSales;
function resultRows(stats) {
    return DIVISIONS.map((division) => {
        const tally = {
            matches: sum(stats, (s) => s.results[division].matches),
            home: sum(stats, (s) => s.results[division].home),
            draw: sum(stats, (s) => s.results[division].draw),
            away: sum(stats, (s) => s.results[division].away),
            goals: sum(stats, (s) => s.results[division].goals),
        };
        const n = Math.max(1, tally.matches);
        const boleiro = { home: tally.home / n, draw: tally.draw / n, away: tally.away / n, goalsPerGame: tally.goals / n };
        const real = division === "A" ? realSerieARates() : realDivisionRates(division);
        return { division, matches: tally.matches, boleiro, real };
    });
}
function resultsTable(rows) {
    return [
        "### Results per division",
        "",
        "League games, Boleiro (B) vs real games from 2022 on (Série D: 2024 only), the data the engine is calibrated on.",
        "",
        "| Division | Games | Home B | Home real | Draw B | Draw real | Away B | Away real | Goals/game B | Goals/game real |",
        "|---|---|---|---|---|---|---|---|---|---|",
        ...rows.map(({ division, matches, boleiro: b, real: r }) => `| Série ${division} | ${matches} | ${pct(b.home)} | ${pct(r.home)} | ${pct(b.draw)} | ${pct(r.draw)} | ${pct(b.away)} | ${pct(r.away)} | ${b.goalsPerGame.toFixed(2)} | ${r.goalsPerGame.toFixed(2)} |`),
    ];
}
function upsetsTable(stats) {
    const real = realCupUpsets();
    const lines = DIVISION_GAPS.flatMap((gap) => ["home", "away"].map((venue) => {
        const groups = stats.flatMap((s) => s.cupUpsets[`${gap}-${venue}`] ?? []);
        const t = { matches: sum(groups, (g) => g.matches), win: sum(groups, (g) => g.win), draw: sum(groups, (g) => g.draw), loss: sum(groups, (g) => g.loss), goals: 0 };
        const r = real.find((g) => g.gap === gap && g.venue === venue);
        const share = (count) => (t.matches ? pct(count / t.matches, 0) : "-");
        return `| ${gap} | ${venue} | ${t.matches} | ${share(t.win)} | ${r ? pct(r.win, 0) : "-"} | ${share(t.draw)} | ${r ? pct(r.draw, 0) : "-"} | ${share(t.loss)} | ${r ? pct(r.loss, 0) : "-"} | ${r?.matches ?? 0} |`;
    }));
    return [
        "### Copa do Brasil upsets",
        "",
        "Matches between divisions, from the higher division's side (clubs below Série D count as D). Real: 2017–2025.",
        "",
        "| Gap | Favourite plays | Games B | Win B | Win real | Draw B | Draw real | Loss B | Loss real | Games real |",
        "|---|---|---|---|---|---|---|---|---|---|",
        ...lines,
    ];
}
function cardsTable(stats) {
    return [
        "### Cards per game",
        "",
        "Both sides together. Real: ESPN 2024–2025 for Série A, B and the cup; the rest borrow rates (marked guess).",
        "",
        "| Competition | Games | Yellows B | Yellows real | Reds B | Reds real |",
        "|---|---|---|---|---|---|",
        ...CARD_ROWS.map(({ key, label, note }) => {
            const games = sum(stats, (s) => s.cards[key]?.games ?? 0);
            const per = (pick) => (games ? (sum(stats, (s) => { const c = s.cards[key]; return c ? pick(c) : 0; }) / games).toFixed(2) : "-");
            const real = realCardsPerGame(key);
            return `| ${label} | ${games} | ${per((c) => c.yellows)} | ${real.yellows.toFixed(2)}${note ? ` (${note})` : ""} | ${per((c) => c.reds)} | ${real.reds.toFixed(2)} |`;
        }),
    ];
}
function revenueTable(stats) {
    const data = loadFinances();
    const realOf = (tier) => {
        if (tier === "A") {
            const values = data.clubs.map(operating).sort((a, b) => a - b);
            return [millions(values[0] ?? 0), millions(quantile(values, 0.5)), millions(values.at(-1) ?? 0), "published accounts, min / median / max"];
        }
        if (tier === "state")
            return ["-", "-", "-", "no data"];
        const size = (s) => data.divisionEstimates.find((row) => row.division === tier && row.size === s);
        const value = (s) => { const row = size(s); return row ? millions(operating(row)) : "-"; };
        return [value("small"), value("median"), value("large"), `${size("median")?.basis ?? "estimate"}, small / median / large`];
    };
    const tiers = ["A", "B", "C", "D", "state"];
    return [
        "### Revenue per division",
        "",
        "Yearly revenue without player sales, BRL. Real: data/finances.csv (2025).",
        "",
        "| Division | Club-seasons | Boleiro p10 | Boleiro median | Boleiro p90 | Real low | Real median | Real high | Real basis |",
        "|---|---|---|---|---|---|---|---|---|",
        ...tiers.map((tier) => {
            const values = stats.flatMap((s) => s.clubSeasons.filter((c) => c.tier === tier).map((c) => c.revenue)).sort((a, b) => a - b);
            const [low, median, high, basis] = realOf(tier);
            return `| ${tier} | ${values.length} | ${millions(quantile(values, 0.1))} | ${millions(quantile(values, 0.5))} | ${millions(quantile(values, 0.9))} | ${low} | ${median} | ${high} | ${basis} |`;
        }),
    ];
}
function foreignTable(stats) {
    const players = loadPlayers();
    const realShare = (division) => {
        const squad = players.filter((p) => p.division === division);
        return squad.filter((p) => !isBrazilian(p.nationalities)).length / Math.max(1, squad.length);
    };
    return [
        "### Foreign players",
        "",
        "Share of players without a Brazilian passport. Real: data/players.csv at the start; Boleiro: squads on each season's last day.",
        "",
        `| Division | Real (start) | ${stats.map((s) => `End ${s.season}`).join(" | ")} |`,
        `|---|---|${stats.map(() => "---|").join("")}`,
        ...DIVISIONS.map((division) => `| Série ${division} | ${pct(realShare(division))} | ${stats.map((s) => pct(s.flow.foreignShare[division])).join(" | ")} |`),
    ];
}
function injuriesTable(stats) {
    const published = MATCH_INJURIES_PER_HOUR * 1000;
    return [
        "### Injuries",
        "",
        `Match injuries only. Published rate used: ${published} per 1000 match hours (Ekstrand, Hägglund & Waldén 2011); Boleiro adds fatigue, artificial pitch and injury-prone risk on top. Match hours assume 11 starters per side.`,
        "",
        "| Season | Injuries | Clubs | Per club B | Per club at published rate | Per 1000 h B | Per 1000 h published |",
        "|---|---|---|---|---|---|---|",
        ...stats.map(({ season, injuries: i }) => `| ${season} | ${i.injuries} | ${i.clubs} | ${(i.injuries / i.clubs).toFixed(1)} | ${((i.starterHours * MATCH_INJURIES_PER_HOUR) / i.clubs).toFixed(1)} | ${((1000 * i.injuries) / i.starterHours).toFixed(1)} | ${published} |`),
    ];
}
/** Boleiro against real life over the seasons played, as markdown tables that paste into a PR. */
export function realismReport(stats) {
    const seasons = stats.map((s) => s.season);
    return [
        `## Realism report, ${seasons.length} season${seasons.length === 1 ? "" : "s"} (${seasons[0] ?? "-"}–${seasons.at(-1) ?? "-"})`,
        "",
        ...resultsTable(resultRows(stats)),
        "",
        ...upsetsTable(stats),
        "",
        ...cardsTable(stats),
        "",
        ...revenueTable(stats),
        "",
        ...foreignTable(stats),
        "",
        ...injuriesTable(stats),
    ];
}
