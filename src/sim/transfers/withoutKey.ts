/** A new copy of `record` without `key`, safe to change. */
export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  Reflect.deleteProperty(copy, key);
  return copy;
}
