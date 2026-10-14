import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

/**
 * Runs `onTyped` when the coach types `word` on the screen, letter by letter, outside any text field
 * and without modifiers. Case and pauses don't matter; a wrong letter starts the word over.
 */
export function useTypedWord(word: string, onTyped: () => void): void {
  const latest = useRef(onTyped);
  useEffect(() => {
    latest.current = onTyped;
  });
  useEffect(() => {
    const wanted = word.toLowerCase();
    let typed = "";
    const onKey = (event: KeyboardEvent) => {
      if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      typed = (typed + event.key.toLowerCase()).slice(-wanted.length);
      if (typed !== wanted) return;
      typed = "";
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [word]);
}
