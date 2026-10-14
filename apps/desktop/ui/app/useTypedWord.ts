import { useEffect, useRef } from "react";

// A checkbox, a slider or a button input takes no letters, so the game's keys still work while one has focus.
const TEXT_FIELDS = "input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=reset]), textarea, select";

/** Whether a key press lands in a text field, where letters are the coach typing, not commands. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches(TEXT_FIELDS));
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
