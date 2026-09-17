/**
 * Shared types for Bedrock Business Monitor
 */

export interface Env {
  DB: D1Database;
  AI: Ai;
  SLACK_WEBHOOK_URL: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_CHANNEL_ID?: string;
  ENVIRONMENT: string;
}

export interface ListingStub {
  source: string;
  sourceListingId: string;
  canonicalUrl: string;
  title: string;
  askingPrice: number | null;
  locationState: string | null;
  locationSuburb: string | null;
  sectorRaw: string | null;
  brokerName: string | null;
  dateListed: string | null;
  advertised_status?: string | null;
}

export interface Listing {
  id: string;
  source: string;
  source_listing_id: string;
  canonical_url: string;
  first_seen: number;
  last_seen: number;
  last_fetched: number | null;
  advertised_status: string | null;
  title: string | null;
  location_state: string | null;
  location_suburb: string | null;
  broker_name: string | null;
  asking_price: number | null;
  revenue: number | null;
  revenue_raw: string | null;
  ebitda: number | null;
  ebitda_raw: string | null;
  profit_unspecified_raw: string | null;
  asking_multiple: number | null;
  lease_years: number | null;
  staff_count: number | null;
  reason_for_sale: string | null;
  years_established: number | null;
  customer_type: string | null;
  claimed_recurring: number;
  evidenced_recurring: number;
  description_summary: string | null;
  sector_raw: string | null;
  sector_bedrock: string | null;
  fit_outcome: string | null;
  fit_reasons: string | null;
  criteria_version: string | null;
  content_hash: string | null;
  extraction_version: string | null;
  processing_state: string;
  processing_attempts: number;
  next_retry: number | null;
  lease_claimed_at: number | null;
  review_state: string;
}

export interface Source {
  name: string;
  adapter: string;
  base_url: string;
  poll_interval_minutes: number;
  last_attempt: number | null;
  last_success: number | null;
  pagination_checkpoint: string | null;
  discovered_count: number;
  consecutive_failures: number;
  error_status: string | null;
  coverage_complete: number;
}

export interface Activity {
  id: string;
  listing_id: string;
  event_type: string;
  actor: string | null;
  value: string | null;
  reason: string | null;
  delivery_state: string | null;
  slack_message_ref: string | null;
  event_key: string | null;
  created_at: number;
}

export interface DiscoveryResult {
  listings: ListingStub[];
  nextCheckpoint: string | null;
  coverageComplete: boolean;
  totalDiscovered: number;
  newCount: number;
}

export interface ExtractedFields {
  revenue: number | null;
  revenue_raw: string | null;
  ebitda: number | null;
  ebitda_raw: string | null;
  profit_unspecified_raw: string | null;
  asking_multiple: number | null;
  lease_years: number | null;
  staff_count: number | null;
  reason_for_sale: string | null;
  years_established: number | null;
  customer_type: 'B2B' | 'B2C' | 'mixed' | null;
  claimed_recurring: boolean;
  description_summary: string;
  sector_classification: string;
  advertised_status: string | null;
}

export interface FitResult {
  outcome: 'promising' | 'needs_information' | 'excluded';
  matchedRules: string[];
  missingFacts: string[];
  criteriaVersion: string;
  sectorBedrock: string | null;
}

export interface DigestRunStats {
  sourceName: string;
  checked: number;
  newListings: number;
  healthy: boolean;
  coverageComplete: boolean;
  errorStatus: string | null;
}
