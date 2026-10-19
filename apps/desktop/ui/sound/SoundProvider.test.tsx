import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext } from "../app/ServicesContext.js";
import { Shell } from "../app/Shell.js";
import { FakeAudioContext, fetchUrlBytes } from "./fakeAudioContext.js";
import { MUSIC } from "./soundCatalog.js";
import { createSoundEngine } from "./soundEngine.js";
import { musicFor, SoundProvider } from "./SoundProvider.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const close of closers.splice(0)) close();
});

function withSound() {
  const contexts: FakeAudioContext[] = [];
  const engine = createSoundEngine({
    createContext: () => {
      const ctx = new FakeAudioContext();
      contexts.push(ctx);
      return ctx;
    },
    fetchBytes: fetchUrlBytes,
  });
  return { engine, contexts };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the menu screens play the theme, the club screens the quiet music, and the round and turning points none", () => {
  expect(["/", "/new-game", "/options"].map(musicFor)).toEqual(["menu", "menu", "menu"]);
  expect(["/hub", "/squad", "/squad/p1", "/tables", "/history", "/offers"].map(musicFor)).toEqual(["hub", "hub", "hub", "hub", "hub", "hub"]);
  expect(["/round", "/season-end", "/sacked"].map(musicFor)).toEqual([null, null, null]);
});

test("sound starts on the first gesture with the screen's music, and buttons click", async () => {
  const { engine, contexts } = withSound();
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          {
            path: "/",
            element: (
              <>
                <button className="btn-main">Começar</button>
                <button>Ver</button>
                <button disabled>Nada</button>
              </>
            ),
          },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  const game = inMemoryEngine();
  closers.push(game.close);
  render(
    <ServicesContext value={{ engine: game.engine, slots: indexedDbSlots(new IDBFactory()), game: { current: null } }}>
      <SoundProvider engine={engine} store={localStorage}>
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
  expect(contexts).toHaveLength(0);

  await userEvent.click(screen.getByRole("button", { name: "Ver" }));
  await settle();
  const ctx = contexts[0];
  expect(ctx?.playing()).toEqual([MUSIC.menu]);
  const afterClick = ctx?.notes() ?? 0;
  expect(afterClick).toBe(1);

  await userEvent.click(screen.getByRole("button", { name: "Começar" }));
  expect(ctx?.notes()).toBe(afterClick + 2);

  await userEvent.click(screen.getByRole("button", { name: "Nada" }));
  expect(ctx?.notes()).toBe(afterClick + 2);
});
