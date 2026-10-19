import { BOARD_EVENTS } from "./bank/board.js";
import { DISCIPLINE_EVENTS } from "./bank/discipline.js";
import { FAN_EVENTS } from "./bank/fans.js";
import { HEALTH_EVENTS } from "./bank/health.js";
import { LIFE_EVENTS } from "./bank/life.js";
import { PLAYER_EVENTS } from "./bank/players.js";
import { PRESS_EVENTS } from "./bank/press.js";
import { RIVAL_EVENTS } from "./bank/rivals.js";
import { SPONSOR_EVENTS } from "./bank/sponsors.js";
import { SQUAD_EVENTS } from "./bank/squad.js";
import { STAFF_EVENTS } from "./bank/staff.js";
import type { EventType } from "./eventType.js";

/** Every event the game knows, topic by topic (bank/). */
export const EVENT_BANK: readonly EventType[] = [
  ...PLAYER_EVENTS,
  ...SQUAD_EVENTS,
  ...BOARD_EVENTS,
  ...FAN_EVENTS,
  ...PRESS_EVENTS,
  ...STAFF_EVENTS,
  ...RIVAL_EVENTS,
  ...SPONSOR_EVENTS,
  ...LIFE_EVENTS,
  ...DISCIPLINE_EVENTS,
  ...HEALTH_EVENTS,
];
