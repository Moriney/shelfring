-- Shelfring v1 schema. Times are Unix milliseconds. Money is in cents of the instance currency.
CREATE TABLE sellers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', slug TEXT UNIQUE,
  about TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', photo_key TEXT, cover_key TEXT,
  last_audience TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE login_codes (email TEXT PRIMARY KEY, code_mac TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, seller_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
-- status: draft, active, reserved (a buyer is accepted), ended (auction over), expired, sold, closed, removed
CREATE TABLE listings (
  id TEXT PRIMARY KEY, seller_id TEXT, draft_key_hash TEXT,
  title TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'fixed', price_cents INTEGER NOT NULL DEFAULT 0, duration_days INTEGER NOT NULL DEFAULT 3, ends_at INTEGER,
  -- area: JSON list such as ["city:FI/espoo"]; password_mac: HMAC(server key, password), NULL without password
  area TEXT NOT NULL DEFAULT '[]', area_label TEXT NOT NULL DEFAULT '', password_mac TEXT,
  status TEXT NOT NULL DEFAULT 'draft', og_key TEXT, removed_reason TEXT,
  created_at INTEGER NOT NULL, published_at INTEGER, expires_at INTEGER, closed_at INTEGER
);
CREATE INDEX listings_seller ON listings (seller_id, status);
CREATE INDEX listings_draft ON listings (draft_key_hash);
-- listing_id is NULL for a seller's profile photo or cover image
CREATE TABLE photos (key TEXT PRIMARY KEY, listing_id TEXT, seller_id TEXT, pos INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL, h INTEGER NOT NULL, avg TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX photos_listing ON photos (listing_id, pos);
-- kind: want, offer, bid. status: open, accepted, declined, removed
CREATE TABLE requests (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, kind TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  buyer_key_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, decided_at INTEGER
);
CREATE INDEX requests_listing ON requests (listing_id, kind, status);
CREATE INDEX requests_buyer ON requests (buyer_key_hash);
-- owner: a seller id, or the hash of a buyer key
CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, owner TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX push_owner ON push_subs (owner);
CREATE TABLE reports (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
