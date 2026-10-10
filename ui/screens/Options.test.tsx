import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import credits from "../../assets/sounds/CREDITS.md?raw";
import { parseCredits } from "../sound/credits.js";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { MUSIC } from "../sound/soundCatalog.js";
import { SoundProvider } from "../sound/SoundProvider.js";
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
