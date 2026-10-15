import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import credits from "../../../../assets/sounds/CREDITS.md?raw";
import { parseCredits } from "../sound/credits.js";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { MUSIC } from "../sound/soundCatalog.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { ThemeProvider } from "../theme/ThemeProvider.js";
import { Options } from "./Options.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function openOptions(sound = unlockedFakeSound()) {
  const router = createMemoryRouter(
    [
      { path: "/options", element: <Options /> },
      { path: "/", element: <p>Início</p> },
    ],
    { initialEntries: ["/options"] },
  );
  render(
    <SoundProvider engine={sound.engine} store={localStorage}>
      <RouterProvider router={router} />
    </SoundProvider>,
  );
  return sound;
}

test("the volumes and the mute are kept when the game is opened again", async () => {
  openOptions();
  fireEvent.change(screen.getByRole("slider", { name: "Música" }), { target: { value: "30" } });
  fireEvent.change(screen.getByRole("slider", { name: "Efeitos" }), { target: { value: "55" } });
  await userEvent.click(screen.getByRole("checkbox", { name: "Sem som" }));
  cleanup();

  openOptions();
  expect(screen.getByRole("slider", { name: "Música" })).toHaveProperty("value", "30");
  expect(screen.getByRole("slider", { name: "Efeitos" })).toHaveProperty("value", "55");
  expect(screen.getByRole("checkbox", { name: "Sem som" })).toHaveProperty("checked", true);
  expect(screen.getByText("30%")).toBeTruthy();
});

test("the music slider changes how loud the music plays, and the mute silences it", async () => {
  const sound = openOptions();
  sound.engine.playMusic("menu");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const full = sound.ctx.loudness(MUSIC.menu);
  fireEvent.change(screen.getByRole("slider", { name: "Música" }), { target: { value: "20" } });
  expect(sound.ctx.loudness(MUSIC.menu)).toBeLessThan(full);
  await userEvent.click(screen.getByRole("checkbox", { name: "Sem som" }));
  expect(sound.ctx.loudness(MUSIC.menu)).toBe(0);
});

test("the paper follows the system until the coach picks one, and his pick is kept", async () => {
  const theme = () => (
    <ThemeProvider store={localStorage}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={createMemoryRouter([{ path: "/options", element: <Options /> }], { initialEntries: ["/options"] })} />
      </SoundProvider>
    </ThemeProvider>
  );
  render(theme());
  const themes = screen.getByRole("radiogroup", { name: "Tema" });
  expect(within(themes).getByRole("radio", { name: "Igual ao sistema" })).toHaveProperty("checked", true);
  await userEvent.click(within(themes).getByRole("radio", { name: "Escuro" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  cleanup();

  render(theme());
  expect(screen.getByRole("radio", { name: "Escuro" })).toHaveProperty("checked", true);
  await userEvent.click(screen.getByRole("radio", { name: "Claro" }));
  expect(document.documentElement.dataset.theme).toBe("light");
});

test("the shortcut sheet lists each bar screen on its F-key and the keys that work on any screen", () => {
  openOptions();
  const sheet = screen.getByRole("list", { name: "Atalhos" });
  const rows = within(sheet).getAllByRole("listitem").map((row) => row.textContent);
  expect(rows).toEqual(expect.arrayContaining(["F1Agenda", "F2Tabelas", "F5Times", "F9Opções", "EJogar rodada", "MSem som"]));
  expect(rows.some((row) => /^(⌘|Ctrl)SSalvar$/.test(row ?? ""))).toBe(true);
  expect(within(sheet).getByText("Base").closest("li")?.getAttribute("aria-disabled")).toBeNull();
});

test("the credits list every sound with its author, licence and source", () => {
  openOptions();
  const list = screen.getByRole("list", { name: "Créditos" });
  const rows = parseCredits(credits);
  expect(within(list).getAllByRole("listitem")).toHaveLength(rows.length);
  for (const row of rows) {
    const item = within(list).getByRole("link", { name: row.sound }).closest("li");
    expect(item?.textContent).toContain(row.author);
    expect(item?.textContent).toContain(row.licence);
    expect(within(list).getByRole("link", { name: row.sound })).toHaveProperty("href", row.source);
  }
});
