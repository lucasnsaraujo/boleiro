import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IsoDate } from "@boleiro/engine/sim/gameState";
import type { EggFound } from "@boleiro/engine/sim/eggs/eggBook";
import { useServices } from "../app/ServicesContext.js";
import { useTypedWord } from "../app/useTypedWord.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import "./win98.css";

// The picture shrinks to a line this long before the skin changes behind it, then opens out again (win98.css).
const SWITCH_OFF_MS = 240;
const SWITCH_ON_MS = 520;

/** The coach's next match day from `date` on, if one is booked. */
function nextMatchDay(fixtures: readonly { date: IsoDate; homeId: string; awayId: string; result: unknown }[], clubId: string | null, date: IsoDate): IsoDate | null {
  let next: IsoDate | null = null;
  for (const f of fixtures) {
    if (f.result || f.date < date || (f.homeId !== clubId && f.awayId !== clubId)) continue;
    if (!next || f.date < next) next = f.date;
  }
  return next;
}

/** Puts the skin on the page or takes it off, through a CRT switching off and on again unless the system asks for less motion. */
function useSkinSwitch(isOn: boolean): boolean {
  const [isShown, setShown] = useState(isOn);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = (on: boolean) => {
      if (on) root.dataset.skin = "win98";
      else delete root.dataset.skin;
      setShown(on);
    };
    if ((root.dataset.skin === "win98") === isOn) return;
    if (prefersReducedMotion()) {
      apply(isOn);
      return;
    }
    root.dataset.skinSwitch = "off";
    const swap = window.setTimeout(() => {
      apply(isOn);
      root.dataset.skinSwitch = "on";
    }, SWITCH_OFF_MS);
    const settle = window.setTimeout(() => delete root.dataset.skinSwitch, SWITCH_OFF_MS + SWITCH_ON_MS);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(settle);
      delete root.dataset.skinSwitch;
      apply(isOn);
    };
  }, [isOn]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.skin;
    },
    [],
  );
  return isShown;
}

/**
 * The BRASFOOT egg inside a game: typing the word dresses the game as a Windows 98 program until the
 * coach's next match day is played, or until he types it again or leaves through Iniciar. The first
 * time in a career the game writes the egg down (`onFound`). Outside a game the word is the start
 * menu's tribute, so it is left alone.
 */
export function useWin98Round({ isInGame, date, onFound }: { isInGame: boolean; date: IsoDate | null; onFound: (found: EggFound) => void }): { isShown: boolean; leave: () => void } {
  const { engine } = useServices();
  const [until, setUntil] = useState<IsoDate | null>(null);
  const isOn = until !== null && isInGame;
  const latest = useRef({ isInGame, isOn, onFound });
  useEffect(() => {
    latest.current = { isInGame, isOn, onFound };
  });

  const leave = useCallback(() => setUntil(null), []);
  useTypedWord("brasfoot", () => {
    if (!latest.current.isInGame) return;
    if (latest.current.isOn) {
      leave();
      return;
    }
    void Promise.all([engine.read(["fixtures", "coachClubId", "date"]), engine.apply({ type: "findEgg", eggId: "windows-98" })]).then(([game, found]) => {
      setUntil(nextMatchDay(game.fixtures, game.coachClubId, game.date) ?? game.date);
      if (found) latest.current.onFound(found);
    });
  });

  // The round is over once the game's day has moved past the match day it was typed for.
  useEffect(() => {
    if (until && date && date > until) setUntil(null);
  }, [until, date]);
  useEffect(() => {
    if (!isInGame) setUntil(null);
  }, [isInGame]);

  return { isShown: useSkinSwitch(isOn), leave };
}
