/** A new copy of `record` without `key`, safe to change. */
export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return { ...record };
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
