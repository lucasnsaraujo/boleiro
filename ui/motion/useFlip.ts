import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP for lists that reorder. After `order` changes, calls `animate` for every `[data-flip]` element
 * inside `container` that changed place, with how far below its new place it was drawn before, in px
 * (negative: it was above). The movement itself is the caller's, so each list keeps its own feel.
 */
export function useFlip(container: RefObject<HTMLElement | null>, order: string, animate: (element: HTMLElement, offset: number) => void): void {
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(order);

  useLayoutEffect(() => {
    const list = container.current;
    if (!list) return;
    const hasMoved = lastOrder.current !== order;
    lastOrder.current = order;
    const next = new Map<string, number>();
    for (const element of list.querySelectorAll<HTMLElement>("[data-flip]")) {
      const key = element.dataset.flip ?? "";
      const top = element.offsetTop;
      next.set(key, top);
      const was = tops.current.get(key);
      if (hasMoved && was !== undefined && Math.abs(was - top) >= 1) animate(element, was - top);
    }
    tops.current = next;
  }, [order]);
}
