/**
 * Packed JSON: JSON in which every key list that more than one object uses is written once, in a
 * table, and each such object as a list of its values headed by the list's mark. Thousands of players,
 * strength marks and match records share a handful of key lists, so a save shrinks by about a third, and
 * it reads back exactly as JSON.stringify wrote it, key order included.
 */

type Packed = { packed: 1; shapes: string[][]; value: unknown };

/**
 * Heads a list that stands for an object (followed by its key list's index), or a list whose own first
 * item starts with it. Printable, so JSON writes it as one character.
 */
const MARK = "~";
// Objects with more keys are maps by id (players, clubs): their key lists never repeat.
const MAX_SHAPE_KEYS = 24;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const startsWithMark = (list: readonly unknown[]) => typeof list[0] === "string" && list[0].startsWith(MARK);

/** The keys JSON.stringify writes: those whose values aren't undefined, functions or symbols. */
function writtenKeys(object: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(object)) {
    const value = object[key];
    if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") keys.push(key);
  }
  return keys;
}

const shapeKey = (keys: readonly string[]) => keys.join("\u0000");

function countShapes(value: unknown, counts: Map<string, number>): void {
  if (Array.isArray(value)) {
    for (const item of value) countShapes(item, counts);
    return;
  }
  if (!isObject(value)) return;
  const keys = writtenKeys(value);
  if (keys.length > 0 && keys.length <= MAX_SHAPE_KEYS) {
    const key = shapeKey(keys);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of keys) countShapes(value[key], counts);
}

/** The value as packed JSON text. */
export function packJson(value: unknown): string {
  const counts = new Map<string, number>();
  countShapes(value, counts);
  const shapes: string[][] = [];
  const indexOf = new Map<string, string>();
  for (const [key, count] of counts) {
    if (count < 2) continue;
    indexOf.set(key, `${MARK}${shapes.length}`);
    shapes.push(key.split("\u0000"));
  }
  const packed = (_key: string, item: unknown): unknown => {
    if (Array.isArray(item)) return startsWithMark(item) ? [MARK, ...item] : item;
    if (!isObject(item)) return item;
    const keys = writtenKeys(item);
    const mark = keys.length <= MAX_SHAPE_KEYS ? indexOf.get(shapeKey(keys)) : undefined;
    if (mark === undefined) return item;
    const list: unknown[] = [mark];
    for (const key of keys) list.push(item[key]);
    return list;
  };
  return JSON.stringify({ packed: 1, shapes, value }, (key, item: unknown) => (key === "shapes" ? item : packed(key, item)));
}

function isPacked(value: unknown): value is Packed {
  return isObject(value) && value.packed === 1 && Array.isArray(value.shapes) && "value" in value;
}

function unpacked(value: unknown, shapes: readonly string[][]): unknown {
  if (Array.isArray(value)) {
    const head: unknown = value[0];
    if (typeof head !== "string" || !head.startsWith(MARK)) return value.map((item) => unpacked(item, shapes));
    if (head === MARK) return value.slice(1).map((item) => unpacked(item, shapes));
    const keys = shapes[Number(head.slice(1))];
    if (!keys) throw new Error(`packed JSON has no key list ${head.slice(1)}`);
    const object: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) object[keys[i] ?? ""] = unpacked(value[i + 1], shapes);
    return object;
  }
  if (isObject(value)) {
    for (const key of Object.keys(value)) value[key] = unpacked(value[key], shapes);
  }
  return value;
}

/** The value of packed JSON text; JSON that was never packed reads as JSON.parse reads it. */
export function unpackJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return isPacked(parsed) ? unpacked(parsed.value, parsed.shapes) : parsed;
}
