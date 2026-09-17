/**
 * Bedrock Business Monitor — Cloudflare Worker entry point
 * 
 * Handles:
 * - Scheduled cron (0 20 * * * UTC = 7am Melbourne AEST, adjusts to 0 21 * * * during AEDT)
 * - POST /inspect — on-demand listing inspection
 * - POST /review — mark listing watch/pursue/pass
 * - GET /status — source health status
 */

import type { Env, Listing, ListingStub, DigestRunStats } from './types';
import { discoverListings as discoverBusiness2Sell, fetchListingDetail as fetchB2SDetail } from './adapters/business2sell';
import { discoverListings as discoverBsale, fetchListingDetail as fetchBsaleDetail } from './adapters/bsale';
import { extractFields, computeContentHash, EXTRACTION_VERSION } from './extraction/extractor';
import { applyRules, buildRulesInput } from './rules/engine';
import {
  upsertListing,
  claimListingsForProcessing,
  markListingExtracted,
  markListingFailed,
  getPendingDigestListings,
  recordDeliveryPending,
  confirmDelivery,
  recordReviewDecision,
  getListingById,
  getListingByUrl,
  updateSourceStatus,
  getSourcesStatus,
  getSourcesNeedingPoll,
  initSourceIfMissing,
} from './db/queries';
import {
  sendDigest,
  sendInspectionResult,
  buildInspectionMessage,
} from './delivery/slack';
import type { DigestEntry } from './delivery/slack';
import sourcesConfig from '../config/sources.json';

const PROCESSING_BATCH_SIZE = 20;

