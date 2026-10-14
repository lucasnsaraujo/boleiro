import { cleanup, render } from "@testing-library/react";
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
