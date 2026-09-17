/**
 * Bsale adapter — bsale.com.au
 * 
 * robots.txt: Allows all crawlers on listing pages (no relevant disallows).
 * No login required; no bot protection detected in spike.
 * 
 * Discovery: JSON-LD ItemList on state pages provides clean listing URL list.
 * Pagination: /businesses-for-sale/{state}/page-{N}
 * Detail: /listing/{slug}-{id}
 */

import type { ListingStub } from '../types';

const SOURCE_NAME = 'bsale';
const BASE_URL = 'https://bsale.com.au';

// Poll all states — prioritise VIC/NSW/QLD per criteria geography preference
const STATES = ['vic', 'nsw', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];
const MAX_PAGES_PER_STATE = 3; // conservative — 10 listings/page × 3 pages × 8 states = 240 discovery max
const CRAWL_DELAY_MS = 1500;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BedrockMonitor/1.0; +https://github.com/project-bedrock-au/bedrock-business-monitor)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

export async function discoverListings(checkpoint: string | null, maxPages = MAX_PAGES_PER_STATE): Promise<{
  listings: ListingStub[];
  nextCheckpoint: string | null;
  coverageComplete: boolean;
}> {
  const allListings: ListingStub[] = [];
  const seenIds = new Set<string>();
  let coverageComplete = true;

  // Checkpoint format: "{state_index}:{page}" — allows resuming mid-state
  let stateIdx = 0;
  let startPage = 1;
  if (checkpoint) {
    const parts = checkpoint.split(':');
    stateIdx = parseInt(parts[0] ?? '0', 10);
    startPage = parseInt(parts[1] ?? '1', 10);
  }

  for (let si = stateIdx; si < STATES.length; si++) {
    const state = STATES[si];
    const pageStart = si === stateIdx ? startPage : 1;

    for (let page = pageStart; page <= maxPages; page++) {
      const url = page === 1
        ? `${BASE_URL}/businesses-for-sale/${state}`
        : `${BASE_URL}/businesses-for-sale/${state}/page-${page}`;

      let html: string;
      try {
        const resp = await fetch(url, { headers: HEADERS });
        if (!resp.ok) {
          if (resp.status === 404) break; // No more pages for this state
          console.error(`[bsale] Fetch failed ${url}: ${resp.status}`);
          coverageComplete = false;
          break;
        }
        html = await resp.text();
      } catch (err) {
        console.error(`[bsale] Fetch error ${url}:`, err);
        coverageComplete = false;
        break;
      }

      // Primary: parse JSON-LD ItemList
      const pageListings = parseJsonLdListings(html, state);

      if (pageListings.length === 0) break;

      let foundNew = false;
      for (const listing of pageListings) {
        if (!seenIds.has(listing.sourceListingId)) {
          seenIds.add(listing.sourceListingId);
          allListings.push(listing);
          foundNew = true;
        }
      }

      if (!foundNew) break;

      if (page < maxPages) {
        await sleep(CRAWL_DELAY_MS);
      } else {
        coverageComplete = false;
      }
    }

    if (si < STATES.length - 1) {
      await sleep(CRAWL_DELAY_MS);
    }
  }

  return {
    listings: allListings,
    nextCheckpoint: coverageComplete ? null : null, // reset on next run
    coverageComplete,
  };
}

function parseJsonLdListings(html: string, state: string): ListingStub[] {
  const listings: ListingStub[] = [];

  // Extract JSON-LD blocks
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] !== 'ItemList') continue;

      const items: Array<{ url: string; position: number }> = data.itemListElement ?? [];

      for (const item of items) {
        const url = item.url;
        if (!url || !url.includes('bsale.com.au/listing/')) continue;

        const idMatch = /-(\d+)$/.exec(url.replace(/\/$/, ''));
        if (!idMatch) continue;

        const listingId = idMatch[1];
        const slug = url.split('/listing/')[1]?.replace(/\/$/, '') ?? '';

        // Parse state from slug if possible (e.g. barbershop-parkdale-vic-687990)
        const stateFromSlug = extractStateFromSlug(slug) ?? state.toUpperCase();

        listings.push({
          source: SOURCE_NAME,
          sourceListingId: listingId,
          canonicalUrl: url.startsWith('http') ? url : `${BASE_URL}${url}`,
          title: titleFromSlug(slug, listingId),
          askingPrice: null,
          locationState: stateFromSlug,
          locationSuburb: null,
          sectorRaw: null,
          brokerName: null,
          dateListed: null,
        });
      }
    } catch {
      // Non-JSON or wrong format — skip
    }
  }

  return listings;
}

