import manifestJson from "@boleiro/data/pack/sponsors/assets.json?raw";
import { logoFileOf, parseAssetManifest } from "@boleiro/data/assetManifest";

const LOGOS = parseAssetManifest(manifestJson);
// Only WebP ships, as for the world's crests (pipeline/build_assets.py).
const LOGO_FILES = import.meta.glob<string>(["./logo/*.webp", "./badge/*.webp"], {
  base: "../../../../packages/data/pack/sponsors/assets/",
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * A brand's logo for a height in CSS pixels: its file at twice the pixels, its width at that height, and
 * whether it is a badge (an opaque tile, as a site icon is) rather than a mark on a clear ground; null without a logo.
 */
export function logoOf(brandId: string, height: number): { url: string; width: number; isBadge: boolean } | null {
  const id = LOGOS.brands[brandId]?.logo;
  const image = id ? LOGOS.images[id] : undefined;
  if (!image) return null;
  const width = Math.round((height * image.width) / image.height);
  const file = logoFileOf(LOGOS, brandId, 2 * Math.max(width, height), "webp");
  const url = file ? LOGO_FILES[`./${file}`] : undefined;
  return url ? { url, width, isBadge: image.kind === "badge" } : null;
}
