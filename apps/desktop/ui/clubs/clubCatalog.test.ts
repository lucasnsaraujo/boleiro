import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { clubById, crestUrlOf, initialsOf, plateColours } from "./clubCatalog.js";

test("a club is found by id with its name, state and division", () => {
  expect(clubById("bahia-ba")).toMatchObject({ shortName: "Bahia", state: "BA", division: "A" });
  expect(clubById("nobody")).toBeNull();
});

test("every club with a crest file gets an image url, others get none", () => {
  const bahiaCrest = createHash("sha256").update(readFileSync(join(import.meta.dirname, "../../../../assets/crests/10010.png"))).digest("hex").slice(0, 16);
  expect(crestUrlOf("bahia-ba")).toMatch(new RegExp(`${bahiaCrest}-64.*\\.webp$`));
  expect(crestUrlOf("nobody")).toBeNull();
});

test("initials take the first letters of a multi-word name and the first three of a single word", () => {
  expect(initialsOf("Bahia")).toBe("BAH");
  expect(initialsOf("São Paulo")).toBe("SP");
  expect(initialsOf("Atlético-MG")).toBe("AMG");
  expect(initialsOf("Red Bull Bragantino")).toBe("RBB");
});

test("plate text keeps the club's second colour when it reads well on the first", () => {
  expect(plateColours({ primary: "#1F3A93", secondary: "#FFFFFF" })).toEqual({ background: "#1F3A93", text: "#FFFFFF" });
});

test("plate text falls back to white or black when the club's second colour would be unreadable", () => {
  expect(plateColours({ primary: "#FFFFFF", secondary: "#FFEE00" })).toEqual({ background: "#FFFFFF", text: "#0a0a0a" });
  expect(plateColours({ primary: "#1F3A93", secondary: "#1F3A90" })).toEqual({ background: "#1F3A93", text: "#ffffff" });
});
