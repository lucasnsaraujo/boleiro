/**
 * Whether a file the build sees is one of the data packs' images: Brazil's crests, the world's, the national teams'
 * or the sponsors' logos. They stay files, since inlined as base64 a few thousand small images would bloat the main
 * script the window waits on.
 */
export function isPackImage(file: string): boolean {
  return file.includes("/data/pack/");
}
