export const NO_SEND_OFFS = { home: [], away: [] };
// After a red card the ten men score at "about 2/3 of the original intensity, whereas the
// intensity of the opposing team increases by a factor of about 5/4": Vecer, Kopriva & Ichiba
// (2009), J Quant Anal Sports 5(1), estimated from live betting odds at the 2006 World Cup and
// Euro 2008, as quoted by Greenberg (2015), Significance 12(4):30–33.
// guess: a second red on the same side applies the factors again.
const TEN_MEN_SCORING = 2 / 3;
const AGAINST_TEN_MEN_SCORING = 5 / 4;
const MATCH_MINUTES = 90;
/** How much a side's scoring rate scales while it is `ownDown` men short and its opponent `opponentDown`. */
export function scoringFactor(ownDown, opponentDown) {
    return TEN_MEN_SCORING ** ownDown * AGAINST_TEN_MEN_SCORING ** opponentDown;
}
/**
 * How much each side's expected goals scale over the whole match, given who was sent off when.
 * Goals in disjoint spells are independent Poisson counts, so the match total stays Poisson with
 * the time-weighted mean rate; this is the same as playing the match in segments.
 */
export function sendOffRates({ home, away }) {
    const clamp = (minute) => Math.min(MATCH_MINUTES, Math.max(0, minute));
    const changes = [...home.map((m) => ({ minute: clamp(m), home: true })), ...away.map((m) => ({ minute: clamp(m), home: false }))]
        .sort((a, b) => a.minute - b.minute);
    const rates = { home: 0, away: 0 };
    let from = 0;
    let homeDown = 0;
    let awayDown = 0;
    for (const change of [...changes, { minute: MATCH_MINUTES, home: false }]) {
        const share = (change.minute - from) / MATCH_MINUTES;
        rates.home += share * TEN_MEN_SCORING ** homeDown * AGAINST_TEN_MEN_SCORING ** awayDown;
        rates.away += share * TEN_MEN_SCORING ** awayDown * AGAINST_TEN_MEN_SCORING ** homeDown;
        from = change.minute;
        if (change.minute < MATCH_MINUTES) {
            if (change.home)
                homeDown++;
            else
                awayDown++;
        }
    }
    return rates;
}