export default {
  // ---- Scheduled handler ----
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledCycle(env));
  },

  // ---- HTTP handler ----
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResponse({ status: 'ok', service: 'bedrock-business-monitor' });
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      return handleStatus(env);
    }

    if (url.pathname === '/inspect' && request.method === 'POST') {
      return handleInspect(request, env, ctx);
    }

    if (url.pathname === '/review' && request.method === 'POST') {
      return handleReview(request, env);
    }

    // Trigger manual run (dev/test only)
    if (url.pathname === '/run' && request.method === 'POST' && env.ENVIRONMENT === 'development') {
      ctx.waitUntil(runScheduledCycle(env));
      return jsonResponse({ status: 'triggered' });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ---- Scheduled cycle ----

async function runScheduledCycle(env: Env): Promise<void> {
  const now = Date.now();
  console.log(`[cycle] Starting at ${new Date(now).toISOString()}`);

  // Ensure sources are initialised in D1
  await initSources(env);

  const runStats: DigestRunStats[] = [];

  // 1. Discover new listings from due sources
  const dueSources = await getSourcesNeedingPoll(env.DB, now);

  for (const source of dueSources) {
    const stats = await runSourceDiscovery(env, source, now);
    runStats.push(stats);
  }

  // 2. Process extraction batch
  await processExtractionBatch(env, now);

  // 3. Send digest (7am Melbourne — cron fires at 0 20 * * * UTC / 0 21 during AEDT)
  // Always send digest on scheduled runs
  await sendMorningDigest(env, runStats, now);

  console.log(`[cycle] Completed at ${new Date().toISOString()}`);
}

async function initSources(env: Env): Promise<void> {
  for (const source of sourcesConfig.sources) {
    if (!source.enabled) continue;
    await initSourceIfMissing(env.DB, {
      name: source.name,
      adapter: source.adapter,
      baseUrl: source.baseUrl,
      pollIntervalMinutes: source.pollIntervalMinutes,
    });
  }
}

async function runSourceDiscovery(env: Env, source: Awaited<ReturnType<typeof getSourcesNeedingPoll>>[0], now: number): Promise<DigestRunStats> {
  const config = sourcesConfig.sources.find(s => s.name === source.name);
  if (!config || !config.enabled) {
    return { sourceName: source.name, checked: 0, newListings: 0, healthy: false, coverageComplete: false, errorStatus: 'disabled' };
  }

  let discoverResult: Awaited<ReturnType<typeof discoverBusiness2Sell>>;
  let healthy = true;

  try {
    if (source.adapter === 'business2sell') {
      discoverResult = await discoverBusiness2Sell(source.pagination_checkpoint, config.maxPages);
    } else if (source.adapter === 'bsale') {
      discoverResult = await discoverBsale(source.pagination_checkpoint, config.maxPages);
    } else {
      throw new Error(`Unknown adapter: ${source.adapter}`);
    }
  } catch (err) {
    console.error(`[cycle] Source ${source.name} discovery failed:`, err);
    await updateSourceStatus(env.DB, source.name, false, 0, source.pagination_checkpoint, false, now);

    if (source.consecutive_failures + 1 >= 2) {
      await sendSlackAlert(env, `⚠️ Bedrock Monitor: Source _${source.name}_ has failed ${source.consecutive_failures + 1} consecutive times. Manual check required.`);
    }

    return { sourceName: source.name, checked: 0, newListings: 0, healthy: false, coverageComplete: false, errorStatus: 'discovery_failed' };
  }

  // Upsert discovered listings
  let newCount = 0;
  for (const stub of discoverResult.listings) {
    try {
      await upsertListing(env.DB, stub, now);
      newCount++;
    } catch (err) {
      console.error(`[cycle] Upsert failed for ${stub.sourceListingId}:`, err);
    }
  }

  await updateSourceStatus(
    env.DB,
    source.name,
    true,
    discoverResult.listings.length,
    discoverResult.nextCheckpoint,
    discoverResult.coverageComplete,
    now,
  );

  console.log(`[cycle] ${source.name}: discovered ${discoverResult.listings.length} listings, ${newCount} upserted`);

  return {
    sourceName: source.name,
    checked: discoverResult.listings.length,
    newListings: newCount,
    healthy,
    coverageComplete: discoverResult.coverageComplete,
    errorStatus: null,
  };
}

async function processExtractionBatch(env: Env, now: number): Promise<void> {
  const listings = await claimListingsForProcessing(env.DB, PROCESSING_BATCH_SIZE, now);

  console.log(`[extraction] Processing ${listings.length} listings`);

  for (const listing of listings) {
    try {
      await extractAndClassifyListing(env, listing, now);
    } catch (err) {
      console.error(`[extraction] Failed for ${listing.id}:`, err);
      await markListingFailed(env.DB, listing.id, listing.processing_attempts + 1, now);
    }
  }
}

async function extractAndClassifyListing(env: Env, listing: Listing, now: number): Promise<void> {
  // Fetch detail page
  let html: string;
  let detailFields: Awaited<ReturnType<typeof fetchB2SDetail>>['fields'];

  try {
    if (listing.source === 'business2sell') {
      const result = await fetchB2SDetail(listing.canonical_url);
      html = result.html;
      detailFields = result.fields;
    } else if (listing.source === 'bsale') {
      const result = await fetchBsaleDetail(listing.canonical_url);
      html = result.html;
      detailFields = result.fields;
    } else {
      throw new Error(`Unknown source: ${listing.source}`);
    }
  } catch (err) {
    console.error(`[extraction] Detail fetch failed for ${listing.id}:`, err);
    await markListingFailed(env.DB, listing.id, listing.processing_attempts + 1, now);
    return;
  }

  // Compute content hash for change detection
  const contentHash = computeContentHash(html);

  // If content unchanged and already extracted, skip re-extraction
  if (listing.content_hash && listing.content_hash === contentHash && listing.processing_state === 'done') {
    await markListingExtracted(
      env.DB,
      listing.id,
      {},
      { outcome: listing.fit_outcome as 'promising' | 'needs_information' | 'excluded', matchedRules: [], missingFacts: [], criteriaVersion: listing.criteria_version ?? '0.2', sectorBedrock: listing.sector_bedrock },
      contentHash,
      EXTRACTION_VERSION,
      now,
    );
    return;
  }

  // Strip tags for LLM
  const cleanText = stripTagsSimple(html).slice(0, 6000);

  // Merge detail fields into listing for title/location
  const mergedListing: Listing = {
    ...listing,
    title: detailFields.title ?? listing.title,
    location_state: detailFields.locationState ?? listing.location_state,
    location_suburb: detailFields.locationSuburb ?? listing.location_suburb,
    sector_raw: detailFields.sectorRaw ?? listing.sector_raw,
    broker_name: detailFields.brokerName ?? listing.broker_name,
    asking_price: detailFields.askingPrice ?? listing.asking_price,
  };

  // Run LLM extraction
  const extracted = await extractFields(
    env.AI,
    mergedListing.title ?? 'Unknown business',
    cleanText,
    mergedListing.asking_price,
  );

  // Apply rules
  const rulesInput = buildRulesInput(mergedListing, extracted);
  const fitResult = applyRules(rulesInput);

  // Persist
  await markListingExtracted(
    env.DB,
    listing.id,
    {
      advertised_status: extracted.advertised_status ?? detailFields.advertised_status,
      revenue: extracted.revenue,
      revenue_raw: extracted.revenue_raw ?? detailFields.revenueRaw,
      ebitda: extracted.ebitda,
      ebitda_raw: extracted.ebitda_raw,
      profit_unspecified_raw: extracted.profit_unspecified_raw,
      asking_multiple: extracted.asking_multiple,
      lease_years: extracted.lease_years,
      staff_count: extracted.staff_count,
      reason_for_sale: extracted.reason_for_sale,
      years_established: extracted.years_established,
      customer_type: extracted.customer_type,
      claimed_recurring: extracted.claimed_recurring ? 1 : 0,
      description_summary: extracted.description_summary,
    },
    fitResult,
    contentHash,
    EXTRACTION_VERSION,
    now,
  );

  console.log(`[extraction] ${listing.id}: ${fitResult.outcome} (${fitResult.sectorBedrock ?? 'unknown sector'})`);
}

async function sendMorningDigest(env: Env, runStats: DigestRunStats[], now: number): Promise<void> {
  const pendingListings = await getPendingDigestListings(env.DB);

  const totalPending = pendingListings.length;
  const toDeliver = pendingListings.slice(0, 5);
  const backlogCount = Math.max(0, totalPending - 5);

  const date = new Date(now).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Populate source stats from D1 if not already populated from this run
  const allSources = await getSourcesStatus(env.DB);
  const mergedStats: DigestRunStats[] = sourcesConfig.sources
    .filter(s => s.enabled)
    .map(s => {
      const existing = runStats.find(r => r.sourceName === s.name);
      if (existing) return existing;
      const dbSource = allSources.find(ds => ds.name === s.name);
      return {
        sourceName: s.name,
        checked: 0,
        newListings: 0,
        healthy: dbSource ? dbSource.consecutive_failures === 0 : false,
        coverageComplete: dbSource ? dbSource.coverage_complete === 1 : false,
        errorStatus: dbSource?.error_status ?? null,
      };
    });

  // Build digest entries with reasons
  const entries: DigestEntry[] = toDeliver.map(listing => {
    let fitReasonsArr: string[] = [];
    let missingFacts: string[] = [];
    try {
      fitReasonsArr = JSON.parse(listing.fit_reasons ?? '[]') as string[];
    } catch { /* ignore */ }
    // missingFacts are embedded in the rules array with a convention — extract from rules
    // (In this implementation, missingFacts are stored inline in fit_reasons with "Missing:" prefix)
    missingFacts = fitReasonsArr.filter(r => r.startsWith('Missing:') || r.startsWith('NDIS:') || r.startsWith('Childcare:') || r.includes('not confirmed') || r.includes('Not disclosed'));
    fitReasonsArr = fitReasonsArr.filter(r => !missingFacts.includes(r));
    return { listing, fitReasonsArr, missingFacts };
  });

  // Record pending delivery for each entry before sending
  for (const entry of entries) {
    const eventKey = `digest:${date}:${entry.listing.id}`;
    await recordDeliveryPending(env.DB, entry.listing.id, eventKey, now);
  }

  // Send digest
  const result = await sendDigest(
    entries,
    mergedStats,
    backlogCount,
    date,
    env.SLACK_WEBHOOK_URL,
    env.SLACK_BOT_TOKEN,
    env.SLACK_CHANNEL_ID,
  );

  // Confirm delivery
  if (result.ok) {
    for (const entry of entries) {
      const eventKey = `digest:${date}:${entry.listing.id}`;
      await confirmDelivery(env.DB, eventKey, result.messageRef);
    }
    console.log(`[digest] Sent ${entries.length} entries, ${backlogCount} in backlog`);
  } else {
    console.error('[digest] Send failed — delivery state remains pending for retry');
  }
}

// ---- HTTP handlers ----

async function handleInspect(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { url?: string; listingId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.url && !body.listingId) {
    return jsonResponse({ error: 'Provide url or listingId' }, 400);
  }

  const now = Date.now();

  // Look up existing listing
  let listing: Listing | null = null;
  if (body.listingId) {
    listing = await getListingById(env.DB, body.listingId);
  } else if (body.url) {
    // Validate URL
    try {
      const parsed = new URL(body.url);
      if (!parsed.hostname.endsWith('.com.au') && !parsed.hostname.endsWith('.com')) {
        return jsonResponse({ error: 'URL must be a supported marketplace URL' }, 400);
      }
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }
    listing = await getListingByUrl(env.DB, body.url);
  }

  if (listing && listing.processing_state === 'done') {
    // Return enriched record immediately
    const summary = buildInspectionMessage(listing);
    return jsonResponse({
      status: 'found',
      listing,
      summary,
      lastChecked: listing.last_fetched
        ? new Date(listing.last_fetched).toISOString()
        : null,
    });
  }

  if (listing && listing.processing_state === 'processing') {
    return jsonResponse({
      status: 'processing',
      message: 'Extraction in progress — check back in 30 seconds',
      listingId: listing.id,
    });
  }

  if (listing) {
    // Found but not yet extracted — trigger async extraction
    const listingCopy = { ...listing };
    ctx.waitUntil(
      extractAndClassifyListing(env, listingCopy, now)
        .catch(err => console.error('[inspect] Async extraction failed:', err))
    );
    return jsonResponse({
      status: 'processing',
      message: 'Inspection queued — check back in 30 seconds',
      listingId: listing.id,
    });
  }

  // Not in DB — create stub from URL and trigger extraction
  if (body.url) {
    const url = body.url;
    const source = url.includes('bsale.com.au') ? 'bsale' : 'business2sell';
    const idMatch = /-(\d+)(?:\.php)?$/.exec(url.split('/').pop() ?? '');
    const sourceListingId = idMatch ? idMatch[1] : `manual:${Date.now()}`;

    const stub: ListingStub = {
      source,
      sourceListingId,
      canonicalUrl: url,
      title: 'On-demand inspection',
      askingPrice: null,
      locationState: null,
      locationSuburb: null,
      sectorRaw: null,
      brokerName: null,
      dateListed: null,
    };

    const id = await upsertListing(env.DB, stub, now);
    const newListing = await getListingById(env.DB, id);

    if (newListing) {
      const listingCopy = { ...newListing };
      ctx.waitUntil(
        extractAndClassifyListing(env, listingCopy, now)
          .catch(err => console.error('[inspect] Async extraction failed:', err))
      );
    }

    return jsonResponse({
      status: 'processing',
      message: 'Inspection queued — check back in 30 seconds',
      listingId: id,
    });
  }

  return jsonResponse({ error: 'Listing not found', status: 'not_found' }, 404);
}

async function handleReview(request: Request, env: Env): Promise<Response> {
  let body: { listingId: string; action: 'watch' | 'pursue' | 'pass'; actor: string; reason?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.listingId || !body.action || !body.actor) {
    return jsonResponse({ error: 'listingId, action, and actor are required' }, 400);
  }

  if (!['watch', 'pursue', 'pass'].includes(body.action)) {
    return jsonResponse({ error: 'action must be watch, pursue, or pass' }, 400);
  }

  const listing = await getListingById(env.DB, body.listingId);
  if (!listing) {
    return jsonResponse({ error: 'Listing not found' }, 404);
  }

  const now = Date.now();
  await recordReviewDecision(env.DB, body.listingId, body.action, body.actor, body.reason, now);

  return jsonResponse({
    ok: true,
    message: `Listing marked as ${body.action} by ${body.actor}`,
    listingId: body.listingId,
    action: body.action,
    timestamp: new Date(now).toISOString(),
  });
}

async function handleStatus(env: Env): Promise<Response> {
  const sources = await getSourcesStatus(env.DB);
  return jsonResponse({
    sources: sources.map(s => ({
      name: s.name,
      lastAttempt: s.last_attempt ? new Date(s.last_attempt).toISOString() : null,
      lastSuccess: s.last_success ? new Date(s.last_success).toISOString() : null,
      consecutiveFailures: s.consecutive_failures,
      errorStatus: s.error_status,
      coverageComplete: s.coverage_complete === 1,
      discoveredCount: s.discovered_count,
    })),
  });
}

// ---- utilities ----

async function sendSlackAlert(env: Env, text: string): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[slack] Alert send failed:', err);
  }
}

function stripTagsSimple(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
