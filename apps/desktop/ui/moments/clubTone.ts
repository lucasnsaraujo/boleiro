import type { ClubTag } from "@boleiro/game-client/moments/momentView";

function lightness(hex: string): number {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
}

/** The club's colour a night scene can warm to: its first colour, or its second when the first is near white. */
export function strongColour(club: ClubTag): string {
  const { primary, secondary } = club.colours;
  if (lightness(primary) < 0.82) return primary;
  return lightness(secondary) < 0.82 ? secondary : "#14231A";
}
