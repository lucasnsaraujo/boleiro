import { clubHistory } from "../sim/history/clubHistory.js";
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const money = (brl) => `R$ ${brl.toLocaleString("pt-BR")}`;
function competitionName(key) {
    if (key === "copa-do-brasil")
        return "Copa do Brasil";
    const league = /^serie-([a-d])$/.exec(key);
    if (league?.[1])
        return `Série ${league[1].toUpperCase()}`;
    const state = /^state-([a-z]{2})$/.exec(key);
    return state?.[1] ? `Estadual ${state[1].toUpperCase()}` : key;
}
const NATIONAL_ORDER = ["serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil"];
const rankOf = (key) => (NATIONAL_ORDER.includes(key) ? NATIONAL_ORDER.indexOf(key) : NATIONAL_ORDER.length);
/** Série A to D, the cup, then the estaduais in alphabetical order. */
const byPrestige = (a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b);
/** Prints a club's history and the player's coach career as plain text lines. */
export function historyReport(state, clubId) {
    const nameOf = (id) => (id === null ? "abroad" : (state.clubs[id]?.shortName ?? id));
    const match = (mark) => mark ? `${mark.goalsFor}-${mark.goalsAgainst} vs ${nameOf(mark.opponentId)} (${competitionName(mark.competition)}, ${mark.date}, ${mark.home ? "home" : "away"})` : "none";
    const transfer = (mark, direction) => mark ? `${mark.name} ${direction} ${nameOf(mark.otherClubId)}, ${money(mark.fee)} (${mark.date})` : "none";
    const club = clubHistory(state, clubId);
    const { records } = club;
    const { history } = state;
    const lines = [
        `${nameOf(clubId)}: history after ${history.seasons.length} seasons`,
        `titles (${club.titles.length}): ${club.titles.map((t) => `${t.season} ${competitionName(t.competition)}`).join(", ") || "none"}`,
        `league finishes: ${club.positions.map((p) => `${p.season}: Série ${p.division}, ${ordinal(p.position)}`).join(" | ") || "none"}`,
        "records",
        `  biggest win: ${match(records.biggestWin)}`,
        `  biggest loss: ${match(records.biggestLoss)}`,
        `  biggest crowd: ${records.biggestCrowd ? `${records.biggestCrowd.crowd.toLocaleString("pt-BR")} vs ${nameOf(records.biggestCrowd.opponentId)} (${competitionName(records.biggestCrowd.competition)}, ${records.biggestCrowd.date})` : "none"}`,
        `  record sale: ${transfer(records.recordSale, "to")}`,
        `  record signing: ${transfer(records.recordSigning, "from")}`,
        `idols (${club.idols.length}): ${club.idols.map((p) => `${p.name} ${p.apps} games, ${p.goals} goals`).join("; ") || "none yet"}`,
        "",
    ];
    for (const season of history.seasons) {
        const champions = Object.keys(season.champions).filter((key) => !key.startsWith("state-")).sort(byPrestige);
        lines.push(`${season.season} champions: ${champions.map((key) => `${competitionName(key)} ${nameOf(season.champions[key] ?? null)}`).join(", ")}`);
        const scorer = season.topScorers["serie-a"];
        if (scorer)
            lines.push(`  Série A top scorer: ${scorer.name} (${nameOf(scorer.clubId)}) ${scorer.goals}`);
        lines.push(`  promoted to A: ${season.promoted.B.map(nameOf).join(", ")}; relegated from A: ${season.relegated.A.map(nameOf).join(", ")}`);
    }
    const { coach } = history;
    lines.push("", "coach career", `  clubs: ${coach.stints.map((s) => `${nameOf(s.clubId)} from ${s.from}${s.until ? ` to ${s.until} (${s.left})` : ""}`).join("; ") || "none"}`, `  seasons: ${coach.seasons.map((s) => `${s.season} ${nameOf(s.clubId)} ${ordinal(s.position)} (target ${ordinal(s.targetPosition)})`).join("; ") || "none"}`, `  trophies: ${coach.trophies.map((t) => `${t.season} ${competitionName(t.competition)} with ${nameOf(t.clubId)}`).join("; ") || "none"}`, `  firings: ${coach.firings.map((f) => `${nameOf(f.clubId)} on ${f.date}, ${ordinal(f.position)} (target ${ordinal(f.targetPosition)})`).join("; ") || "none"}`);
    return lines;
}
