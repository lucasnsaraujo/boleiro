import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Options } from "../screens/Options.js";
import { ServicesContext, type Services } from "./ServicesContext.js";
import { Shell } from "./Shell.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const close of closers.splice(0)) close();
});

async function services(isOpen = true): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: isOpen ? { slotId: "slot-2", coachName: "Tite" } : null } };
}

function open(given: Services, at: string) {
  const screens = ["/", "/hub", "/tables", "/calendar", "/market", "/offers", "/history", "/finances", "/round"];
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [...screens.map((path) => ({ path, element: <h1>tela {path}</h1> })), { path: "/options", element: <Options /> }],
      },
    ],
    { initialEntries: [at] },
  );
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
  return router;
}

test("inside a game the bar has Brasfoot's nine buttons, the ones still to come disabled, and the game's day", async () => {
  open(await services(), "/hub");
  const bar = screen.getByRole("navigation", { name: "Telas" });
  expect(within(bar).getAllByRole("link").map((link) => link.textContent)).toEqual(["Agenda", "Tabelas", "Estádio", "Base", "Times", "Busca", "Técnicos", "Histórico", "Opções"]);
  expect(within(bar).getByRole("link", { name: "Estádio" }).getAttribute("aria-disabled")).toBe("true");
  expect(within(bar).getByRole("link", { name: "Base" }).getAttribute("aria-disabled")).toBe("true");
  expect(within(bar).getByRole("link", { name: "Times" }).getAttribute("aria-current")).toBe("page");
  expect(await within(bar).findByText("Qui, 1 jan")).toBeTruthy();
  expect(within(bar).getByText("Temporada 2026")).toBeTruthy();
});

test("the finances light up Times, the screen they hang from", async () => {
  open(await services(), "/finances");
  expect(screen.getByRole("link", { name: "Times" }).getAttribute("aria-current")).toBe("page");
});

test("the F-keys open the bar's screens, and the ones still to come do nothing", async () => {
  const router = open(await services(), "/hub");
  fireEvent.keyDown(document, { key: "F2" });
  expect(await screen.findByRole("heading", { name: "tela /tables" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Tabelas" }).getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(document, { key: "F3" });
  expect(router.state.location.pathname).toBe("/tables");
  fireEvent.keyDown(document, { key: "F6" });
  expect(await screen.findByRole("heading", { name: "tela /market" })).toBeTruthy();
});

test("there is no bar on the start menu or in a live round, and the F-keys can't leave a match", async () => {
  const router = open(await services(), "/round");
  expect(screen.queryByRole("navigation", { name: "Telas" })).toBeNull();
  fireEvent.keyDown(document, { key: "F2" });
  expect(router.state.location.pathname).toBe("/round");
  cleanup();

  open(await services(false), "/");
  expect(screen.queryByRole("navigation", { name: "Telas" })).toBeNull();
  fireEvent.keyDown(document, { key: "F9" });
  expect(await screen.findByRole("heading", { name: "Opções" })).toBeTruthy();
});

test("the save key saves the open game into its own slot and says where", async () => {
  const given = await services();
  open(given, "/hub");
  fireEvent.keyDown(document, { key: "s", metaKey: true, ctrlKey: true });
  expect(screen.queryByRole("status")).toBeNull();
  // jsdom is neither a Mac nor Windows, so the save chord is Ctrl-S.
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  expect((await screen.findByRole("status")).textContent).toBe("Salvo em Jogo 2.");
  expect(await given.slots.list()).toMatchObject([{ id: "slot-2", coachName: "Tite", coachClubId: "bahia-ba" }]);
});

test("Salvar agora in the options saves the open game the same way", async () => {
  const given = await services();
  open(given, "/options");
  await userEvent.click(screen.getByRole("button", { name: "Salvar agora" }));
  expect((await screen.findByRole("status")).textContent).toBe("Salvo em Jogo 2.");
  expect(await given.slots.list()).toHaveLength(1);
});

test("M mutes from any screen, but not while typing", async () => {
  open(await services(), "/options");
  const mute = screen.getByRole("checkbox", { name: "Sem som" });
  fireEvent.keyDown(document, { key: "m" });
  expect(mute).toHaveProperty("checked", true);
  const field = document.createElement("input");
  document.body.append(field);
  fireEvent.keyDown(field, { key: "m" });
  expect(mute).toHaveProperty("checked", true);
  field.remove();
  fireEvent.keyDown(document, { key: "M" });
  expect(mute).toHaveProperty("checked", false);
});
