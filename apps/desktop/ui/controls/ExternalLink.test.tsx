import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";
import capability from "../../src-tauri/capabilities/default.json?raw";
import { ExternalLink } from "./ExternalLink.js";

const PAGE = "https://freesound.org/s/1/";

afterEach(() => {
  cleanup();
  clearMocks();
  vi.unstubAllGlobals();
});

function recordIpc(): { cmd: string; args: unknown }[] {
  const calls: { cmd: string; args: unknown }[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
  });
  return calls;
}

test("in the desktop app a link opens its page in the system's browser instead of the game's window", async () => {
  vi.stubGlobal("isTauri", true);
  const calls = recordIpc();
  render(<ExternalLink href={PAGE}>Crowd</ExternalLink>);
  expect(fireEvent.click(screen.getByRole("link", { name: "Crowd" }))).toBe(false);
  await vi.waitFor(() => expect(calls).toEqual([{ cmd: "plugin:opener|open_url", args: { url: PAGE } }]));
});

test("in a browser tab the link opens a new tab, as any link does", () => {
  const calls = recordIpc();
  render(<ExternalLink href={PAGE}>Crowd</ExternalLink>);
  const link = screen.getByRole("link", { name: "Crowd" });
  expect(link.getAttribute("target")).toBe("_blank");
  expect(fireEvent.click(link)).toBe(true);
  expect(calls).toEqual([]);
});

test("the desktop app may hand only https pages to the system's opener", () => {
  const { permissions }: { permissions: (string | { identifier: string; allow?: unknown })[] } = JSON.parse(capability);
  const opener = permissions.filter((permission) => (typeof permission === "string" ? permission : permission.identifier).startsWith("opener:"));
  expect(opener).toEqual([{ identifier: "opener:allow-open-url", allow: [{ url: "https://*" }] }]);
});
