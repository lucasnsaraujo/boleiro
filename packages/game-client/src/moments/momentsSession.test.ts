import { expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";

test("a coach who retires sees his farewell first, replayed as the album, then his trajectory keeps it", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba", coachName: "Rui Tavares" } });
  session.apply({ type: "advance", days: [{}, {}, {}] });
  expect(session.moment()).toBeNull();
  session.apply({ type: "retireCoach" });
  const farewell = session.moment();
  expect(farewell).toMatchObject({ kind: "retirement", coachName: "Rui Tavares", club: { id: "bahia-ba", name: "Bahia" } });
  if (farewell?.kind !== "retirement") return;
  expect(farewell.eras.map((era) => era.club.id)).toEqual(["bahia-ba"]);
  session.apply({ type: "closeMoment" });
  expect(session.moment()).toBeNull();
  expect(session.momentView(farewell.id)).toMatchObject({ kind: "retirement" });
  const trajectory = session.trajectory();
  expect(trajectory).toMatchObject({ coachName: "Rui Tavares", bands: [{ club: { id: "bahia-ba" } }] });
  expect(session.read(["coachClubId"]).coachClubId).toBeNull();
  expect(() => session.apply({ type: "retireCoach" })).toThrow("already retired");
});

test("an old save without moments loads and plays on with none waiting", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  session.apply({ type: "advance", days: [{}] });
  const saved = JSON.parse(session.save());
  delete saved.game.history.coach.moments;
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: JSON.stringify(saved) });
  loaded.apply({ type: "advance", days: [{}, {}] });
  expect(loaded.moment()).toBeNull();
  expect(loaded.read(["history"]).history.coach.moments?.queue).toEqual([]);
});
