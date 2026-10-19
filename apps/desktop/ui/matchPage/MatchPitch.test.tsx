import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { createEngineSession } from "@boleiro/game-client/engine/createEngineSession";
import { matchPageAt } from "@boleiro/game-client/matchPage/matchPageAt";
import { MatchPitch } from "./MatchPitch.js";

afterEach(cleanup);

test("the pitch shows both elevens, every player on a spot of his own", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: "flamengo-rj" } });
  for (let step = 0; step < 20 && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  const round = session.apply({ type: "startRound" });
  for (const match of round.matches.slice(0, 6)) {
    const page = session.matchPage(match.fixtureId);
    if (!page) return expect.fail("every match of the round has a page");
    render(<MatchPitch page={page} view={matchPageAt(page, 0)} size="full" />);
    const men = [...screen.getByRole("img", { name: /^Escalações:/ }).querySelectorAll<HTMLElement>(".mp-man")];
    expect(men).toHaveLength(22);
    expect(new Set(men.map((man) => `${man.style.left},${man.style.top}`)).size).toBe(22);
    cleanup();
  }
});
