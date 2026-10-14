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

test("a crest picks the variant that fills its size, and a twice-as-large one for sharp screens", () => {
  render(<Crest club={bahia} size={46} />);
  const crest = screen.getByRole("img", { name: "Bahia" });
  expect(crest.getAttribute("src")).toMatch(/-64[^/]*\.webp$/);
  expect(crest.getAttribute("srcset")).toMatch(/-128[^/]*\.webp 2x$/);
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

test("after one club's crest fails, the next club still shows its own crest image", () => {
  const { rerender } = render(<Crest club={bahia} />);
  fireEvent.error(screen.getByRole("img", { name: "Bahia" }));
  rerender(<Crest club={{ id: "vitoria-ba", shortName: "Vitória", colours: { primary: "#CC1010", secondary: "#080808" } }} />);
  expect(screen.getByRole("img", { name: "Vitória" }).tagName).toBe("IMG");
});
