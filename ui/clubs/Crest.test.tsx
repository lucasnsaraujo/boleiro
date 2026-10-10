import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Crest } from "./Crest.js";

afterEach(cleanup);

const bahia = { id: "bahia-ba", shortName: "Bahia", colours: { primary: "#FFFFFF", secondary: "#FF0000" } };
const unknown = { id: "sem-escudo-xx", shortName: "Sem Escudo", colours: { primary: "#004433", secondary: "#FFFFFF" } };

test("a club with a crest file shows the crest image", () => {
  render(<Crest club={bahia} />);
  expect(screen.getByRole("img", { name: "Bahia" }).tagName).toBe("IMG");
});

test("a club without a crest shows its initials on its colours", () => {
  render(<Crest club={unknown} />);
  expect(screen.getByRole("img", { name: "Sem Escudo" }).textContent).toBe("SE");
});

test("a crest image that fails to load falls back to the initials", () => {
  render(<Crest club={bahia} />);
  fireEvent.error(screen.getByRole("img", { name: "Bahia" }));
  expect(screen.getByRole("img", { name: "Bahia" }).textContent).toBe("BAH");
});
