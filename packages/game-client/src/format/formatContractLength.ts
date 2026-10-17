/** "6 meses", "1 ano", "3 anos". */
export function formatContractLength(months: number): string {
  if (months < 12) return `${months} meses`;
  const years = months / 12;
  return years === 1 ? "1 ano" : `${years.toLocaleString("pt-BR")} anos`;
}
