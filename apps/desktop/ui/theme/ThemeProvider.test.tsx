import tokens from "@boleiro/design-tokens/tokens.json";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, test } from "vitest";
import { ThemeProvider } from "./ThemeProvider.js";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

test("a saved dark theme is on the page before the first frame, so a dark player never sees cream paper flash", () => {
  const seen: (string | undefined)[] = [];
  function FirstFrame() {
    useEffect(() => void seen.push(document.documentElement.dataset.theme), []);
    return null;
  }
  const store = { getItem: () => "dark", setItem: () => undefined };
  render(
    <ThemeProvider store={store}>
      <FirstFrame />
    </ThemeProvider>,
  );
  expect(seen).toEqual(["dark"]);
});

test("in the desktop app the window behind the page turns to the theme's paper, so growing it shows no cream band at a dark player", async () => {
  mockWindows("main");
  const painted: { cmd: string; color: unknown }[] = [];
  mockIPC((cmd, args) => {
    if (cmd.endsWith("background_color")) painted.push({ cmd, color: args && "value" in args ? args.value : null });
  });
  Object.assign(globalThis, { isTauri: true });
  const store = { getItem: () => "dark", setItem: () => undefined };
  try {
    render(
      <ThemeProvider store={store}>
        <p />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(painted).toEqual([
        { cmd: "plugin:window|set_background_color", color: tokens.color.dark.paper },
        { cmd: "plugin:webview|set_webview_background_color", color: tokens.color.dark.paper },
      ]),
    );
  } finally {
    Reflect.deleteProperty(globalThis, "isTauri");
    clearMocks();
  }
});
