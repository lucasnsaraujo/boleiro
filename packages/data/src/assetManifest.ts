/** One source image, converted into `boxes` (px, longest side, never upscaled) in each of `formats`. */
export type ImageAsset = { kind: string; width: number; height: number; boxes: number[]; formats: string[] };
/** The images a club uses, by their id in `images`. */
export type ClubImages = { crest?: string; scoreboardCrest?: string };
/** A sponsor brand's or a competition's logo, by its id in `images`. */
export type BrandImages = { logo: string };
/**
 * `packages/data/pack/assets.json`, written by `pipeline/build_assets.py`. An image's id is its kind and
 * content hash, `crest/0036ad7407124464`, and its files are `<id>-<box>.<format>` under `pack/assets/`.
 */
export type AssetManifest = { images: Record<string, ImageAsset>; clubs: Record<string, ClubImages>; brands: Record<string, BrandImages>; competitions: Record<string, BrandImages> };

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

function imageOf(value: unknown, id: string): ImageAsset {
  if (!isRecord(value)) fail(`images.${id}`, "an image");
  const { kind, width, height, boxes, formats } = value;
  if (!isString(kind) || !isNumber(width) || !isNumber(height)) fail(`images.${id}`, "a kind, width and height");
  if (!isList(boxes, isNumber) || !isList(formats, isString)) fail(`images.${id}`, "boxes and formats");
  return { kind, width, height, boxes: [...boxes].sort((a, b) => a - b), formats };
}

export function parseAssetManifest(json: string): AssetManifest {
  const manifest: unknown = JSON.parse(json);
  if (!isRecord(manifest) || manifest.format !== MANIFEST_FORMAT) fail("format", String(MANIFEST_FORMAT));
  if (!isRecord(manifest.images) || !isRecord(manifest.clubs)) fail("", "images and clubs");
  const images = Object.fromEntries(Object.entries(manifest.images).map(([id, image]) => [id, imageOf(image, id)]));
  const clubs = Object.fromEntries(
    Object.entries(manifest.clubs).map(([clubId, uses]): [string, ClubImages] => {
      if (!isRecord(uses)) fail(`clubs.${clubId}`, "an object");
      const found: ClubImages = {};
      for (const key of CLUB_IMAGES) {
        const id = uses[key];
        if (id === undefined) continue;
        if (!isString(id) || !(id in images)) fail(`clubs.${clubId}.${key}`, `an image in the manifest, not ${String(id)}`);
        found[key] = id;
      }
      return [clubId, found];
    }),
  );
  return { images, clubs, brands: logosOf(manifest.brands, "brands", images), competitions: logosOf(manifest.competitions, "competitions", images) };
}

/** A manifest's logos by owner (`brands`, `competitions`), each naming one of its images; none when the manifest has no such map. */
function logosOf(uses: unknown, path: string, images: Record<string, ImageAsset>): Record<string, BrandImages> {
  if (uses !== undefined && !isRecord(uses)) fail(path, "an object");
  return Object.fromEntries(
    Object.entries(uses ?? {}).map(([id, use]): [string, BrandImages] => {
      const logo = isRecord(use) ? use.logo : undefined;
      if (!isString(logo) || !(logo in images)) fail(`${path}.${id}.logo`, `an image in the manifest, not ${String(logo)}`);
      return [id, { logo }];
    }),
  );
}

/** The file of an image in the smallest box that fills `size` device pixels, or its largest box. */
function fileOf(manifest: AssetManifest, id: string | undefined, size: number, format: string): string | null {
  const image = id === undefined ? undefined : manifest.images[id];
  if (!image || !image.formats.includes(format)) return null;
  const box = image.boxes.find((candidate) => candidate >= size) ?? image.boxes[image.boxes.length - 1];
  return `${id}-${box}.${format}`;
}

/** Path under the sponsors' `assets/` of a brand's logo whose longest side fills `size` device pixels; null without a logo. */
export function logoFileOf(manifest: AssetManifest, brandId: string, size: number, format: string): string | null {
  return fileOf(manifest, manifest.brands[brandId]?.logo, size, format);
}

/** Path under the competitions' `assets/` of a competition's or an edition's logo whose longest side fills `size` device pixels; null without one. */
export function competitionLogoFileOf(manifest: AssetManifest, id: string, size: number, format: string): string | null {
  return fileOf(manifest, manifest.competitions[id]?.logo, size, format);
}

/**
 * Path under `pack/assets/` of the club's image in the smallest box that fills `size` device
 * pixels, or the largest box when none does; null when the club has no such image or format.
 */
export function imageFileOf(manifest: AssetManifest, clubId: string, use: keyof ClubImages, size: number, format: string): string | null {
  return fileOf(manifest, manifest.clubs[clubId]?.[use], size, format);
}
