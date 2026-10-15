import { screen, type ByRoleOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Opens a select and clicks one of its options, as the coach does with the mouse. */
export async function pickOption(select: HTMLElement, option: NonNullable<ByRoleOptions["name"]>): Promise<void> {
  await userEvent.click(select);
  await userEvent.click(screen.getByRole("option", { name: option }));
}

/** The names a select offers, read from its open list, which closes again. */
export async function optionNames(select: HTMLElement): Promise<string[]> {
  await userEvent.click(select);
  const names = screen.getAllByRole("option").map((option) => option.textContent ?? "");
  await userEvent.keyboard("{Escape}");
  return names;
}
