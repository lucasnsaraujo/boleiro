import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import "./moneyStepper.css";

type Props = {
  /** What the amount is, as a screen reader names the group: "Oferta", "Salário", "Contraproposta". */
  label: string;
  value: number;
  /** A word or two after the amount: "Bahia pede R$ 85 mi", "por mês". */
  hint?: string;
  /** The amount each press adds or takes away. */
  step: number;
  min?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

/** A step of about 5% of `amount`, rounded to 1, 2 or 5 of its power of ten, so presses land on round figures. */
export function roundStep(amount: number): number {
  const raw = Math.max(1, amount * 0.05);
  const power = 10 ** Math.floor(Math.log10(raw));
  const lead = raw / power;
  return (lead < 2 ? 1 : lead < 5 ? 2 : 5) * power;
}

/** An amount in BRL the coach sets with − and + presses, as the approved market mock draws it. */
export function MoneyStepper({ label, value, hint, step, min = step, disabled = false, onChange }: Props) {
  const lower = Math.max(min, Math.round((value - step) / step) * step);
  return (
    <div className="money" role="group" aria-label={label}>
      <output className="money-value" aria-label={`${label}: ${formatMoney(value)}`}>
        {formatMoney(value)}
      </output>
      {hint && <span className="money-hint">{hint}</span>}
      <span className="money-steps">
        <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => onChange(lower)}>
          <i className="ph-bold ph-minus" aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} disabled={disabled} onClick={() => onChange(Math.round((value + step) / step) * step)}>
          <i className="ph-bold ph-plus" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
