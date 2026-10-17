import { expect, test } from "vitest";
import { eventsOfWaitingCoach } from "./hotSeat.js";

test("a waiting coach doesn't hear the seated coach's player counter a renewal offer, only his own players", () => {
  const seated = { type: "renewalCountered", playerId: "p1", months: 24, wage: 100 } as const;
  const own = { type: "renewalCountered", playerId: "p2", months: 12, wage: 200 } as const;
  expect(eventsOfWaitingCoach([seated], [own])).toEqual([own]);
});
