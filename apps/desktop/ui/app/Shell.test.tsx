import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Select } from "../controls/Select.js";
import { Options } from "../screens/Options.js";
import { ServicesContext, type Services } from "./ServicesContext.js";
import { useCommands, useRunCommand } from "./AppCommands.js";
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
  const screens = ["/", "/hub", "/tables", "/calendar", "/market", "/offers", "/history", "/finances", "/stadium", "/youth", "/round"];
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

test("inside a game the bar has Brasfoot's nine buttons, every one leading to its screen, and the game's day", async () => {
  open(await services(), "/hub");
  const bar = screen.getByRole("navigation", { name: "Telas" });
  expect(within(bar).getAllByRole("link").map((link) => link.textContent)).toEqual(["Agenda", "Tabelas", "Estádio", "Base", "Times", "Busca", "Técnicos", "Histórico", "Opções"]);
  expect(within(bar).getAllByRole("link").every((link) => link.getAttribute("aria-disabled") === null)).toBe(true);
  expect(within(bar).getByRole("link", { name: "Times" }).getAttribute("aria-current")).toBe("page");
  expect(await within(bar).findByText("Qui, 1 jan")).toBeTruthy();
  expect(within(bar).getByText("Temporada 2026")).toBeTruthy();
});

test("the finances light up Times, the screen they hang from", async () => {
  open(await services(), "/finances");
  expect(screen.getByRole("link", { name: "Times" }).getAttribute("aria-current")).toBe("page");
});

