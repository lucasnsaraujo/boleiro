import { useState } from "react";
import { BANK_LOAN_MIN_AMOUNT, BANK_LOAN_RATE_PER_MONTH, BANK_LOAN_TERMS, bankLoanLimit, bankLoanQuote, type BankLoanAnswer, type BankLoanRefusal } from "@boleiro/engine/sim/finances/bankLoan";
import type { ClubFinance } from "@boleiro/engine/sim/gameState";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { MoneyStepper, roundStep } from "../market/MoneyStepper.js";

const REFUSALS: Record<BankLoanRefusal, string> = {
  running: "o clube já tem um empréstimo correndo",
  limit: "passa do limite que o banco dá ao clube",
  amount: "o banco empresta a partir de R$ 100 mil",
  term: "o banco não oferece esse prazo",
};

const RATE = `${(BANK_LOAN_RATE_PER_MONTH * 100).toLocaleString("pt-BR")}% ao mês`;
const instalments = (count: number, amount: number) => `${count} ${count === 1 ? "parcela" : "parcelas"} de ${formatMoney(amount)}`;

type Props = {
  finance: ClubFinance;
  isBusy: boolean;
  /** Takes the loan; null when the game refused the command, which the screen shows. */
  onTake: (amount: number, months: number) => Promise<BankLoanAnswer | null>;
  onRepay: () => Promise<void>;
};

/** The bank's offer on the finances screen: its limit and terms, or the loan the club is paying. */
export function BankLoanCard({ finance, isBusy, onTake, onRepay }: Props) {
  const limit = bankLoanLimit(finance);
  const step = Math.max(BANK_LOAN_MIN_AMOUNT, roundStep(limit / 2));
  const [isOpen, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => Math.max(BANK_LOAN_MIN_AMOUNT, Math.round(limit / 2 / step) * step));
  const [months, setMonths] = useState<number>(24);
  const [refusal, setRefusal] = useState<string | null>(null);
  const loan = finance.bankLoan;

  if (loan) {
    return (
      <section className="of fin-bank" aria-label="Empréstimo do banco">
        <div className="t">
          <span className="ic" aria-hidden="true">
            <i className="ph-bold ph-bank" />
          </span>
          <div>
            <b>Empréstimo do banco</b>
            <small>{instalments(loan.instalmentsLeft, loan.instalment)}</small>
          </div>
          <span className="v">
            {formatMoney(loan.balance)}
            <small>a pagar</small>
          </span>
        </div>
        <div className="bs">
          <button className="btn sm" disabled={isBusy || finance.cash < loan.balance} onClick={() => void onRepay()} title={finance.cash < loan.balance ? "Falta caixa para quitar" : undefined}>
            Quitar
          </button>
          <small className="fin-bank-note">
            {formatMoney(loan.amount)} em {formatDayMonth(loan.takenOn)} a {RATE}
          </small>
        </div>
      </section>
    );
  }

  const quote = bankLoanQuote(Math.min(amount, limit), months);
  async function take() {
    setRefusal(null);
    const answer = await onTake(Math.min(amount, limit), months);
    if (answer && !answer.approved) setRefusal(`Banco recusou: ${REFUSALS[answer.reason]}.`);
  }

  return (
    <section className="of fin-bank" aria-label="Empréstimo do banco">
      <div className="t">
        <span className="ic" aria-hidden="true">
          <i className="ph-bold ph-bank" />
        </span>
        <div>
          <b>Empréstimo do banco</b>
          <small>{limit > 0 ? `Até ${formatMoney(limit)}` : "Sem crédito agora"}</small>
        </div>
        <span className="v">
          {limit > 0 ? formatMoney(quote.amount) : "—"}
          <small>{RATE}</small>
        </span>
      </div>
      {limit === 0 ? (
        <p>O banco não empresta mais: a dívida do clube já passa do que a receita sustenta.</p>
      ) : !isOpen ? (
        <div className="bs">
          <button className="btn sm" onClick={() => setOpen(true)}>
            Ver condições
          </button>
        </div>
      ) : (
        <div className="fin-bank-form">
          <MoneyStepper label="Valor" value={Math.min(amount, limit)} step={step} min={Math.min(limit, BANK_LOAN_MIN_AMOUNT)} hint={`de até ${formatMoney(limit)}`} disabled={isBusy} onChange={(next) => setAmount(Math.min(limit, next))} />
          <div className="seg fin-terms" role="radiogroup" aria-label="Prazo">
            {BANK_LOAN_TERMS.map((term) => (
              <span key={term} role="radio" aria-checked={months === term} tabIndex={0} className={months === term ? "on" : undefined} onClick={() => setMonths(term)} onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setMonths(term);
                }}>
                {term}x
              </span>
            ))}
          </div>
          <p>
            {instalments(months, quote.instalment)}, {formatMoney(quote.instalment * months - quote.amount)} de juros no total.
          </p>
          <div className="bs">
            <button className="btn go" disabled={isBusy} onClick={() => void take()}>
              <i className="ph-bold ph-hand-coins" aria-hidden="true" />
              Pegar empréstimo
            </button>
            <button className="btn flat" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
          {refusal && (
            <p className="fin-refusal" role="status">
              {refusal}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