export async function fetchListingDetail(url: string): Promise<{
  html: string;
  fields: Partial<{
    title: string;
    locationState: string;
    locationSuburb: string;
    sectorRaw: string;
    brokerName: string;
    askingPrice: number | null;
    revenueRaw: string | null;
    profitRaw: string | null;
    advertised_status: string | null;
  }>;
}> {
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`[bsale] Detail fetch failed: ${resp.status} for ${url}`);
  }

  const html = await resp.text();
  const clean = stripTags(html);

  const fields: ReturnType<typeof fetchListingDetail> extends Promise<{ fields: infer F }> ? F : never = {};

  // Price — "$40,000" format
  const priceMatch = /\$([\d,]+)(?:\s|$|\s*\+)/.exec(clean.slice(0, 5000));
  if (priceMatch) fields.askingPrice = parseAudAmount(priceMatch[1]);

  // Turnover (Bsale uses "Turnover:" not "Revenue:")
  const turnoverMatch = /Turnover:\s*([^\n]+)/.exec(clean);
  if (turnoverMatch) {
    const val = turnoverMatch[1].trim();
    fields.revenueRaw = val === 'Not disclosed' ? null : val;
  }

  // Net Profit
  const profitMatch = /Net Profit:\s*([^\n]+)/.exec(clean);
  if (profitMatch) {
    const val = profitMatch[1].trim();
    fields.profitRaw = val === 'Not disclosed' ? null : val;
  }

  // Location — "Suburb, State PostCode"
  const locMatch = /([A-Za-z\s]+),\s*(Victoria|New South Wales|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory)\s*\d{4}/.exec(clean.slice(0, 5000));
  if (locMatch) {
    fields.locationSuburb = locMatch[1].trim();
    fields.locationState = normaliseState(locMatch[2]);
  }

  // Category — from "Business Details" section
  const catMatch = /Business Category\s+([^\n]+)/.exec(clean);
  if (catMatch) fields.sectorRaw = catMatch[1].trim();

  // Broker
  const brokerMatch = /(?:Private Seller|Business Broker|Broker)[\s:]+([A-Za-z\s]+?)(?:\n|Phone|Email|Mobile)/.exec(clean);
  if (brokerMatch && !brokerMatch[1].includes('Broker')) {
    fields.brokerName = brokerMatch[1].trim();
  } else {
    const privateMatch = /Private Seller/.test(clean.slice(0, 10000));
    if (privateMatch) fields.brokerName = 'Private Seller';
  }

  // Title from H1
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  if (titleMatch) fields.title = decodeHtmlEntities(titleMatch[1]).trim();

  // Advertised status
  if (/(?:sold|under contract|off market)/i.test(clean.slice(0, 2000))) {
    const soldMatch = /(?:sold|under contract|off market)/i.exec(clean.slice(0, 2000));
    if (soldMatch) fields.advertised_status = soldMatch[0].toLowerCase();
  }

  return { html, fields };
}

// ---- helpers ----

function titleFromSlug(slug: string, id: string): string {
  return slug
    .replace(new RegExp(`-${id}$`), '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function extractStateFromSlug(slug: string): string | null {
  const states: Record<string, string> = {
    '-vic-': 'VIC', '-nsw-': 'NSW', '-qld-': 'QLD',
    '-sa-': 'SA', '-wa-': 'WA', '-tas-': 'TAS',
    '-nt-': 'NT', '-act-': 'ACT',
  };
  for (const [pattern, state] of Object.entries(states)) {
    if (slug.includes(pattern)) return state;
  }
  return null;
}

function stripTags(html: string): string {
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

function parseAudAmount(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[,$\s]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function normaliseState(raw: string): string {
  const map: Record<string, string> = {
    'victoria': 'VIC', 'vic': 'VIC',
    'new south wales': 'NSW', 'nsw': 'NSW',
    'queensland': 'QLD', 'qld': 'QLD',
    'south australia': 'SA', 'sa': 'SA',
    'western australia': 'WA', 'wa': 'WA',
    'tasmania': 'TAS', 'tas': 'TAS',
    'northern territory': 'NT', 'nt': 'NT',
    'australian capital territory': 'ACT', 'act': 'ACT',
  };
  return map[raw.toLowerCase()] ?? raw.toUpperCase();
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
