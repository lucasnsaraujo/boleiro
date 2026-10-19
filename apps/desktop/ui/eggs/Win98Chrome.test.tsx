import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { Win98TaskBar, Win98TitleBar } from "./Win98Chrome.js";

afterEach(cleanup);

test("the 98 round's way out goes back to the game's own year", async () => {
  render(
    <>
      <Win98TitleBar title="Boleiro 98" date="2027-03-14" onLeave={() => {}} />
      <Win98TaskBar task="Boleiro 98" date="2027-03-14" onLeave={() => {}} />
    </>,
  );
  expect(screen.getByRole("button", { name: "Voltar para 2027" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
  expect(within(screen.getByRole("menu", { name: "Iniciar" })).getByRole("menuitem", { name: "Voltar para 2027" })).toBeTruthy();
});

test("without a game day the way out goes back to normal", async () => {
  render(<Win98TaskBar task="Boleiro 98" date={null} onLeave={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Iniciar" }));
  expect(screen.getByRole("menuitem", { name: "Voltar ao normal" })).toBeTruthy();
});
