import { expect, test } from "vitest";
import { hasMica, platformOf, windowChrome } from "./platform.js";

test("the platform comes from the webview's user agent", () => {
  expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("mac");
  expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("windows");
  expect(platformOf("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
});

test("the desktop app puts its platform's window controls in the game's header; a browser tab puts none", () => {
  expect(windowChrome("mac", true, "")).toBe("mac");
  expect(windowChrome("windows", true, "")).toBe("windows");
  expect(windowChrome("other", true, "")).toBe("none");
  expect(windowChrome("mac", false, "")).toBe("none");
});

test("a dev preview can ask for either platform's chrome", () => {
  expect(windowChrome("mac", false, "?chrome=windows")).toBe("windows");
  expect(windowChrome("windows", false, "?chrome=mac")).toBe("mac");
  expect(windowChrome("mac", false, "?chrome=linux")).toBe("none");
});

test("only Windows 11 has Mica behind the window; Windows 10 or an unknown version keeps opaque paper", () => {
  expect(hasMica("15.0.0")).toBe(true);
  expect(hasMica("13.0.0")).toBe(true);
  expect(hasMica("10.0.0")).toBe(false);
  expect(hasMica("0.3.0")).toBe(false);
  expect(hasMica(null)).toBe(false);
});
