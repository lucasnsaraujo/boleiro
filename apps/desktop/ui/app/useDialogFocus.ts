import { useEffect, useRef, type RefObject } from "react";

type Options = {
  /** A modal sheet portalled to `<body>` makes everything else on the page inert while it is open. */
  isModal?: boolean;
  /** Where focus goes on close, for a dialog that takes the place of the button that opened it. */
  returnTo?: RefObject<HTMLElement | null>;
};

/** The page's top-level element holding `element`: the sheet's portal, or the app's root. */
function topLevelOf(element: HTMLElement): Element {
  let top: Element = element;
  while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
  return top;
}

/**
 * While `isOpen`, focus sits on the element the returned ref is put on (a dialog's title with
 * tabIndex={-1}); on close it goes back to the element that had it before, or to `returnTo`.
 */
export function useDialogFocus<T extends HTMLElement>(isOpen: boolean, { isModal = false, returnTo }: Options = {}): RefObject<T | null> {
  const target = useRef<T>(null);

  useEffect(() => {
    const element = target.current;
    if (!isOpen || !element) return;
    const opener = document.activeElement;
    const top = topLevelOf(element);
    const madeInert = isModal ? [...document.body.children].filter((child) => child !== top && !child.hasAttribute("inert")) : [];
    for (const child of madeInert) child.setAttribute("inert", "");
    element.focus();
    return () => {
      for (const child of madeInert) child.removeAttribute("inert");
      const back = returnTo?.current ?? opener;
      if (back instanceof HTMLElement) back.focus();
    };
  }, [isOpen, isModal, returnTo]);

  return target;
}
