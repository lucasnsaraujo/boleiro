const DAY_MS = 86_400_000;
// Date.parse and toISOString are hot (fatigue, contract windows); a season uses a few hundred dates.
const CACHE_LIMIT = 10_000;
const parsed = new Map();
const shifted = new Map();
function remember(cache, key, value) {
    if (cache.size >= CACHE_LIMIT)
        cache.clear();
    cache.set(key, value);
    return value;
}
const parse = (date) => parsed.get(date) ?? remember(parsed, date, Date.parse(date));
export function addDays(date, days) {
    const key = `${date}|${days}`;
    return shifted.get(key) ?? remember(shifted, key, new Date(parse(date) + days * DAY_MS).toISOString().slice(0, 10));
}
export function daysBetween(from, to) {
    return Math.round((parse(to) - parse(from)) / DAY_MS);
}
