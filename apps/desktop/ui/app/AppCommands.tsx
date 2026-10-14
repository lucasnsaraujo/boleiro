import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { COMMAND_IDS, type CommandId } from "./shortcuts.js";

type Handler = () => void;
type Commands = { run: (id: CommandId) => boolean; register: (id: CommandId, handler: Handler) => () => void };
/** What each command does on this screen; `false` leaves it to another screen, or to nothing. */
export type CommandHandlers = Partial<Record<CommandId, Handler | false>>;

function createCommands(): Commands {
  const handlers = new Map<CommandId, Handler[]>();
  return {
    run(id) {
      const handler = handlers.get(id)?.at(-1);
      handler?.();
      return handler !== undefined;
    },
    register(id, handler) {
      handlers.set(id, [...(handlers.get(id) ?? []), handler]);
      return () => handlers.set(id, (handlers.get(id) ?? []).filter((other) => other !== handler));
    },
  };
}

/**
 * The one place the keyboard, the native menu and the screens' own buttons meet: a screen registers
 * what a command does while it is up, and anything can run it. The latest screen to register wins.
 */
const AppCommandsContext = createContext<Commands>(createCommands());

/** Runs a command; false when no screen up now answers it. */
export function useRunCommand(): (id: CommandId) => boolean {
  return useContext(AppCommandsContext).run;
}

/** While mounted, each command in `handlers` runs its latest handler. */
export function useCommands(handlers: CommandHandlers): void {
  const { register } = useContext(AppCommandsContext);
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  const available = COMMAND_IDS.filter((id) => handlers[id]).join();
  useEffect(() => {
    const ids = COMMAND_IDS.filter((id) => available.split(",").includes(id));
    const unregister = ids.map((id) =>
      register(id, () => {
        const handler = latest.current[id];
        if (handler) handler();
      }),
    );
    return () => unregister.forEach((off) => off());
  }, [register, available]);
}
