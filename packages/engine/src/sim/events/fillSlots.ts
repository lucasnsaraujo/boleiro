/** The real names an event's text takes, by slot. */
export type Slots = Record<"player" | "teammate" | "club" | "rival" | "age" | "position" | "stadium" | "coach", string>;

/**
 * The text with each `{slot}` replaced by its name, starting with a capital ("o técnico" opens a
 * headline as "O técnico"); a slot the text doesn't know stays as it is.
 */
export function fillSlots(text: string, slots: Slots): string {
  const filled = text.replace(/\{(\w+)\}/g, (whole, slot: string) => (Object.hasOwn(slots, slot) ? slots[slot as keyof Slots] : whole));
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}
