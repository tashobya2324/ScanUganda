/**
 * Database schema as ordered migrations (SQLite dialect, kept portable).
 * The API applies any migration whose `id` it has not recorded yet.
 * Never edit a released migration: add a new one.
 *
 * Conventions: ids are text (ULID/UUID); timestamps are epoch milliseconds;
 * coordinates are decimal degrees.
 */

export interface Migration {
  id: string
  sql: string
}

export const migrations: Migration[] = [
  {
    id: "001_init",
    sql: /* sql */ `
CREATE TABLE manufacturers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('admin','manufacturer','inspector')),
  manufacturer_id  TEXT REFERENCES manufacturers(id),
  created_at       INTEGER NOT NULL,
  CHECK (role <> 'manufacturer' OR manufacturer_id IS NOT NULL)
);

CREATE TABLE regions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  radius_km  REAL NOT NULL CHECK (radius_km > 0)
);

/* Public halves of signing keys; private keys never enter the database. */
CREATE TABLE signing_keys (
  id               TEXT PRIMARY KEY,
  manufacturer_id  TEXT NOT NULL REFERENCES manufacturers(id),
  public_key       TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  retired_at       INTEGER
);

CREATE TABLE products (
  id               TEXT PRIMARY KEY,
  manufacturer_id  TEXT NOT NULL REFERENCES manufacturers(id),
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('FOOD','BEVERAGE','COSMETIC','AGRO_CHEMICAL')),
  pack_size        TEXT NOT NULL
);

CREATE TABLE batches (
  id               TEXT PRIMARY KEY,
  product_id       TEXT NOT NULL REFERENCES products(id),
  manufacturer_id  TEXT NOT NULL REFERENCES manufacturers(id),
  batch_code       TEXT NOT NULL,
  key_id           TEXT NOT NULL REFERENCES signing_keys(id),
  manufactured_at  INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  recalled_at      INTEGER,
  recall_reason    TEXT,
  UNIQUE (manufacturer_id, batch_code),
  CHECK (expires_at > manufactured_at),
  CHECK ((recalled_at IS NULL) = (recall_reason IS NULL))
);

/* Empty set for a batch means distributed nationwide. */
CREATE TABLE batch_regions (
  batch_id   TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  region_id  TEXT NOT NULL REFERENCES regions(id),
  PRIMARY KEY (batch_id, region_id)
);

CREATE TABLE units (
  serial            TEXT NOT NULL,
  batch_id          TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  lifecycle         TEXT NOT NULL DEFAULT 'IN_FACTORY'
                    CHECK (lifecycle IN ('IN_FACTORY','IN_TRANSIT','AT_DISTRIBUTOR','AT_RETAIL')),
  /* HMAC of the 12-digit scratch code; see hashLookupCode. */
  lookup_hash       TEXT NOT NULL UNIQUE,
  PRIMARY KEY (batch_id, serial)
);

CREATE TABLE scans (
  id            TEXT PRIMARY KEY,
  batch_id      TEXT,
  serial        TEXT,
  scanned_at    INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('PWA','USSD','SMS')),
  scanner_role  TEXT NOT NULL CHECK (scanner_role IN ('consumer','retailer','inspector')),
  lat           REAL,
  lng           REAL,
  accuracy_m    REAL,
  verdict       TEXT NOT NULL CHECK (verdict IN ('GENUINE','CHECK','STOP')),
  reasons_json  TEXT NOT NULL DEFAULT '[]',
  /* 1 when first judged offline and re-evaluated after sync. */
  was_offline   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX scans_unit_idx ON scans (batch_id, serial, scanned_at);
CREATE INDEX scans_time_idx ON scans (scanned_at);

CREATE TABLE alerts (
  id           TEXT PRIMARY KEY,
  scan_id      TEXT NOT NULL REFERENCES scans(id),
  batch_id     TEXT,
  type         TEXT NOT NULL CHECK (type IN
               ('COUNTERFEIT_SUSPECTED','DISTRIBUTION_ANOMALY','IMPOSSIBLE_TRAVEL','PARALLEL_MARKET','DUPLICATE_SCANS')),
  priority     TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  message      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  assigned_to  TEXT REFERENCES users(id)
);
CREATE INDEX alerts_status_idx ON alerts (status, priority, created_at);

/* Reports of suspect products submitted by the public. */
CREATE TABLE reports (
  id            TEXT PRIMARY KEY,
  scan_id       TEXT REFERENCES scans(id),
  description   TEXT NOT NULL,
  shop_name     TEXT,
  lat           REAL,
  lng           REAL,
  photo_path    TEXT,
  contact       TEXT,
  created_at    INTEGER NOT NULL
);
`,
  },
]
