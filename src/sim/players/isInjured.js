export function isInjured({ condition }, date) {
    return condition.injuredUntil !== null && date < condition.injuredUntil;
}
