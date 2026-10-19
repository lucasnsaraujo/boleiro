import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseCsv } from "./csv.js";
import { LOGO_CREDITS } from "./logoCredits.js";

const BRANDS = parseCsv(readFileSync(join(import.meta.dirname, "..", "..", "..", "data", "brands.csv"), "utf8"));
// The licences that ask nothing of whoever shows the logo; any other one owes its author a credit.
const CREDIT_FREE = ["Public domain", "CC0", "Copyrighted free use", "unknown licence; trademark; via Google favicon service"];

test("every shipped logo whose licence asks for credit is credited, with its brand, licence and source page", () => {
  const owed = BRANDS.filter((brand) => brand.logo_path && !CREDIT_FREE.includes(brand.logo_licence ?? "")).map((brand) => ({
    brandId: brand.id,
    brand: brand.name,
    licence: brand.logo_licence,
    source: brand.logo_source,
  }));
  expect(owed.length).toBeGreaterThan(0);
  expect(LOGO_CREDITS).toEqual(owed);
});
