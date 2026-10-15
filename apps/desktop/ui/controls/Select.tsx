import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import "./select.css";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Options sharing a group are listed together under its name, in the order they come. */
  group?: string;
};

type Props<T extends string> = {
  /** The select's accessible name, and the small caps word inside the pill unless `caption` replaces it. */
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** What the pill prints before the value; left out, the label. Pass null for none. */
  caption?: ReactNode;
  isDisabled?: boolean;
  className?: string;
};

// Letters typed within this long of each other spell one search, as a native select does.
const TYPE_AHEAD_MS = 500;
const PAGE = 10;
// The list never runs into the window's edge.
const EDGE = 8;
const GAP = 6;
const MAX_HEIGHT = 320;

// Without the popover API (older engines, tests) the list stays where it is, still fixed beside the pill.
const CAN_POP_OVER = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

type Phase = "closed" | "open" | "closing";
type Placement = { top: number; left: number; minWidth: number; maxHeight: number; isAbove: boolean };

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Where the list goes: under the pill, or over it when the window has more room there. */
function placeUnder(trigger: HTMLElement): Placement {
  const box = trigger.getBoundingClientRect();
  const below = window.innerHeight - box.bottom - GAP - EDGE;
  const above = box.top - GAP - EDGE;
  const isAbove = below < Math.min(MAX_HEIGHT, 200) && above > below;
  const maxHeight = Math.max(120, Math.min(MAX_HEIGHT, isAbove ? above : below));
  const left = Math.min(box.left, window.innerWidth - box.width - EDGE);
  return { top: isAbove ? box.top - GAP : box.bottom + GAP, left: Math.max(EDGE, left), minWidth: box.width, maxHeight, isAbove };
}

const isSamePlace = (a: Placement, b: Placement) => a.top === b.top && a.left === b.left && a.minWidth === b.minWidth && a.maxHeight === b.maxHeight && a.isAbove === b.isAbove;

/**
 * The Álbum's select: a pill that opens a sticker-card list. Keyboard as a native select: arrows,
 * Home/End, Page Up/Down, Enter or Space to pick, Escape to leave, Tab to pick and move on, letters to
 * jump. Focus stays on the pill; while the list is open the game's own keys are off.
 */
