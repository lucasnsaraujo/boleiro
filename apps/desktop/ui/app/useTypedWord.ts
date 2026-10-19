import { useEffect, useRef } from "react";

// A checkbox, a slider or a button input takes no letters, so the game's keys still work while one has focus.
const TEXT_FIELDS = "input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=reset]), textarea, select";

/** Whether a key press lands in a text field, where letters are the coach typing, not commands. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches(TEXT_FIELDS));
}

// A word's first letter alone could be anything the coach meant; from its second on, he is typing the word.
const SURE_LETTERS = 2;

/**
 * Runs `onTyped` when the coach types `word` on the screen, letter by letter, outside any text field
 * and without modifiers. Case and pauses don't matter; a wrong letter starts the word over. Once the
 * coach is surely typing the word, its letters are kept from the game's shortcuts (the live table's T).
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
      const keys = typed + event.key.toLowerCase();
      let length = Math.min(keys.length, wanted.length);
      while (length > 0 && !keys.endsWith(wanted.slice(0, length))) length--;
      typed = wanted.slice(0, length);
      if (length >= SURE_LETTERS) event.preventDefault();
      if (typed !== wanted) return;
      typed = "";
      latest.current();
    };
    // Heard while the key goes down to the page, before the shell's shortcuts hear it on its way back up.
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [word]);
}
