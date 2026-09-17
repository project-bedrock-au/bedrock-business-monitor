-- Bedrock Business Monitor — D1 Schema
-- Version: 1.0

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_listing_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_fetched INTEGER,
  advertised_status TEXT,
  title TEXT,
  location_state TEXT,
  location_suburb TEXT,
  broker_name TEXT,
  asking_price INTEGER,
  revenue INTEGER,
  revenue_raw TEXT,
  ebitda INTEGER,
  ebitda_raw TEXT,
  profit_unspecified_raw TEXT,
  asking_multiple REAL,
  lease_years INTEGER,
  staff_count INTEGER,
  reason_for_sale TEXT,
  years_established INTEGER,
  customer_type TEXT,           -- B2B / B2C / mixed
  claimed_recurring INTEGER DEFAULT 0,
  evidenced_recurring INTEGER DEFAULT 0,
  description_summary TEXT,
  sector_raw TEXT,
  sector_bedrock TEXT,
  fit_outcome TEXT,             -- promising / needs_information / excluded
  fit_reasons TEXT,             -- JSON array of matched rule descriptions
  criteria_version TEXT,
  content_hash TEXT,
  extraction_version TEXT,
  processing_state TEXT DEFAULT 'new',  -- new / processing / done / retry / failed
  processing_attempts INTEGER DEFAULT 0,
  next_retry INTEGER,
  lease_claimed_at INTEGER,
  review_state TEXT DEFAULT 'new',      -- new / watch / pursue / pass
  UNIQUE(source, source_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_processing_state ON listings(processing_state);
CREATE INDEX IF NOT EXISTS idx_listings_fit_outcome ON listings(fit_outcome);
CREATE INDEX IF NOT EXISTS idx_listings_review_state ON listings(review_state);
CREATE INDEX IF NOT EXISTS idx_listings_first_seen ON listings(first_seen);

CREATE TABLE IF NOT EXISTS sources (
  name TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  base_url TEXT NOT NULL,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 240,
  last_attempt INTEGER,
  last_success INTEGER,
  pagination_checkpoint TEXT,
  discovered_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  error_status TEXT,
  coverage_complete INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- review_decision / material_change / digest_delivery
  actor TEXT,
  value TEXT,                 -- new state or change description
  reason TEXT,
  delivery_state TEXT,        -- pending / confirmed / failed
  slack_message_ref TEXT,
  event_key TEXT UNIQUE,      -- stable key, e.g. digest:2026-09-17:listing_id
  created_at INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_listing_id ON activity(listing_id);
CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_event_key ON activity(event_key);
