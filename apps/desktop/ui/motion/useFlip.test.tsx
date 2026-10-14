import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useFlip } from "./useFlip.js";

const ROW_HEIGHT = 40;

// jsdom has no layout: each row sits ROW_HEIGHT below the one before it.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return Array.from(document.querySelectorAll("[data-flip]")).indexOf(this) * ROW_HEIGHT;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function List({ order, onMove }: { order: readonly string[]; onMove: (key: string, offset: number) => void }) {
  const list = useRef<HTMLUListElement>(null);
  useFlip(list, order.join(), (element, offset) => onMove(element.dataset.flip ?? "", offset));
  return (
    <ul ref={list}>
      {order.map((key) => (
        <li key={key} data-flip={key}>
          {key}
        </li>
      ))}
    </ul>
  );
}

test("rows that change places are told how far they were drawn from their new place", () => {
  const moves: [string, number][] = [];
  const onMove = (key: string, offset: number) => moves.push([key, offset]);
  const { rerender } = render(<List order={["a", "b", "c"]} onMove={onMove} />);
  expect(moves).toEqual([]);
  rerender(<List order={["c", "a", "b"]} onMove={onMove} />);
  expect(moves).toEqual([
    ["c", 2 * ROW_HEIGHT],
    ["a", -ROW_HEIGHT],
    ["b", -ROW_HEIGHT],
  ]);
});

test("a render that keeps the order moves nothing", () => {
  const moves: string[] = [];
  const { rerender } = render(<List order={["a", "b"]} onMove={(key) => moves.push(key)} />);
  rerender(<List order={["a", "b"]} onMove={(key) => moves.push(key)} />);
  expect(moves).toEqual([]);
});
