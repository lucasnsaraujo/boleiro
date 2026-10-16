/** The real names an event's text takes, by slot. */
export type Slots = Record<"player" | "club" | "rival" | "age" | "position" | "stadium" | "coach", string>;

/** The text with each `{slot}` replaced by its name; a slot the text doesn't know stays as it is. */
export function fillSlots(text: string, slots: Slots): string {
  return text.replace(/\{(\w+)\}/g, (whole, slot: string) => (Object.hasOwn(slots, slot) ? slots[slot as keyof Slots] : whole));
}
