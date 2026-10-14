const UNITS: readonly { size: number; suffix: string }[] = [
  { size: 1e9, suffix: " bi" },
  { size: 1e6, suffix: " mi" },
  { size: 1e3, suffix: " mil" },
];

const ONE_DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** An amount in BRL as a sports page writes it: "R$ 1,2 mi", "R$ 350 mil". */
export function formatMoney(amount: number): string {
  const size = Math.abs(amount);
  const unit = UNITS.find((u) => size >= u.size);
  const value = unit ? ONE_DECIMAL.format(size / unit.size) + unit.suffix : ONE_DECIMAL.format(Math.round(size));
  return `${amount < 0 ? "-" : ""}R$ ${value}`;
}
