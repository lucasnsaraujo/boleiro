import { createContext, useContext } from "react";

/**
 * Lets a screen that plays days without leaving (the hub, stopped early by news) tell the shell to
 * read the date again for the top bar and the window title. Outside the shell it does nothing.
 */
export const GameClockContext = createContext<{ refresh: () => void }>({ refresh: () => undefined });

export function useGameClock(): { refresh: () => void } {
  return useContext(GameClockContext);
}
