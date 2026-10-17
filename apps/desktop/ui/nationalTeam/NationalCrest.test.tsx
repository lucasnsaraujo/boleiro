import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { NationalCrest } from "./NationalCrest.js";

afterEach(cleanup);

const colours = { primary: "#FFDF00", secondary: "#009C3B" };

test("a national team shows its federation's crest, sharp on a retina screen", () => {
  render(<NationalCrest teamId="brazil" code="BRA" colours={colours} size={52} label="Brasil" />);
  const crest = screen.getByRole("img", { name: "Brasil" });
  expect(crest.tagName).toBe("IMG");
  expect(crest.getAttribute("src")).toMatch(/-64[^/]*\.webp$/);
  expect(crest.getAttribute("srcset")).toMatch(/-128[^/]*\.webp 2x$/);
});

test("a team without a crest in the pack, or whose crest fails to load, gets a shield with its FIFA code", () => {
  render(<NationalCrest teamId="atlantis" code="ATL" colours={colours} label="Atlântida" />);
  expect(screen.getByRole("img", { name: "Atlântida" }).textContent).toBe("ATL");
  cleanup();
  render(<NationalCrest teamId="brazil" code="BRA" colours={colours} label="Brasil" />);
  fireEvent.error(screen.getByRole("img", { name: "Brasil" }));
  expect(screen.getByRole("img", { name: "Brasil" }).textContent).toBe("BRA");
});
