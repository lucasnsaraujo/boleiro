import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { RangeSlider } from "./RangeSlider.js";

afterEach(cleanup);

function Strength() {
  const [range, setRange] = useState<[number, number]>([40, 90]);
  return (
    <>
      <RangeSlider label="Força" min={40} max={90} value={range} onChange={setRange} />
      <output aria-label="Faixa">{range.join("–")}</output>
    </>
  );
}

const low = () => screen.getByRole("slider", { name: "Força mínima" });
const high = () => screen.getByRole("slider", { name: "Força máxima" });
const range = () => screen.getByRole("status", { name: "Faixa" }).textContent;

test("it shows both ends as numbers and as two sliders with their bounds", () => {
  render(<Strength />);
  const group = screen.getByRole("group", { name: "Força" });
  expect(group.textContent).toContain("40");
  expect(group.textContent).toContain("90");
  expect(low().getAttribute("aria-valuenow")).toBe("40");
  expect(low().getAttribute("aria-valuemin")).toBe("40");
  expect(high().getAttribute("aria-valuenow")).toBe("90");
  expect(high().getAttribute("aria-valuemax")).toBe("90");
});

test("arrows move a handle by one, Page keys by five, Home and End to its limits", async () => {
  render(<Strength />);
  low().focus();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
  expect(range()).toBe("43–90");
  await userEvent.keyboard("{PageUp}{ArrowLeft}");
  expect(range()).toBe("47–90");
  high().focus();
  await userEvent.keyboard("{PageDown}{PageDown}{ArrowDown}");
  expect(range()).toBe("47–79");
  await userEvent.keyboard("{End}");
  expect(range()).toBe("47–90");
  low().focus();
  await userEvent.keyboard("{Home}");
  expect(range()).toBe("40–90");
});

test("the handles can meet but never cross", async () => {
  render(<Strength />);
  high().focus();
  await userEvent.keyboard("{Home}");
  expect(range()).toBe("40–40");
  low().focus();
  await userEvent.keyboard("{End}{ArrowRight}");
  expect(range()).toBe("40–40");
  high().focus();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  low().focus();
  await userEvent.keyboard("{End}");
  expect(range()).toBe("42–42");
});

test("dragging on the track moves the nearer handle to the pointer", () => {
  render(<Strength />);
  const track = screen.getByRole("group", { name: "Força" }).querySelector<HTMLElement>(".range-track");
  if (!track) throw new Error("no track");
  track.getBoundingClientRect = () => ({ x: 100, y: 0, left: 100, top: 0, right: 200, bottom: 10, width: 100, height: 10, toJSON: () => ({}) });
  fireEvent.pointerDown(track, { clientX: 120, pointerId: 1 });
  expect(range()).toBe("50–90");
  fireEvent.pointerMove(track, { clientX: 130, pointerId: 1 });
  expect(range()).toBe("55–90");
  fireEvent.pointerUp(track, { pointerId: 1 });
  fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
  expect(range()).toBe("55–90");
  fireEvent.pointerDown(track, { clientX: 190, pointerId: 2 });
  expect(range()).toBe("55–85");
});
