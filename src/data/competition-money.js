import { readDataFile } from "./readDataFile.js";
import { BASES } from "./finances.js";
function fail(path, expected) {
    throw new Error(`competition-money ${path}: expected ${expected}`);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function field(value, key, path) {
    if (!isRecord(value))
        fail(path, "an object");
    return value[key];
}
function amount(value, key, path) {
    const found = field(value, key, path);
    if (typeof found !== "number" || !Number.isFinite(found) || found < 0)
        fail(`${path}.${key}`, "a non-negative number");
    return found;
}
function text(value, key, path) {
    const found = field(value, key, path);
    if (typeof found !== "string" || found.trim() === "")
        fail(`${path}.${key}`, "a non-empty string");
    return found;
}
function list(value, key, path) {
    const found = field(value, key, path);
    if (!Array.isArray(found) || found.length === 0)
        fail(`${path}.${key}`, "a non-empty array");
    return found;
}
function sourced(value, path) {
    const basis = BASES.find((option) => option === field(value, "basis", path));
    if (basis === undefined)
        fail(`${path}.basis`, BASES.join(" | "));
    return { basis, source: text(value, "source", path) };
}
function divisionTv(value, path) {
    return { ...sourced(value, path), perClub: amount(value, "perClub", path) };
}
function matchday(value, path) {
    return {
        ...sourced(value, path),
        averageTicketPrice: amount(value, "averageTicketPrice", path),
        averageAttendance: amount(value, "averageAttendance", path),
    };
}
function continental(value, path, rate) {
    const stages = list(value, "stages", path).map((stage, i) => {
        const prizeUsd = amount(stage, "prizeUsd", `${path}.stages[${i}]`);
        return { stage: text(stage, "stage", `${path}.stages[${i}]`), prizeUsd, prize: prizeUsd * rate };
    });
    return { ...sourced(value, path), stages };
}
function toCompetitionMoney(json) {
    const tv = field(json, "tv", "");
    const tvA = field(tv, "A", "tv");
    const shares = field(tvA, "shares", "tv.A");
    const usdToBrl = { ...sourced(field(json, "usdToBrl", ""), "usdToBrl"), rate: amount(field(json, "usdToBrl", ""), "rate", "usdToBrl") };
    const cup = field(json, "copaDoBrasil", "");
    const days = field(json, "matchday", "");
    return {
        season: amount(json, "season", ""),
        usdToBrl,
        tv: {
            A: {
                ...sourced(tvA, "tv.A"),
                totalPool: amount(tvA, "totalPool", "tv.A"),
                shares: {
                    equal: amount(shares, "equal", "tv.A.shares"),
                    performance: amount(shares, "performance", "tv.A.shares"),
                    audience: amount(shares, "audience", "tv.A.shares"),
                },
                perClubMin: amount(tvA, "perClubMin", "tv.A"),
                perClubMax: amount(tvA, "perClubMax", "tv.A"),
            },
            B: divisionTv(field(tv, "B", "tv"), "tv.B"),
            C: divisionTv(field(tv, "C", "tv"), "tv.C"),
            D: divisionTv(field(tv, "D", "tv"), "tv.D"),
        },
        copaDoBrasil: {
            ...sourced(cup, "copaDoBrasil"),
            rounds: list(cup, "rounds", "copaDoBrasil").map((round, i) => ({
                round: text(round, "round", `copaDoBrasil.rounds[${i}]`),
                prize: amount(round, "prize", `copaDoBrasil.rounds[${i}]`),
                prizeLowerDivisions: field(round, "prizeLowerDivisions", `copaDoBrasil.rounds[${i}]`) === undefined
                    ? null
                    : amount(round, "prizeLowerDivisions", `copaDoBrasil.rounds[${i}]`),
            })),
        },
        libertadores: continental(field(json, "libertadores", ""), "libertadores", usdToBrl.rate),
        sulAmericana: continental(field(json, "sulAmericana", ""), "sulAmericana", usdToBrl.rate),
        matchday: {
            A: matchday(field(days, "A", "matchday"), "matchday.A"),
            B: matchday(field(days, "B", "matchday"), "matchday.B"),
            C: matchday(field(days, "C", "matchday"), "matchday.C"),
            D: matchday(field(days, "D", "matchday"), "matchday.D"),
        },
    };
}
/** 2026 TV money, cup and continental prizes, and 2025 ticket prices and crowds by division. */
export function parseCompetitionMoney(json) {
    const parsed = JSON.parse(json);
    return toCompetitionMoney(parsed);
}
export function loadCompetitionMoney() {
    return parseCompetitionMoney(readDataFile("competition-money.json"));
}
