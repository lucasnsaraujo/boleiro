import { describe, expect, it } from "vitest";
import { loadClubs } from "./clubs.js";
import { crestOf, loadCrests, parseCrests } from "./crests.js";

const HEADER = "club_id,tm_id,crest,crest_source,scoreboard_crest,scoreboard_crest_source";

describe("crestOf", () => {
  const crests = parseCrests(
    [
      HEADER,
      "flamengo-rj,614,assets/crests/614.png,transfermarkt,assets/crests/scoreboard/614.png,espn team 819",
      "tiny-ac,999,assets/crests/999.png,transfermarkt,,",
      "lost-am,998,,,,",
    ].join("\n"),
  );

  it("returns the small crest and the scoreboard crest of a club ESPN matched", () => {
    expect(crestOf(crests, "flamengo-rj")).toEqual({
      crest: "assets/crests/614.png",
      scoreboardCrest: "assets/crests/scoreboard/614.png",
    });
  });

  it("returns no scoreboard crest for a club ESPN did not match", () => {
    expect(crestOf(crests, "tiny-ac")).toEqual({ crest: "assets/crests/999.png", scoreboardCrest: null });
  });

  it("returns nothing for a club whose crest was not downloaded", () => {
    expect(crestOf(crests, "lost-am")).toBeNull();
  });

  it("returns nothing for a club missing from the manifest", () => {
    expect(crestOf(crests, "nobody-sp")).toBeNull();
  });
});

describe("loadCrests", () => {
  const crests = loadCrests();
  const clubs = loadClubs();
  const { existsSync } = process.getBuiltinModule("node:fs");
  const { join } = process.getBuiltinModule("node:path");
  const root = join(import.meta.dirname, "..", "..");

  it("resolves every club to a crest file that exists", () => {
    const missing = clubs.filter((club) => {
      const crest = crestOf(crests, club.id);
      return crest === null || !existsSync(join(root, crest.crest));
    });
    expect(missing.map((club) => club.id)).toEqual([]);
  });

  it("points every scoreboard crest at a file that exists", () => {
    const missing = clubs.filter((club) => {
      const scoreboard = crestOf(crests, club.id)?.scoreboardCrest;
      return scoreboard && !existsSync(join(root, scoreboard));
    });
    expect(missing.map((club) => club.id)).toEqual([]);
  });

  it("has a scoreboard crest for every Série A club", () => {
    const without = clubs.filter((club) => club.division === "A" && !crestOf(crests, club.id)?.scoreboardCrest);
    expect(without.map((club) => club.id)).toEqual([]);
  });
});
