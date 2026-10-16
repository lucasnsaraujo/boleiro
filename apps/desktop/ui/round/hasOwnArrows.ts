/** Whether the arrow keys belong to the control in focus: a field, a list to pick from or a slider. */
export const hasOwnArrows = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.closest("input, select, textarea, [role='combobox'], [role='listbox'], [role='slider']") !== null || target.isContentEditable);