test("the F-keys open the bar's screens", async () => {
  const router = open(await services(), "/hub");
  fireEvent.keyDown(document, { key: "F2" });
  expect(await screen.findByRole("heading", { name: "tela /tables" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Tabelas" }).getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(document, { key: "F4" });
  expect(await screen.findByRole("heading", { name: "tela /youth" })).toBeTruthy();
  expect(router.state.location.pathname).toBe("/youth");
  fireEvent.keyDown(document, { key: "F3" });
  expect(await screen.findByRole("heading", { name: "tela /stadium" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "F6" });
  expect(await screen.findByRole("heading", { name: "tela /market" })).toBeTruthy();
});

test("a game key that does nothing on this screen still never reaches the browser, so F5 can't reload a live round", async () => {
  open(await services(), "/round");
  expect(fireEvent.keyDown(document, { key: "F5" })).toBe(false);
  expect(fireEvent.keyDown(document, { key: "F3" })).toBe(false);
  expect(fireEvent.keyDown(document, { key: "F12" })).toBe(true);
});

test("a match key off the round is left to the page, so Space still presses buttons and scrolls", async () => {
  open(await services(), "/hub");
  await screen.findByRole("navigation", { name: "Telas" });
  expect(fireEvent.keyDown(document, { key: " " })).toBe(true);
  expect(fireEvent.keyDown(document, { key: "2" })).toBe(true);
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

/** A stand-in round: Space pauses it, beside a speed button and the Só meus jogos switch. */
function PausableRound({ onPause }: { onPause: () => void }) {
  useCommands({ pausar: onPause });
  return (
    <>
      <button>4x</button>
      <label>
        Só meus jogos
        <input type="checkbox" />
      </label>
    </>
  );
}

function openPausableRound(given: Services) {
  let pauses = 0;
  const router = createMemoryRouter([{ element: <Shell />, children: [{ path: "/round", element: <PausableRound onPause={() => pauses++} /> }] }], { initialEntries: ["/round"] });
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
  return () => pauses;
}

test("Space still pauses the round after the coach clicks one of its buttons or its switch", async () => {
  const pauses = openPausableRound(await services());
  await userEvent.click(screen.getByRole("button", { name: "4x" }));
  expect(fireEvent.keyDown(document.activeElement ?? document, { key: " " })).toBe(false);
  expect(pauses()).toBe(1);
  const mine = screen.getByRole("checkbox", { name: "Só meus jogos" });
  await userEvent.click(mine);
  expect(fireEvent.keyDown(mine, { key: " " })).toBe(false);
  expect(pauses()).toBe(2);
});

test("Space on a control the coach reached with Tab presses that control instead of pausing", async () => {
  const pauses = openPausableRound(await services());
  await userEvent.tab();
  expect(document.activeElement?.textContent).toBe("4x");
  expect(fireEvent.keyDown(document.activeElement ?? document, { key: " " })).toBe(true);
  expect(pauses()).toBe(0);
});

test("holding Space down pauses once, not once per key repeat", async () => {
  const pauses = openPausableRound(await services());
  fireEvent.keyDown(document.body, { key: " " });
  fireEvent.keyDown(document.body, { key: " ", repeat: true });
  fireEvent.keyDown(document.body, { key: " ", repeat: true });
  expect(pauses()).toBe(1);
});

test("holding Space on a clicked button keeps the key repeats from pressing it or scrolling the board", async () => {
  const pauses = openPausableRound(await services());
  await userEvent.click(screen.getByRole("button", { name: "4x" }));
  const button = document.activeElement ?? document;
  expect(fireEvent.keyDown(button, { key: " " })).toBe(false);
  expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
  expect(pauses()).toBe(1);
});

function openShellWith(given: Services, screens: RouteObject[], at: string) {
  const router = createMemoryRouter([{ element: <Shell />, children: screens }], { initialEntries: [at] });
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
  return router;
}

/** Jogo › Novo jogo in the native menu, which Command-N also runs. */
function MenuNewGame() {
  const run = useRunCommand();
  return <button onClick={() => run("novoJogo")}>Jogo › Novo jogo</button>;
}

test("Novo jogo over a game with unsaved play asks first, and goes on once the coach drops it", async () => {
  const given = await services();
  given.game.current = { slotId: "slot-2", coachName: "Tite", unsavedChanges: 1 };
  const router = openShellWith(given, [{ path: "/hub", element: <MenuNewGame /> }, { path: "/new-game", element: <h1>tela /new-game</h1> }], "/hub");
  await userEvent.click(screen.getByRole("button", { name: "Jogo › Novo jogo" }));
  const question = screen.getByRole("alertdialog", { name: "Salvar o jogo aberto?" });
  expect(router.state.location.pathname).toBe("/hub");
  await userEvent.click(within(question).getByRole("button", { name: "Descartar" }));
  expect(router.state.location.pathname).toBe("/new-game");
});

test("Novo jogo over a game its own slot holds whole goes straight on", async () => {
  const router = openShellWith(await services(), [{ path: "/hub", element: <MenuNewGame /> }, { path: "/new-game", element: <h1>tela /new-game</h1> }], "/hub");
  await userEvent.click(screen.getByRole("button", { name: "Jogo › Novo jogo" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(router.state.location.pathname).toBe("/new-game");
});

/** A screen with a dialog up over it, the way the newspaper or a confirm puts one up. */
function ScreenUnderDialog() {
  const [isOpen, setOpen] = useState(true);
  return (
    <>
      <Options />
      {isOpen && (
        <section role="dialog" aria-label="Jornal">
          <button onClick={() => setOpen(false)}>Fechar o jornal</button>
        </section>
      )}
    </>
  );
}

test("while a dialog is up the game keys do nothing, and F5 still can't reload the app", async () => {
  const given = await services();
  const router = openShellWith(given, [{ path: "/hub", element: <ScreenUnderDialog /> }, { path: "/tables", element: <h1>tela /tables</h1> }], "/hub");
  fireEvent.keyDown(document, { key: "m" });
  expect(screen.getByRole("checkbox", { name: "Sem som" })).toHaveProperty("checked", false);
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  expect(fireEvent.keyDown(document, { key: "F2" })).toBe(false);
  expect(fireEvent.keyDown(document, { key: "F5" })).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(router.state.location.pathname).toBe("/hub");
  expect(screen.queryByRole("status")).toBeNull();
  expect(await given.slots.list()).toEqual([]);

  await userEvent.click(screen.getByRole("button", { name: "Fechar o jornal" }));
  fireEvent.keyDown(document, { key: "F2" });
  expect(await screen.findByRole("heading", { name: "tela /tables" })).toBeTruthy();
});

/** A screen with one of the game's selects, the way the market filters by position. */
function ScreenWithSelect() {
  const [group, setGroup] = useState("");
  return (
    <Select
      label="Posição"
      value={group}
      options={[
        { value: "", label: "Todas" },
        { value: "GK", label: "Goleiro" },
        { value: "MID", label: "Meio-campista" },
      ]}
      onChange={setGroup}
    />
  );
}

test("while a select's list is open the game keys do nothing, and letters jump in the list instead", async () => {
  const given = await services();
  const router = openShellWith(given, [{ path: "/hub", element: <ScreenWithSelect /> }, { path: "/tables", element: <h1>tela /tables</h1> }], "/hub");
  const select = screen.getByRole("combobox", { name: "Posição" });
  select.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(fireEvent.keyDown(select, { key: "F2" })).toBe(false);
  await userEvent.keyboard("m");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(router.state.location.pathname).toBe("/hub");
  expect(document.getElementById(select.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe("Meio-campista");

  await userEvent.keyboard("{Escape}");
  fireEvent.keyDown(document, { key: "F2" });
  expect(await screen.findByRole("heading", { name: "tela /tables" })).toBeTruthy();
});

test("a club's page, reached from the market's search, spends the market clock like the search does", async () => {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba", marketClockSeconds: 300 } });
  // The window opens on 5 January; the clock only runs while one is open.
  await engine.apply({ type: "advance", days: [{}, {}, {}, {}] });
  const given: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-2", coachName: "Tite" } } };
  openShellWith(given, [{ path: "/club/:clubId", element: <h1>tela do clube</h1> }], "/club/palmeiras-sp");
  const clock = await screen.findByRole("timer", { name: "Relógio do mercado: 5:00" });
  expect(clock.className).toContain("running");
  expect(await screen.findByRole("timer", { name: "Relógio do mercado: 4:59" }, { timeout: 3_000 })).toBeTruthy();
});
