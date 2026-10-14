import { expect, test } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json?raw";

function desktopCsp(): Map<string, string[]> {
  const config: { app: { security: { csp: string } } } = JSON.parse(tauriConfig);
  const directives = config.app.security.csp.split(";").map((directive) => directive.trim().split(/\s+/));
  return new Map(directives.map(([name = "", ...sources]) => [name, sources]));
}

test("the desktop app's CSP lets the sound engine fetch its own mp3 files", () => {
  expect(desktopCsp().get("connect-src")).toContain("'self'");
});

test("the desktop app's CSP shows crests both as bundled files and as inlined data urls", () => {
  expect(desktopCsp().get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:"]));
});
