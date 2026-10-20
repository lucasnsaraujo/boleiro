// Clubs are placed at their state's capital: clubs.csv has no city. Approximate coordinates of
// each capital, rounded to 0.01° (IBGE municipal seats, https://www.ibge.gov.br/cidades-e-estados).
const CAPITALS = {
    AC: { lat: -9.97, lon: -67.81 }, AL: { lat: -9.67, lon: -35.74 }, AP: { lat: 0.03, lon: -51.07 },
    AM: { lat: -3.12, lon: -60.02 }, BA: { lat: -12.97, lon: -38.5 }, CE: { lat: -3.73, lon: -38.53 },
    DF: { lat: -15.79, lon: -47.88 }, ES: { lat: -20.32, lon: -40.34 }, GO: { lat: -16.69, lon: -49.26 },
    MA: { lat: -2.53, lon: -44.3 }, MT: { lat: -15.6, lon: -56.1 }, MS: { lat: -20.46, lon: -54.62 },
    MG: { lat: -19.92, lon: -43.94 }, PA: { lat: -1.46, lon: -48.49 }, PB: { lat: -7.12, lon: -34.86 },
    PR: { lat: -25.43, lon: -49.27 }, PE: { lat: -8.05, lon: -34.88 }, PI: { lat: -5.09, lon: -42.8 },
    RJ: { lat: -22.91, lon: -43.17 }, RN: { lat: -5.79, lon: -35.21 }, RS: { lat: -30.03, lon: -51.23 },
    RO: { lat: -8.76, lon: -63.9 }, RR: { lat: 2.82, lon: -60.67 }, SC: { lat: -27.6, lon: -48.55 },
    SP: { lat: -23.55, lon: -46.63 }, SE: { lat: -10.91, lon: -37.07 }, TO: { lat: -10.18, lon: -48.33 },
};
// guess: a trip inside one state, which the capital-to-capital distance would call zero.
const SAME_STATE_KM = 150;
const EARTH_RADIUS_KM = 6371;
const radians = (degrees) => (degrees * Math.PI) / 180;
/** Straight-line (great-circle) distance in km between two clubs' states. */
export function travelKm(from, to) {
    if (from === to)
        return SAME_STATE_KM;
    const a = CAPITALS[from];
    const b = CAPITALS[to];
    const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
        Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
