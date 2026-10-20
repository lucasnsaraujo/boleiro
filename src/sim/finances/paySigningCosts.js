import { bookMoney } from "./bookMoney.js";
/** Charges a club the signing bonus and the agent's commission of a new contract. */
export function paySigningCosts(state, clubId, costs) {
    const signed = bookMoney(state, clubId, { cost: "signingFees", amount: costs.signingFee });
    return bookMoney(signed, clubId, { cost: "agentFees", amount: costs.agentCommission });
}
