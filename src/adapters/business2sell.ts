/**
 * Business2Sell adapter — business2sell.com.au
 * 
 * robots.txt explicitly allows AI crawlers (Anthropic-AI: Allow /)
 * No login required; no bot protection detected in spike.
 * 
 * Discovery: search page with ?page=N pagination, 10 listings/page
 * Detail: /businesses-details/{slug}-{id}.php
 */

import type { ListingStub } from '../types';

const SOURCE_NAME = 'business2sell';
const BASE_URL = 'https://www.business2sell.com.au';
const SEARCH_URL = `${BASE_URL}/businesses/sale`;
const MAX_PAGES = 10;
const CRAWL_DELAY_MS = 1500;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BedrockMonitor/1.0; +https://github.com/project-bedrock-au/bedrock-business-monitor)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

export async function discoverListings(checkpoint: string | null, maxPages = MAX_PAGES): Promise<{
  listings: ListingStub[];
  nextCheckpoint: string | null;
  coverageComplete: boolean;
}> {
  const allListings: ListingStub[] = [];
  const seenIds = new Set<string>();
  let coverageComplete = true;

  const startPage = checkpoint ? parseInt(checkpoint, 10) : 1;

  for (let page = startPage; page <= startPage + maxPages - 1; page++) {
    const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}?page=${page}`;

    let html: string;
    try {
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) {
        console.error(`[business2sell] Fetch failed page ${page}: ${resp.status}`);
        coverageComplete = false;
        break;
      }
      html = await resp.text();
    } catch (err) {
      console.error(`[business2sell] Fetch error page ${page}:`, err);
      coverageComplete = false;
      break;
    }

    const pageListings = parseSearchPage(html);

    if (pageListings.length === 0) {
      // No more listings
      break;
    }

    let foundNew = false;
    for (const listing of pageListings) {
      if (!seenIds.has(listing.sourceListingId)) {
        seenIds.add(listing.sourceListingId);
        allListings.push(listing);
        foundNew = true;
      }
    }

    if (!foundNew) {
      // Duplicate page — reached end of pagination
      break;
    }

    if (page < startPage + maxPages - 1) {
      await sleep(CRAWL_DELAY_MS);
    }

    if (page >= startPage + maxPages - 1) {
      coverageComplete = false;
    }
  }

  const nextCheckpoint = coverageComplete ? null : String(startPage + maxPages);

  return {
    listings: allListings,
    nextCheckpoint,
    coverageComplete,
  };
}

function parseSearchPage(html: string): ListingStub[] {
  const listings: ListingStub[] = [];

  // Extract data-listing-id attributes and their surrounding context
  const listingIdPattern = /data-listing-id="(\d+)"/g;
  let match: RegExpExecArray | null;

  while ((match = listingIdPattern.exec(html)) !== null) {
    const listingId = match[1];

    // Find the anchor tag close to this listing ID
    const searchStart = Math.max(0, match.index - 500);
    const searchEnd = Math.min(html.length, match.index + 1000);
    const chunk = html.slice(searchStart, searchEnd);

    // Extract href from nearby anchor
    const hrefMatch = /href="(\/businesses-details\/[^"]+)"/.exec(chunk);
    if (!hrefMatch) continue;

    const path = hrefMatch[1];
    const canonicalUrl = `${BASE_URL}${path}`;

    // Extract title from aria-label or anchor text
    const ariaMatch = /aria-label="([^"]+)"/.exec(chunk);
    const title = ariaMatch ? ariaMatch[1].replace(/\s+/g, ' ').trim() : null;

    // Extract location and sector from URL slug
    const slugParts = path.replace('/businesses-details/', '').replace(/-\d+\.php$/, '').split('-');
    
    // Extract price if visible in search results
    const priceMatch = /Asking Price[^$]*\$([\d,]+)/.exec(chunk);
    const askingPrice = priceMatch ? parseAudAmount(priceMatch[1]) : null;

    listings.push({
      source: SOURCE_NAME,
      sourceListingId: listingId,
      canonicalUrl,
      title: title ?? slugParts.join(' '),
      askingPrice,
      locationState: null, // extracted from detail page
      locationSuburb: null,
      sectorRaw: null,
      brokerName: null,
      dateListed: null,
    });
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
    throw new Error(`[business2sell] Detail fetch failed: ${resp.status} for ${url}`);
  }

  const html = await resp.text();

  // Strip scripts/styles to get clean text
  const clean = stripTags(html);

  // Extract structured fields using label: value pattern
  const fields: ReturnType<typeof fetchListingDetail> extends Promise<{ fields: infer F }> ? F : never = {};

  const askingMatch = /Asking Price:\s*\$?([\d,]+)/.exec(clean);
  if (askingMatch) fields.askingPrice = parseAudAmount(askingMatch[1]);

  const revenueMatch = /Sales revenue\s*:\s*([^\n]+)/.exec(clean);
  if (revenueMatch) fields.revenueRaw = revenueMatch[1].trim();

  const profitMatch = /Net profit\s*:\s*([^\n]+)/.exec(clean);
  if (profitMatch) fields.profitRaw = profitMatch[1].trim();

  const categoryMatch = /Business Category\s+([^\n]+)/.exec(clean);
  if (categoryMatch) fields.sectorRaw = categoryMatch[1].trim();

  // Location: "Suburb, State Postcode" — extract from breadcrumb or address
  const locationMatch = /(?:Location|State)[:\s]+([A-Za-z\s]+),\s*([A-Za-z\s]+)\s*\d*/.exec(clean);
  if (locationMatch) {
    fields.locationSuburb = locationMatch[1].trim();
    fields.locationState = normaliseState(locationMatch[2].trim());
  }

  // Broker
  const brokerMatch = /(?:Broker|Agent|Listed by)[:\s]+([A-Za-z\s]+?)(?:\n|Email|Phone|Mobile|<)/.exec(clean);
  if (brokerMatch) fields.brokerName = brokerMatch[1].trim();

  // Title — from page H1 or first strong heading
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  if (titleMatch) fields.title = titleMatch[1].replace(/&[a-z]+;/gi, ' ').trim();

  return { html, fields };
}

// ---- helpers ----

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
