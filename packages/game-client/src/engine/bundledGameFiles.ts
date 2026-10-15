import { parsePack } from "@boleiro/data/dataPack";
import { parseWorldPack } from "@boleiro/data/worldPack";
import pack from "@boleiro/data/pack/brazil.pack.json.gz?gunzip";
import argentina from "@boleiro/data/pack/world/ar.pack.json.gz?gunzip";
import bolivia from "@boleiro/data/pack/world/bo.pack.json.gz?gunzip";
import chile from "@boleiro/data/pack/world/cl.pack.json.gz?gunzip";
import colombia from "@boleiro/data/pack/world/co.pack.json.gz?gunzip";
import ecuador from "@boleiro/data/pack/world/ec.pack.json.gz?gunzip";
import peru from "@boleiro/data/pack/world/pe.pack.json.gz?gunzip";
import paraguay from "@boleiro/data/pack/world/py.pack.json.gz?gunzip";
import uruguay from "@boleiro/data/pack/world/uy.pack.json.gz?gunzip";
import venezuela from "@boleiro/data/pack/world/ve.pack.json.gz?gunzip";
import type { GameFiles } from "@boleiro/engine/sim/loadNewGame";
import { southAmericaStart } from "@boleiro/engine/sim/world/southAmerica";

const FIRST_SEASON = 2026;
const SOUTH_AMERICA_PACKS = [argentina, bolivia, chile, colombia, ecuador, peru, paraguay, uruguay, venezuela].map((text) => parseWorldPack(text));

/** Brazil's pack and South America's result-only countries, as a new game in the app plays them. */
export const bundledGameFiles: GameFiles = { ...parsePack(pack), world: southAmericaStart(SOUTH_AMERICA_PACKS, FIRST_SEASON) };
