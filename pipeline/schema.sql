-- Master database: every import or scrape run is one snapshot, and every data row carries the
-- snapshot it came from, so two runs can be compared row by row (same club or player id).
-- Ids are stable across snapshots: clubs by slug ("bahia-ba"), players by source id ("tm-352324").
-- `seq` keeps each table's order from its source, which the game's seeded draws depend on.

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  taken_at TEXT NOT NULL,              -- UTC ISO time of the run
  kind TEXT NOT NULL,                  -- "csv-import" today; later "fotmob", "espn", ...
  note TEXT NOT NULL DEFAULT ''
);

-- The files a run read, so a snapshot can be traced back to its inputs.
CREATE TABLE IF NOT EXISTS snapshot_files (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, path)
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
  entity TEXT NOT NULL,                -- club | player
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

-- Crests, kits and logos. `path` is the source file in the repo; `sha256` its content, so the
-- asset builder converts each distinct image once.
CREATE TABLE IF NOT EXISTS images (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  entity TEXT NOT NULL,                -- club | competition | sponsor
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- crest | scoreboard_crest | kit | logo
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
  club_id TEXT,                        -- null for a free agent
  name TEXT NOT NULL,
  birth_date TEXT,
  age INTEGER,                         -- as the source gave it, when there is no birth date
  nationalities TEXT NOT NULL,         -- "Argentina/Italy", first is the sporting one
  foot TEXT,                           -- right | left | both
  position_group TEXT NOT NULL,        -- GK | DEF | MID | ATT
  strength INTEGER NOT NULL,           -- Boleiro's 1-99
  strength_confidence REAL,
  market_value_eur INTEGER,
  contract_until TEXT,                 -- ISO date
  PRIMARY KEY (snapshot_id, id)
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
