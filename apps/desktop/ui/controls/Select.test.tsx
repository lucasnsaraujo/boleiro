import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { Select, type SelectOption } from "./Select.js";

afterEach(cleanup);

const POSITIONS: readonly SelectOption<string>[] = [
  { value: "", label: "Todas" },
  { value: "GK", label: "Goleiro" },
  { value: "DEF", label: "Defensor" },
  { value: "MID", label: "Meio-campista" },
  { value: "ATT", label: "Atacante" },
];

/** A select the way a screen keeps one: the value in state, and every change written down. */
function Position({ options = POSITIONS, isDisabled = false }: { options?: readonly SelectOption<string>[]; isDisabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <>
      <Select label="Posição" value={value} options={options} onChange={setValue} isDisabled={isDisabled} />
      <output aria-label="Escolhida">{value || "nenhuma"}</output>
    </>
  );
}

const picked = () => screen.getByRole("status", { name: "Escolhida" }).textContent;
const trigger = () => screen.getByRole("combobox", { name: "Posição" });
const activeOption = () => document.getElementById(trigger().getAttribute("aria-activedescendant") ?? "")?.textContent;

test("it shows its label and the chosen option, and a click on another option picks it and closes the list", async () => {
  render(<Position />);
  expect(trigger().textContent).toContain("Posição");
  expect(trigger().textContent).toContain("Todas");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("listbox")).toBeNull();

  await userEvent.click(trigger());
  const list = screen.getByRole("listbox", { name: "Posição" });
  expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual(["Todas", "Goleiro", "Defensor", "Meio-campista", "Atacante"]);
  expect(within(list).getByRole("option", { name: "Todas" }).getAttribute("aria-selected")).toBe("true");

  await userEvent.click(within(list).getByRole("option", { name: "Defensor" }));
  expect(picked()).toBe("DEF");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(trigger().textContent).toContain("Defensor");
  expect(document.activeElement).toBe(trigger());
});

test("from the keyboard: arrows walk the list, Enter picks, and focus never leaves the select", async () => {
  render(<Position />);
  trigger().focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(activeOption()).toBe("Todas");

  await userEvent.keyboard("{ArrowDown}{ArrowDown}");
  expect(activeOption()).toBe("Defensor");
  await userEvent.keyboard("{ArrowUp}");
  expect(activeOption()).toBe("Goleiro");
  await userEvent.keyboard("{End}");
  expect(activeOption()).toBe("Atacante");
  await userEvent.keyboard("{ArrowDown}");
  expect(activeOption()).toBe("Atacante");
  await userEvent.keyboard("{Home}");
  expect(activeOption()).toBe("Todas");

  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(picked()).toBe("GK");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger());

  await userEvent.keyboard(" ");
  expect(activeOption()).toBe("Goleiro");
});

test("Escape closes the list and keeps the option that was chosen", async () => {
  render(<Position />);
  trigger().focus();
  await userEvent.keyboard("{Enter}{ArrowDown}{ArrowDown}{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(picked()).toBe("nenhuma");
});

test("typing the start of an option's name jumps to it, accents and case aside, and typing the same letter again moves to the next one", async () => {
  const options: SelectOption<string>[] = [
    { value: "", label: "Todos" },
    { value: "sp", label: "São Paulo" },
    { value: "sa", label: "Santos" },
    { value: "sl", label: "Sampaio Corrêa" },
  ];
  render(<Position options={options} />);
  trigger().focus();
  await userEvent.keyboard("sao");
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(activeOption()).toBe("São Paulo");
  await userEvent.keyboard("{Enter}");
  expect(picked()).toBe("sp");

  await new Promise((resolve) => setTimeout(resolve, 600));
  await userEvent.keyboard("{Enter}s");
  expect(activeOption()).toBe("Santos");
  await userEvent.keyboard("s");
  expect(activeOption()).toBe("Sampaio Corrêa");
});

test("Tab picks the option under the cursor and moves on, like a native select", async () => {
  render(
    <>
      <Position />
      <button>Depois</button>
    </>,
  );
  trigger().focus();
  await userEvent.keyboard("{ArrowDown}{End}");
  await userEvent.tab();
  expect(picked()).toBe("ATT");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Depois" }));
});

test("a click outside closes the list without picking", async () => {
  render(
    <>
      <Position />
      <p>Fora</p>
    </>,
  );
  await userEvent.click(trigger());
  await userEvent.hover(screen.getByRole("option", { name: "Atacante" }));
  expect(activeOption()).toBe("Atacante");
  await userEvent.click(screen.getByText("Fora"));
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(picked()).toBe("nenhuma");
});

test("options under a heading come in labelled groups", async () => {
  const options: SelectOption<string>[] = [
    { value: "state-sp", label: "Paulista", group: "Estaduais" },
    { value: "ar", label: "Argentina", group: "América do Sul" },
    { value: "uy", label: "Uruguai", group: "América do Sul" },
  ];
  render(<Position options={options} />);
  await userEvent.click(trigger());
  const south = screen.getByRole("group", { name: "América do Sul" });
  expect(within(south).getAllByRole("option").map((option) => option.textContent)).toEqual(["Argentina", "Uruguai"]);
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(picked()).toBe("ar");
});

test("a disabled select doesn't open", async () => {
  render(<Position isDisabled />);
  await userEvent.click(trigger());
  trigger().focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.queryByRole("listbox")).toBeNull();
});
