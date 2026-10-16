/** The narrowest a hot-seat board may get before the boards stop standing side by side. */
const MIN_BOARD_PX = 360;
export const SEAT_GAP_PX = 14;

/** How a hot-seat round shows its human coaches' boards: all side by side, or one in focus with its neighbours peeking. */
export type SeatLayout = "sideBySide" | "focus";

/** Side by side when every board gets at least 360 px of the band's `width`; a band not measured yet counts as wide enough. */
export function seatLayoutOf(width: number, boards: number): SeatLayout {
  if (width === 0) return "sideBySide";
  return (width - SEAT_GAP_PX * (boards - 1)) / boards >= MIN_BOARD_PX ? "sideBySide" : "focus";
}
