/**
 * D1 query helpers for Bedrock Business Monitor
 */

import type { Listing, Source, Activity, ListingStub, FitResult } from '../types';

export async function upsertListing(db: D1Database, stub: ListingStub, now: number): Promise<string> {
  const id = `${stub.source}:${stub.sourceListingId}`;

  await db.prepare(`
    INSERT INTO listings (
      id, source, source_listing_id, canonical_url,
      first_seen, last_seen, advertised_status, title,
      location_state, location_suburb, sector_raw, broker_name,
      asking_price, processing_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    ON CONFLICT(source, source_listing_id) DO UPDATE SET
      last_seen = excluded.last_seen,
      canonical_url = excluded.canonical_url,
      title = COALESCE(excluded.title, title),
      location_state = COALESCE(excluded.location_state, location_state),
      location_suburb = COALESCE(excluded.location_suburb, location_suburb),
      sector_raw = COALESCE(excluded.sector_raw, sector_raw),
      broker_name = COALESCE(excluded.broker_name, broker_name),
      asking_price = COALESCE(excluded.asking_price, asking_price)
  `).bind(
    id,
    stub.source,
    stub.sourceListingId,
    stub.canonicalUrl,
    now,
    now,
    stub.advertised_status ?? null,
    stub.title,
    stub.locationState,
    stub.locationSuburb,
    stub.sectorRaw,
    stub.brokerName,
    stub.askingPrice,
  ).run();

  return id;
}

export async function claimListingsForProcessing(db: D1Database, limit: number, now: number): Promise<Listing[]> {
  // Atomic lease: claim listings that are new or retry-ready
  const results = await db.prepare(`
    SELECT * FROM listings
    WHERE processing_state IN ('new', 'retry')
      AND (next_retry IS NULL OR next_retry <= ?)
    ORDER BY
      CASE processing_state WHEN 'new' THEN 0 ELSE 1 END,
      first_seen ASC
    LIMIT ?
  `).bind(now, limit).all<Listing>();

  if (!results.results.length) return [];

  const ids = results.results.map(r => r.id);
  // Set lease
  await db.prepare(`
    UPDATE listings
    SET processing_state = 'processing',
        lease_claimed_at = ?
    WHERE id IN (${ids.map(() => '?').join(',')})
      AND processing_state IN ('new', 'retry')
  `).bind(now, ...ids).run();

  return results.results;
}

export async function markListingExtracted(
  db: D1Database,
  id: string,
  extracted: Partial<Listing>,
  fitResult: FitResult,
  contentHash: string,
  extractionVersion: string,
  now: number,
): Promise<void> {
  await db.prepare(`
    UPDATE listings SET
      last_fetched = ?,
      advertised_status = COALESCE(?, advertised_status),
      revenue = ?,
      revenue_raw = ?,
      ebitda = ?,
      ebitda_raw = ?,
      profit_unspecified_raw = ?,
      asking_multiple = ?,
      lease_years = ?,
      staff_count = ?,
      reason_for_sale = ?,
      years_established = ?,
      customer_type = ?,
      claimed_recurring = ?,
      evidenced_recurring = 0,
      description_summary = ?,
      sector_bedrock = ?,
      fit_outcome = ?,
      fit_reasons = ?,
      criteria_version = ?,
      content_hash = ?,
      extraction_version = ?,
      processing_state = 'done',
      processing_attempts = processing_attempts + 1,
      lease_claimed_at = NULL
    WHERE id = ?
  `).bind(
    now,
    extracted.advertised_status ?? null,
    extracted.revenue ?? null,
    extracted.revenue_raw ?? null,
    extracted.ebitda ?? null,
    extracted.ebitda_raw ?? null,
    extracted.profit_unspecified_raw ?? null,
    extracted.asking_multiple ?? null,
    extracted.lease_years ?? null,
    extracted.staff_count ?? null,
    extracted.reason_for_sale ?? null,
    extracted.years_established ?? null,
    extracted.customer_type ?? null,
    extracted.claimed_recurring ? 1 : 0,
    extracted.description_summary ?? null,
    fitResult.sectorBedrock ?? null,
    fitResult.outcome,
    JSON.stringify(fitResult.matchedRules),
    fitResult.criteriaVersion,
    contentHash,
    extractionVersion,
    id,
  ).run();
}

export async function markListingFailed(
  db: D1Database,
  id: string,
  attempts: number,
  now: number,
): Promise<void> {
  const retryDelay = Math.min(attempts * 30 * 60 * 1000, 4 * 60 * 60 * 1000); // max 4h
  await db.prepare(`
    UPDATE listings SET
      processing_state = CASE WHEN processing_attempts >= 5 THEN 'failed' ELSE 'retry' END,
      processing_attempts = processing_attempts + 1,
      next_retry = ?,
      lease_claimed_at = NULL
    WHERE id = ?
  `).bind(now + retryDelay, id).run();
}