export function Select<T extends string>({ label, value, options, onChange, caption, isDisabled = false, className }: Props<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [phase, setPhase] = useState<Phase>("closed");
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const chosenIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const chosen = options[chosenIndex];
  const isOpen = phase === "open";

  function open(at: number) {
    if (isDisabled || !options.length) return;
    setActive(Math.min(Math.max(at, 0), options.length - 1));
    setPhase("open");
  }

  function close() {
    setPhase((current) => (current === "closed" ? current : prefersReducedMotion() ? "closed" : "closing"));
  }

  function pick(index: number) {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  }

  /** The option a typed letter leads to: from the one after the cursor for a new letter, from the cursor while the word grows. */
  function typeAhead(letter: string, from: number): number | null {
    const now = Date.now();
    const text = now - typed.current.at > TYPE_AHEAD_MS ? letter : typed.current.text + letter;
    typed.current = { text, at: now };
    const isRepeat = [...text].every((char) => char === text[0]);
    const search = fold(isRepeat ? letter : text);
    const start = text.length === 1 || isRepeat ? from + 1 : from;
    for (let step = 0; step < options.length; step++) {
      const index = (start + step) % options.length;
      if (fold(options[index]?.label ?? "").startsWith(search)) return index;
    }
    return null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (isDisabled || event.metaKey || event.ctrlKey) return;
    const last = options.length - 1;
    const isLetter = event.key.length === 1 && event.key !== " " && !event.altKey;
    const handled = (() => {
      if (!isOpen) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) open(chosenIndex);
        else if (event.key === "Home") open(0);
        else if (event.key === "End") open(last);
        else if (isLetter) open(typeAhead(event.key, chosenIndex) ?? chosenIndex);
        else return false;
        return true;
      }
      switch (event.key) {
        case "ArrowDown":
          if (event.altKey) pick(active);
          else setActive(Math.min(active + 1, last));
          return true;
        case "ArrowUp":
          if (event.altKey) pick(active);
          else setActive(Math.max(active - 1, 0));
          return true;
        case "Home":
          setActive(0);
          return true;
        case "End":
          setActive(last);
          return true;
        case "PageDown":
          setActive(Math.min(active + PAGE, last));
          return true;
        case "PageUp":
          setActive(Math.max(active - PAGE, 0));
          return true;
        case "Enter":
        case " ":
          pick(active);
          return true;
        case "Escape":
          close();
          return true;
        case "Tab":
          pick(active);
          return false;
        default:
          if (!isLetter) return false;
          setActive(typeAhead(event.key, active) ?? active);
          return true;
      }
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Placed before the first frame, then kept beside the pill every frame: a screen sliding in, a scroll or a resize moves it.
  useLayoutEffect(() => {
    if (phase === "closed") return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    let frame = 0;
    const follow = () => {
      const next = placeUnder(trigger);
      setPlacement((current) => (current && isSamePlace(current, next) ? current : next));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // The list goes to the top layer, so no scrolling panel or sheet clips it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (phase !== "closed" && list && CAN_POP_OVER && !list.matches(":popover-open")) list.showPopover();
  }, [phase]);

  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (triggerRef.current?.contains(target) || listRef.current?.contains(target))) return;
      close();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [isOpen]);

  // A list closing with no animation to wait for (none running, or none supported) goes at once.
  useLayoutEffect(() => {
    if (phase !== "closing") return;
    const list = listRef.current;
    if (!list || typeof list.getAnimations !== "function" || list.getAnimations().length === 0) setPhase("closed");
  }, [phase]);

  const groups: { name: string | undefined; items: { option: SelectOption<T>; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const group = groups[groups.length - 1];
    if (group && group.name === option.group) group.items.push({ option, index });
    else groups.push({ name: option.group, items: [{ option, index }] });
  });

  const renderOption = ({ option, index }: { option: SelectOption<T>; index: number }) => (
    <div
      key={option.value}
      id={optionId(index)}
      role="option"
      aria-selected={index === chosenIndex}
      className={index === active ? "select-opt on" : "select-opt"}
      style={{ ["--i" as string]: Math.min(index, 8) }}
      onPointerMove={() => index !== active && setActive(index)}
      onClick={() => pick(index)}
    >
      <i className="ph-bold ph-check" aria-hidden="true" />
      {option.label}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen ? optionId(active) : undefined}
        disabled={isDisabled}
        className={["field", "select", isOpen ? "open" : "", className ?? ""].filter(Boolean).join(" ")}
        onClick={() => (isOpen ? close() : open(chosenIndex))}
        onKeyDown={onKeyDown}
        onBlur={() => isOpen && close()}
      >
        {caption !== null && <small>{caption ?? label}</small>}
        <b>{chosen?.label ?? ""}</b>
        <i className="ph-bold ph-caret-down select-caret" aria-hidden="true" />
      </button>
      {phase !== "closed" && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          popover={CAN_POP_OVER ? "manual" : undefined}
          tabIndex={-1}
          data-state={phase}
          className={placement?.isAbove ? "select-pop above" : "select-pop"}
          style={placement ? { top: placement.top, left: placement.left, minWidth: placement.minWidth, maxHeight: placement.maxHeight } : undefined}
          onPointerDown={(event) => event.preventDefault()}
          // Inside a <label>, a click in the list would otherwise press the pill again and reopen it.
          onClick={(event) => event.preventDefault()}
          onAnimationEnd={(event) => event.target === event.currentTarget && phase === "closing" && setPhase("closed")}
        >
          {groups.map((group, g) =>
            group.name === undefined ? (
              group.items.map(renderOption)
            ) : (
              <div key={`${group.name}-${g}`} role="group" aria-labelledby={`${id}-group-${g}`} className="select-group">
                <span id={`${id}-group-${g}`} className="select-group-name">
                  {group.name}
                </span>
                {group.items.map(renderOption)}
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}
