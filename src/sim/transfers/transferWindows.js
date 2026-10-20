import { daysBetween } from "../dates.js";
// CBF 2026 registration windows: 5 January to 3 March, and 20 July to 11 September (Band,
// https://www.band.com.br/esportes/janela-internacional-de-transferencias-abre-hoje-veja-detalhes-202607191440;
// Itatiaia, "veja todas as datas do novo calendário do futebol brasileiro em 2026"). The same days
// are used every season. The restricted complementary window of March is left out.
export const TRANSFER_WINDOWS = [
    { opens: "01-05", closes: "03-03" },
    { opens: "07-20", closes: "09-11" },
];
// guess: AI clubs do their business once a week while a window is open, not every day.
const DAYS_BETWEEN_MARKET_DAYS = 7;
function windowOf(date) {
    const day = date.slice(5);
    const found = TRANSFER_WINDOWS.find((w) => day >= w.opens && day <= w.closes);
    return found ? { opens: `${date.slice(0, 4)}-${found.opens}` } : null;
}
export const isWindowOpen = (date) => windowOf(date) !== null;
/** Whether AI clubs trade today: the window's first day and every week after it. */
export function isMarketDay(date) {
    const window = windowOf(date);
    return window !== null && daysBetween(window.opens, date) % DAYS_BETWEEN_MARKET_DAYS === 0;
}
