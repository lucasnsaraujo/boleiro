// guess: the board keeps a tenth of the year's revenue for transfer fees.
export const TRANSFER_SHARE_OF_REVENUE = 0.1;
// guess: half of the cash above the safety cushion is added to the transfer budget.
const SPARE_CASH_SHARE = 0.5;
// guess: the board keeps three months of wages in the bank before spending or repaying debt.
export const CUSHION_MONTHS_OF_WAGES = 3;
// guess: however tight the running costs, the board lets wages take at least 30% of revenue.
const MIN_WAGE_SHARE_OF_REVENUE = 0.3;
// guess: a board sitting on spare cash lets wages spend it over about three years.
const SPARE_CASH_WAGE_YEARS = 3;
/** Yearly revenue the board expects without player sales. */
export function projectedRevenue(finance) {
    return finance.tv + finance.sponsorship + finance.membership + finance.otherIncome + finance.expectedTickets + finance.expectedPrizes;
}
/**
 * The board's monthly wage cap is what revenue leaves after running costs and the transfer
 * reserve, plus a slice of spare cash; the transfer budget is that reserve plus half the spare cash.
 */
export function setBoardBudget(finance, monthlyWages) {
    const revenue = projectedRevenue(finance);
    const spareCash = finance.cash - finance.loans - finance.wagesOwed - CUSHION_MONTHS_OF_WAGES * monthlyWages;
    const fromRevenue = Math.max(MIN_WAGE_SHARE_OF_REVENUE * revenue, (1 - TRANSFER_SHARE_OF_REVENUE) * revenue - finance.infrastructure);
    const forWages = fromRevenue + Math.max(0, spareCash) / SPARE_CASH_WAGE_YEARS;
    return {
        ...finance,
        wageCap: Math.round(forWages / 12),
        transferBudget: Math.max(0, Math.round(TRANSFER_SHARE_OF_REVENUE * revenue + SPARE_CASH_SHARE * spareCash)),
    };
}
