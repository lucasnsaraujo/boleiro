-- Master database: every import or scrape run is one snapshot, and every data row carries the
-- snapshot it came from, so two runs can be compared row by row (same club or player id).
-- Ids are stable across snapshots: Brazilian clubs by slug ("bahia-ba"), other clubs and players by
-- source id ("tm-31", "tm-352324").
-- `seq` keeps each table's order from its source, which the game's seeded draws depend on.

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  taken_at TEXT NOT NULL,              -- UTC ISO time of the run
  kind TEXT NOT NULL,                  -- "csv-import", "transfermarkt", "transfermarkt-partial" (part of the world); later "fotmob", ...
  note TEXT NOT NULL DEFAULT ''
);

-- The files a run read, so a snapshot can be traced back to its inputs.
CREATE TABLE IF NOT EXISTS snapshot_files (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, path)
);

-- Pages a scrape could not get or read: its data may be missing what those pages hold.
CREATE TABLE IF NOT EXISTS snapshot_failures (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  problem TEXT NOT NULL,               -- "HTTP 503 on https://www.transfermarkt.com/..."
  holds_clubs INTEGER NOT NULL         -- 1 for a league, participants or club squad page: clubs or players may be missing
);

CREATE TABLE IF NOT EXISTS countries (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  code TEXT NOT NULL,                  -- ISO 3166-1 alpha-2
  name TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, code)
);

-- Leagues, cups and continental competitions. `code` is the short label the game uses ("A" for Série A).
CREATE TABLE IF NOT EXISTS competitions (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,                    -- "br-serie-a"
  country_code TEXT,                   -- null for continental and world competitions
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- league | cup | state | continental
  tier INTEGER,                        -- 1 for a top division, null for cups
  code TEXT,
  season INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, id)
);

-- A stadium row per distinct name, region, capacity and pitch: sources disagree on the capacity
-- of some shared grounds, so those become separate rows instead of one with a wrong number.
CREATE TABLE IF NOT EXISTS stadiums (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT,
  capacity INTEGER NOT NULL,
  pitch TEXT NOT NULL,                 -- natural | artificial
  PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS clubs (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT,                         -- Brazilian state, US state, ... when the country has them
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  league_id TEXT,                      -- domestic league this season; null for state-only clubs
  stadium_id TEXT NOT NULL,
  primary_colour TEXT NOT NULL,        -- "#RRGGBB"
  secondary_colour TEXT NOT NULL,
  fanbase INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, id)
);

-- Ids the same club or player has at each source: transfermarkt, fotmob, espn, wikidata, ea.
CREATE TABLE IF NOT EXISTS external_ids (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  entity TEXT NOT NULL,                -- club | player | national_team
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, entity, entity_id, source)
);

-- Where a value came from, one row per entity and field: "transfermarkt", a survey, "guess".
CREATE TABLE IF NOT EXISTS field_sources (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, entity, entity_id, field)
);

-- Crests, kits and logos. `path` is the source file, relative to the repo root; `sha256` its
-- content, so the asset builder converts each distinct image of a kind once.
CREATE TABLE IF NOT EXISTS images (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  entity TEXT NOT NULL,                -- club | competition | sponsor
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- crest | scoreboard_crest | kit | logo | badge (a logo on an opaque tile)
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, entity, entity_id, kind)
);

CREATE TABLE IF NOT EXISTS players (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  club_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  age INTEGER,                         -- as the source gave it, when there is no birth date
  nationalities TEXT NOT NULL,         -- "Argentina/Italy", first is the sporting one
  foot TEXT,                           -- right | left | both
  position_group TEXT NOT NULL,        -- GK | DEF | MID | ATT
  strength INTEGER,                    -- Boleiro's 1-99; null until a rating step has run on the player
  strength_confidence REAL,
  market_value_eur INTEGER,
  contract_until TEXT,                 -- ISO date
  role TEXT,                           -- goleiro | lateral | zagueiro | meia | atacante (pipeline/positions.py)
  PRIMARY KEY (snapshot_id, id)
);

