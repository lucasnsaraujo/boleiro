import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Shell } from "../app/Shell.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.skin;
  for (const close of closers.splice(0)) close();
});

async function services(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-2", coachName: "Tite" } } };
}

function open(given: Services, at: string) {
  const router = createMemoryRouter(
    [{ element: <Shell />, children: ["/", "/hub", "/tables", "/round", "/history"].map((path) => ({ path, element: <h1>tela {path}</h1> })) }],
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

const skin = () => document.documentElement.dataset.skin;

test("typing brasfoot in a game dresses it as Windows 98 until the coach's next match is played, and writes the egg down", async () => {
  const given = await services();
  const router = open(given, "/hub");
  await screen.findByRole("navigation", { name: "Telas" });
  await userEvent.keyboard("brasfoot");
  await waitFor(() => expect(skin()).toBe("win98"));
  expect(await screen.findByRole("toolbar", { name: "Barra de tarefas" })).toBeTruthy();
  expect((await given.engine.eggAlbum()).found.map((sticker) => sticker.eggId)).toEqual(["windows-98"]);

  await act(() => router.navigate("/tables"));
  expect(skin()).toBe("win98");
  await act(() => router.navigate("/round"));
  expect(skin()).toBe("win98");
  for (let step = 0; step < 30 && (await given.engine.apply({ type: "playToMatchDay" })).stop !== "matchDay"; step++);
  await given.engine.apply({ type: "startRound" });
  await given.engine.apply({ type: "finishRound" });
  await act(() => router.navigate("/hub"));
  await waitFor(() => expect(skin()).toBeUndefined());
});

test("Iniciar takes the game back to 2026, and the start menu's brasfoot belongs to the tribute", async () => {
  const given = await services();
  const router = open(given, "/hub");
  await screen.findByRole("navigation", { name: "Telas" });
  await userEvent.keyboard("brasfoot");
  await userEvent.click(await screen.findByRole("button", { name: "Iniciar" }));
  await userEvent.click(within(screen.getByRole("menu", { name: "Iniciar" })).getByRole("menuitem", { name: "Voltar para 2026" }));
  await waitFor(() => expect(skin()).toBeUndefined());
  expect(screen.queryByRole("toolbar", { name: "Barra de tarefas" })).toBeNull();

  await act(() => router.navigate("/"));
  await userEvent.keyboard("brasfoot");
  expect(skin()).toBeUndefined();
});

test("a rare sticker found in play is revealed on the club screen, out of the way, once; the coach can close it or follow it to the album", async () => {
  const given = await services();
  const router = open(given, "/hub");
  await screen.findByRole("navigation", { name: "Telas" });
  await userEvent.keyboard("brasfoot");
  const reveal = await screen.findByRole("complementary", { name: "Figurinha rara" });
  expect(within(reveal).getByText("Rodada de 1998")).toBeTruthy();
  await userEvent.click(within(reveal).getByRole("button", { name: "Fechar" }));
  await waitFor(() => expect(screen.queryByRole("complementary", { name: "Figurinha rara" })).toBeNull());

  await act(() => router.navigate("/tables"));
  await act(() => router.navigate("/hub"));
  expect(screen.queryByRole("complementary", { name: "Figurinha rara" })).toBeNull();
});

test("a sticker found away from the club screen waits there for the coach", async () => {
  const given = await services();
  const router = open(given, "/tables");
  await screen.findByRole("navigation", { name: "Telas" });
  await userEvent.keyboard("brasfoot");
  await waitFor(() => expect(skin()).toBe("win98"));
  expect(screen.queryByRole("complementary", { name: "Figurinha rara" })).toBeNull();
  await act(() => router.navigate("/hub"));
  expect(await screen.findByRole("complementary", { name: "Figurinha rara" })).toBeTruthy();
});

test("Ver no álbum opens the history's rarities", async () => {
  const given = await services();
  const router = open(given, "/hub");
  await screen.findByRole("navigation", { name: "Telas" });
  await userEvent.keyboard("brasfoot");
  const reveal = await screen.findByRole("complementary", { name: "Figurinha rara" });
  await userEvent.click(within(reveal).getByRole("link", { name: "Ver no álbum" }));
  expect(router.state.location.pathname).toBe("/history");
  expect(router.state.location.search).toBe("?aba=raridades");
});
