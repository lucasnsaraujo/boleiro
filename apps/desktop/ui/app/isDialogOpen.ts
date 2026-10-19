/**
 * Whether a modal dialog (a confirm, a sheet, the newspaper) or a select's list is up: the game's keys wait until it closes,
 * Escape closes it. A dialog counts unless it says it is not modal (`aria-modal="false"`), like the match's side panel that
 * stays open beside the board while the clock runs.
 */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"], [role="combobox"][aria-expanded="true"]') !== null;
}
