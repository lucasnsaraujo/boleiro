import { expect, it } from "vitest";
import { atGround } from "./atGround.js";

it("puts a ground named an arena after 'na' and any other after 'no'", () => {
  expect(["Allianz Arena", "Johan Cruyff ArenA", "Arena Națională", "Estadio Centenario", "MetLife Stadium", "Maracanã"].map(atGround)).toEqual([
    "na Allianz Arena",
    "na Johan Cruyff ArenA",
    "na Arena Națională",
    "no Estadio Centenario",
    "no MetLife Stadium",
    "no Maracanã",
  ]);
});