export async function getPendingDigestListings(db: D1Database): Promise<Listing[]> {
  // Listings that are done and not yet successfully delivered
  return (await db.prepare(`
    SELECT l.* FROM listings l
    WHERE l.processing_state = 'done'
      AND l.fit_outcome IN ('promising', 'needs_information')
      AND l.review_state = 'new'
      AND NOT EXISTS (
        SELECT 1 FROM activity a
        WHERE a.listing_id = l.id
          AND a.event_type = 'digest_delivery'
          AND a.delivery_state = 'confirmed'
      )
    ORDER BY
      CASE l.fit_outcome WHEN 'promising' THEN 0 ELSE 1 END,
      l.first_seen DESC
  `).all<Listing>()).results;
}

export async function recordDeliveryPending(
  db: D1Database,
  listingId: string,
  eventKey: string,
  now: number,
): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO activity (id, listing_id, event_type, delivery_state, event_key, created_at)
    VALUES (?, ?, 'digest_delivery', 'pending', ?, ?)
  `).bind(crypto.randomUUID(), listingId, eventKey, now).run();
}

export async function confirmDelivery(
  db: D1Database,
  eventKey: string,
  slackMessageRef: string | null,
): Promise<void> {
  await db.prepare(`
    UPDATE activity SET delivery_state = 'confirmed', slack_message_ref = ?
    WHERE event_key = ?
  `).bind(slackMessageRef, eventKey).run();
}

export async function recordReviewDecision(
  db: D1Database,
  listingId: string,
  action: 'watch' | 'pursue' | 'pass',
  actor: string,
  reason: string | undefined,
  now: number,
): Promise<void> {
  const eventKey = `review:${listingId}:${now}`;
  await db.prepare(`
    INSERT INTO activity (id, listing_id, event_type, actor, value, reason, event_key, created_at)
    VALUES (?, ?, 'review_decision', ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), listingId, actor, action, reason ?? null, eventKey, now).run();

  await db.prepare(`
    UPDATE listings SET review_state = ? WHERE id = ?
  `).bind(action, listingId).run();
}

export async function getListingById(db: D1Database, id: string): Promise<Listing | null> {
  return await db.prepare(`SELECT * FROM listings WHERE id = ?`).bind(id).first<Listing>();
}

export async function getListingByUrl(db: D1Database, url: string): Promise<Listing | null> {
  return await db.prepare(`SELECT * FROM listings WHERE canonical_url = ?`).bind(url).first<Listing>();
}

export async function updateSourceStatus(
  db: D1Database,
  name: string,
  success: boolean,
  discoveredCount: number,
  checkpoint: string | null,
  coverageComplete: boolean,
  now: number,
): Promise<void> {
  await db.prepare(`
    UPDATE sources SET
      last_attempt = ?,
      last_success = CASE WHEN ? THEN ? ELSE last_success END,
      pagination_checkpoint = ?,
      discovered_count = ?,
      consecutive_failures = CASE WHEN ? THEN 0 ELSE consecutive_failures + 1 END,
      error_status = CASE WHEN ? THEN NULL ELSE 'fetch_failed' END,
      coverage_complete = ?
    WHERE name = ?
  `).bind(
    now,
    success, now,
    checkpoint,
    discoveredCount,
    success,
    success,
    coverageComplete ? 1 : 0,
    name,
  ).run();
}

export async function getSourcesStatus(db: D1Database): Promise<Source[]> {
  return (await db.prepare(`SELECT * FROM sources`).all<Source>()).results;
}

export async function getSource(db: D1Database, name: string): Promise<Source | null> {
  return await db.prepare(`SELECT * FROM sources WHERE name = ?`).bind(name).first<Source>();
}

export async function initSourceIfMissing(db: D1Database, source: {
  name: string;
  adapter: string;
  baseUrl: string;
  pollIntervalMinutes: number;
}): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO sources (name, adapter, base_url, poll_interval_minutes)
    VALUES (?, ?, ?, ?)
  `).bind(source.name, source.adapter, source.baseUrl, source.pollIntervalMinutes).run();
}

export async function getSourcesNeedingPoll(db: D1Database, now: number): Promise<Source[]> {
  return (await db.prepare(`
    SELECT * FROM sources
    WHERE (last_attempt IS NULL OR last_attempt + (poll_interval_minutes * 60 * 1000) <= ?)
  `).bind(now).all<Source>()).results;
}
