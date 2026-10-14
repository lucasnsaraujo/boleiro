import { parsePack } from "@boleiro/data/dataPack";
import pack from "@boleiro/data/pack/brazil.pack.json.gz?gunzip";
import type { GameFiles } from "@boleiro/engine/sim/loadNewGame";

export const bundledGameFiles: GameFiles = parsePack(pack);
