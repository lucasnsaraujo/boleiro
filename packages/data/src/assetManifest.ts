/** One source image, converted into `boxes` (px, longest side, never upscaled) in each of `formats`. */
export type ImageAsset = { kind: string; width: number; height: number; boxes: number[]; formats: string[] };
/** The images a club uses, by their content hash in `images`. */
export type ClubImages = { crest?: string; scoreboardCrest?: string };
/** `packages/data/pack/assets.json`, written by `pipeline/build_assets.py`. */
export type AssetManifest = { images: Record<string, ImageAsset>; clubs: Record<string, ClubImages> };

const MANIFEST_FORMAT = 1;
const CLUB_IMAGES = ["crest", "scoreboardCrest"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new Error(`asset manifest ${path}: expected ${expected}`);
}

function isList<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.every(isItem);
}

const isNumber = (value: unknown): value is number => typeof value === "number";
const isString = (value: unknown): value is string => typeof value === "string";

function imageOf(value: unknown, hash: string): ImageAsset {
  if (!isRecord(value)) fail(`images.${hash}`, "an image");
  const { kind, width, height, boxes, formats } = value;
  if (!isString(kind) || !isNumber(width) || !isNumber(height)) fail(`images.${hash}`, "a kind, width and height");
  if (!isList(boxes, isNumber) || !isList(formats, isString)) fail(`images.${hash}`, "boxes and formats");
  return { kind, width, height, boxes: [...boxes].sort((a, b) => a - b), formats };
}

export function parseAssetManifest(json: string): AssetManifest {
  const manifest: unknown = JSON.parse(json);
  if (!isRecord(manifest) || manifest.format !== MANIFEST_FORMAT) fail("format", String(MANIFEST_FORMAT));
  if (!isRecord(manifest.images) || !isRecord(manifest.clubs)) fail("", "images and clubs");
  const images = Object.fromEntries(Object.entries(manifest.images).map(([hash, image]) => [hash, imageOf(image, hash)]));
  const clubs = Object.fromEntries(
    Object.entries(manifest.clubs).map(([clubId, uses]): [string, ClubImages] => {
      if (!isRecord(uses)) fail(`clubs.${clubId}`, "an object");
      const found: ClubImages = {};
      for (const key of CLUB_IMAGES) {
        const hash = uses[key];
        if (hash === undefined) continue;
        if (!isString(hash) || !(hash in images)) fail(`clubs.${clubId}.${key}`, `an image in the manifest, not ${String(hash)}`);
        found[key] = hash;
      }
      return [clubId, found];
    }),
  );
  return { images, clubs };
}

/**
 * Path under `pack/assets/` of the club's image in the smallest box that fills `size` device
 * pixels, or the largest box when none does; null when the club has no such image or format.
 */
export function imageFileOf(manifest: AssetManifest, clubId: string, use: keyof ClubImages, size: number, format: string): string | null {
  const hash = manifest.clubs[clubId]?.[use];
  const image = hash === undefined ? undefined : manifest.images[hash];
  if (!image || !image.formats.includes(format)) return null;
  const box = image.boxes.find((candidate) => candidate >= size) ?? image.boxes[image.boxes.length - 1];
  return `${image.kind}/${hash}-${box}.${format}`;
}
