import { parsePack } from "@boleiro/data/dataPack";
import { parseSponsorsPack } from "@boleiro/data/sponsors";
import { parseWorldPack } from "@boleiro/data/worldPack";
import { parseNationalFootball } from "@boleiro/data/nationalFootball";
import pack from "@boleiro/data/pack/brazil.pack.json.gz?gunzip";
import sponsors from "@boleiro/data/pack/sponsors.pack.json.gz?gunzip";
import armenia from "@boleiro/data/pack/world/am.pack.json.gz?gunzip";
import argentina from "@boleiro/data/pack/world/ar.pack.json.gz?gunzip";
import austria from "@boleiro/data/pack/world/at.pack.json.gz?gunzip";
import azerbaijan from "@boleiro/data/pack/world/az.pack.json.gz?gunzip";
import belgium from "@boleiro/data/pack/world/be.pack.json.gz?gunzip";
import bulgaria from "@boleiro/data/pack/world/bg.pack.json.gz?gunzip";
import bolivia from "@boleiro/data/pack/world/bo.pack.json.gz?gunzip";
import chile from "@boleiro/data/pack/world/cl.pack.json.gz?gunzip";
import colombia from "@boleiro/data/pack/world/co.pack.json.gz?gunzip";
import cyprus from "@boleiro/data/pack/world/cy.pack.json.gz?gunzip";
import czechia from "@boleiro/data/pack/world/cz.pack.json.gz?gunzip";
import germany from "@boleiro/data/pack/world/de.pack.json.gz?gunzip";
import ecuador from "@boleiro/data/pack/world/ec.pack.json.gz?gunzip";
import spain from "@boleiro/data/pack/world/es.pack.json.gz?gunzip";
import france from "@boleiro/data/pack/world/fr.pack.json.gz?gunzip";
import england from "@boleiro/data/pack/world/gb-eng.pack.json.gz?gunzip";
import scotland from "@boleiro/data/pack/world/gb-sct.pack.json.gz?gunzip";
import greece from "@boleiro/data/pack/world/gr.pack.json.gz?gunzip";
import croatia from "@boleiro/data/pack/world/hr.pack.json.gz?gunzip";
import hungary from "@boleiro/data/pack/world/hu.pack.json.gz?gunzip";
import israel from "@boleiro/data/pack/world/il.pack.json.gz?gunzip";
import italy from "@boleiro/data/pack/world/it.pack.json.gz?gunzip";
import netherlands from "@boleiro/data/pack/world/nl.pack.json.gz?gunzip";
import norway from "@boleiro/data/pack/world/no.pack.json.gz?gunzip";
import peru from "@boleiro/data/pack/world/pe.pack.json.gz?gunzip";
import poland from "@boleiro/data/pack/world/pl.pack.json.gz?gunzip";
import portugal from "@boleiro/data/pack/world/pt.pack.json.gz?gunzip";
import paraguay from "@boleiro/data/pack/world/py.pack.json.gz?gunzip";
import slovenia from "@boleiro/data/pack/world/si.pack.json.gz?gunzip";
import slovakia from "@boleiro/data/pack/world/sk.pack.json.gz?gunzip";
import turkey from "@boleiro/data/pack/world/tr.pack.json.gz?gunzip";
import ukraine from "@boleiro/data/pack/world/ua.pack.json.gz?gunzip";
import uruguay from "@boleiro/data/pack/world/uy.pack.json.gz?gunzip";
import venezuela from "@boleiro/data/pack/world/ve.pack.json.gz?gunzip";
import saudiArabia from "@boleiro/data/pack/world/sa.pack.json.gz?gunzip";
import unitedStates from "@boleiro/data/pack/world/us.pack.json.gz?gunzip";
import mexico from "@boleiro/data/pack/world/mx.pack.json.gz?gunzip";
import emirates from "@boleiro/data/pack/world/ae.pack.json.gz?gunzip";
import egypt from "@boleiro/data/pack/world/eg.pack.json.gz?gunzip";
import japan from "@boleiro/data/pack/world/jp.pack.json.gz?gunzip";
import korea from "@boleiro/data/pack/world/kr.pack.json.gz?gunzip";
import morocco from "@boleiro/data/pack/world/ma.pack.json.gz?gunzip";
import newZealand from "@boleiro/data/pack/world/nz.pack.json.gz?gunzip";
import tunisia from "@boleiro/data/pack/world/tn.pack.json.gz?gunzip";
import southAfrica from "@boleiro/data/pack/world/za.pack.json.gz?gunzip";
import nationalTeams from "@boleiro/data/pack/world/national-teams.pack.json.gz?gunzip";
import nationalFootball from "@boleiro/data/pack/national-football.pack.json.gz?gunzip";
import type { GameFiles } from "@boleiro/engine/sim/loadNewGame";
import { europeStart } from "@boleiro/engine/sim/world/europe";
import { guestsStart } from "@boleiro/engine/sim/world/guests";
import { marketLeaguesStart } from "@boleiro/engine/sim/world/marketLeagues";
import { southAmericaStart } from "@boleiro/engine/sim/world/southAmerica";

const FIRST_SEASON = 2026;
const SOUTH_AMERICA_PACKS = [argentina, bolivia, chile, colombia, ecuador, peru, paraguay, uruguay, venezuela].map((text) => parseWorldPack(text));
const EUROPE_PACKS = [
  england, spain, italy, germany, france, portugal, netherlands, turkey, belgium, scotland, austria, greece, czechia,
  croatia, ukraine, poland, norway, slovakia, slovenia, hungary, bulgaria, cyprus, armenia, israel, azerbaijan,
].map((text) => parseWorldPack(text));
const MARKET_PACKS = [saudiArabia, unitedStates, mexico].map((text) => parseWorldPack(text));
const GUEST_PACKS = [emirates, egypt, japan, korea, morocco, newZealand, tunisia, southAfrica].map((text) => parseWorldPack(text));

/** Brazil's pack, the result-only countries of South America, Europe and the market leagues, the Club World Cup's guests, the kit sponsors and the national teams, as a new game in the app plays them. */
export const bundledGameFiles: GameFiles = {
  ...parsePack(pack),
  world: [...southAmericaStart(SOUTH_AMERICA_PACKS, FIRST_SEASON), ...europeStart(EUROPE_PACKS, FIRST_SEASON), ...marketLeaguesStart(MARKET_PACKS, FIRST_SEASON)],
  guests: guestsStart(GUEST_PACKS, FIRST_SEASON),
  sponsors: parseSponsorsPack(sponsors),
  nationalFootball: parseNationalFootball(nationalTeams, nationalFootball),
};