-- The clubs a competition lists this season: a continental draw, the Club World Cup.
CREATE TABLE IF NOT EXISTS competition_clubs (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  competition_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  club_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, competition_id, club_id)
);

CREATE TABLE IF NOT EXISTS national_teams (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,                    -- "brazil"
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  confederation TEXT,
  PRIMARY KEY (snapshot_id, id)
);

-- A national team's last squad. Its players may play for clubs outside the game's world, so the
-- row carries what the team page says about them; `player_id` joins `players` when he is there.
CREATE TABLE IF NOT EXISTS national_team_players (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  team_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  position TEXT NOT NULL,
  role TEXT,
  club_tm_id TEXT,
  club_name TEXT,
  market_value_eur INTEGER,
  caps INTEGER,
  goals INTEGER,
  PRIMARY KEY (snapshot_id, team_id, player_id)
);

-- Rank 0 is the main position, then the secondary ones in the source's order.
CREATE TABLE IF NOT EXISTS player_positions (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  player_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  position TEXT NOT NULL,              -- as the source names it ("Centre-Back", "CB")
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, player_id, rank)
);

-- A club's eleven in its last real match, as a source showed it: one row per starter, keeper first.
CREATE TABLE IF NOT EXISTS club_lineups (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  club_id TEXT NOT NULL,
  slot INTEGER NOT NULL,               -- 0 for the keeper, then the source's order of slots
  formation TEXT NOT NULL,             -- "4-2-3-1"
  player_id TEXT,                      -- null when the starter isn't in the club's squad
  position TEXT NOT NULL,              -- the source's code for the slot (FotMob's positionId)
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, club_id, slot)
);

CREATE TABLE IF NOT EXISTS player_season_stats (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  player_id TEXT NOT NULL,
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  rating REAL,
  goals_assists INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, player_id, source, season)
);

-- One year of a club's money in the country's currency; `size` rows are estimates for a whole
-- league (small, median and large club) where clubs publish nothing.
CREATE TABLE IF NOT EXISTS finances (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  seq INTEGER NOT NULL,
  club_id TEXT,
  league_id TEXT NOT NULL,
  size TEXT,
  season INTEGER NOT NULL,
  currency TEXT NOT NULL,
  revenue_total INTEGER NOT NULL,
  broadcasting INTEGER NOT NULL,
  matchday INTEGER NOT NULL,
  membership INTEGER NOT NULL,
  sponsorship INTEGER NOT NULL,
  player_sales INTEGER NOT NULL,
  wage_bill INTEGER NOT NULL,
  net_debt INTEGER NOT NULL,
  basis TEXT NOT NULL,                 -- published | estimate | guess
  guessed_fields TEXT NOT NULL,        -- ";"-separated column names
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, seq)
);

-- A country's prize money, TV deals and matchday averages for one season, kept as the JSON
-- document the game reads: its shape changes per country more than it is queried.
CREATE TABLE IF NOT EXISTS competition_money (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  country_code TEXT NOT NULL,
  season INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, country_code, season)
);

-- Brands on kits and in the sponsors' offer pool (data/brands.csv). `sector` is betting, kit (a kit
-- maker) or the pool's sector, empty when unknown; `size` only for the pool's brands.
CREATE TABLE IF NOT EXISTS brands (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  size TEXT,                           -- giant | large | medium | small
  is_pool INTEGER NOT NULL,
  wikidata TEXT,
  website TEXT,
  logo_licence TEXT,                   -- the Commons licence, "favicon" for a site icon
  PRIMARY KEY (snapshot_id, id)
);

-- The brands on each club's kit before the betting ban (data/sponsors.csv, from Wikipedia), with the
-- yearly value and end the press reported where it did (data/sponsor-values.csv).
CREATE TABLE IF NOT EXISTS sponsor_deals (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  seq INTEGER NOT NULL,
  club_id TEXT NOT NULL,
  slot TEXT NOT NULL,                  -- master | kit | front | back | sleeves | shorts | socks | number
  rank INTEGER NOT NULL,
  brand_id TEXT NOT NULL,
  yearly_value INTEGER,
  until_season INTEGER,
  value_source TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, seq)
);
