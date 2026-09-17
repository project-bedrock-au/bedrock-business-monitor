/**
 * LLM-based field extraction and sector classification
 * Uses Workers AI to extract structured fields from listing text.
 * 
 * Principles (from spec §6):
 * - Keep source facts separate from interpretation
 * - Never label "profit" as EBITDA
 * - claimed_recurring = true ONLY when listing text explicitly mentions contracts/agreements/recurring
 * - evidenced_recurring = false always (requires human review)
 * - Return null for missing fields — do not infer or invent
 */

import type { Ai } from '@cloudflare/workers-types';
import type { ExtractedFields } from '../types';

export const EXTRACTION_VERSION = '1.0.0';

// Max chars to send to LLM — Workers AI context limit safety margin
const MAX_TEXT_CHARS = 4000;

export async function extractFields(
  ai: Ai,
  listingTitle: string,
  rawText: string,
  askingPrice: number | null,
): Promise<ExtractedFields> {
  const truncatedText = rawText.slice(0, MAX_TEXT_CHARS);

  const prompt = buildExtractionPrompt(listingTitle, truncatedText, askingPrice);

  let response: string;
  try {
    const result = await (ai as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    });
    response = result?.response ?? result?.result ?? '';
  } catch (err) {
    console.error('[extractor] AI call failed:', err);
    throw err;
  }

  return parseExtractionResponse(response, askingPrice);
}

const SYSTEM_PROMPT = `You are a precise data extraction assistant for a business acquisition research platform. Extract structured facts from business listing text.

RULES:
1. Extract only what is explicitly stated — never infer, estimate, or invent missing information
2. Revenue, EBITDA, net profit, and seller's discretionary earnings are DISTINCT fields — never relabel one as another
3. "Profit" without further specification → profit_unspecified only. Never map to ebitda.
4. claimed_recurring = true ONLY when the listing explicitly mentions: contracts, service agreements, retainers, subscriptions, or recurring revenue. Not when inferred from sector type.
5. evidenced_recurring = false always (this field requires independent verification beyond listing text)
6. If a value is not stated, return null — never 0 or a guess
7. asking_multiple: only calculate when BOTH asking_price AND positive annual EBITDA are clearly stated. Label as "advertised multiple" not verified valuation.
8. Respond with valid JSON only — no explanation text outside the JSON object.`;

function buildExtractionPrompt(title: string, text: string, askingPrice: number | null): string {
  return `Extract structured data from this Australian business listing.

Title: ${title}
Asking Price: ${askingPrice != null ? `AUD $${askingPrice.toLocaleString()}` : 'Not stated'}

Listing text:
---
${text}
---

Return a JSON object with EXACTLY these fields (null if not stated):
{
  "revenue": number or null (annual revenue in AUD, integer),
  "revenue_raw": string or null (exact wording from listing),
  "ebitda": number or null (annual EBITDA in AUD — ONLY if explicitly labelled as EBITDA or Earnings Before Interest Tax Depreciation Amortisation),
  "ebitda_raw": string or null (exact wording from listing if EBITDA stated),
  "profit_unspecified_raw": string or null (exact wording if profit mentioned but type unspecified),
  "asking_multiple": number or null (only when asking_price AND positive annual EBITDA both clearly stated),
  "lease_years": number or null (lease term in years if stated),
  "staff_count": number or null (number of employees/staff if stated),
  "reason_for_sale": string or null (stated reason owner is selling),
  "years_established": number or null (years the business has been operating),
  "customer_type": "B2B" or "B2C" or "mixed" or null (based on explicit description of customers),
  "claimed_recurring": true or false (true ONLY if listing explicitly mentions contracts, service agreements, retainers, subscriptions, or recurring revenue),
  "description_summary": string (2-3 sentence neutral summary of what the business does, its key characteristics, and why it's for sale — based only on stated facts),
  "sector_classification": string (the most specific applicable sector from this list, or "Unknown" if unclear: fire_safety | hvac_maintenance | electrical_maintenance | vehicle_inspection | building_pest_inspection | pest_control | insurance_broking | mortgage_broking | financial_planning | allied_health | home_care | building_maintenance_strata | bookkeeping_accounting | physiotherapy | podiatry | swim_school | medical_billing | commercial_cleaning | ndis_services | childcare | vocational_training | aged_care_residential | dentistry | retail | hospitality | franchise | professional_services | trade_services | other_services | Unknown),
  "advertised_status": string or null (e.g. "active", "sold", "under contract" — only if explicitly stated)
}`;
}

function parseExtractionResponse(response: string, askingPrice: number | null): ExtractedFields {
  // Find JSON object in response
  const jsonMatch = /\{[\s\S]*\}/.exec(response);
  if (!jsonMatch) {
    return defaultExtraction();
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    return defaultExtraction();
  }

  const revenue = asInt(data.revenue);
  const ebitda = asInt(data.ebitda);

  // Validate and calculate asking_multiple safely
  let asking_multiple: number | null = null;
  if (
    askingPrice != null &&
    askingPrice > 0 &&
    ebitda != null &&
    ebitda > 0
  ) {
    asking_multiple = Math.round((askingPrice / ebitda) * 10) / 10;
  }
  // Override with model's if both match what we computed (cross-check)
  if (data.asking_multiple != null) {
    const modelMultiple = asFloat(data.asking_multiple);
    // Use model's value only if consistent with our calculation (within 20%)
    if (asking_multiple != null && modelMultiple != null) {
      const diff = Math.abs(modelMultiple - asking_multiple) / asking_multiple;
      if (diff < 0.2) asking_multiple = modelMultiple;
    } else if (asking_multiple == null) {
      // Model claims a multiple but we can't validate — discard
      asking_multiple = null;
    }
  }

  return {
    revenue,
    revenue_raw: asString(data.revenue_raw),
    ebitda,
    ebitda_raw: asString(data.ebitda_raw),
    profit_unspecified_raw: asString(data.profit_unspecified_raw),
    asking_multiple,
    lease_years: asInt(data.lease_years),
    staff_count: asInt(data.staff_count),
    reason_for_sale: asString(data.reason_for_sale),
    years_established: asInt(data.years_established),
    customer_type: asCustomerType(data.customer_type),
    claimed_recurring: data.claimed_recurring === true,
    description_summary: asString(data.description_summary) ?? 'No summary available.',
    sector_classification: asString(data.sector_classification) ?? 'Unknown',
    advertised_status: asString(data.advertised_status),
  };
}

function defaultExtraction(): ExtractedFields {
  return {
    revenue: null,
    revenue_raw: null,
    ebitda: null,
    ebitda_raw: null,
    profit_unspecified_raw: null,
    asking_multiple: null,
    lease_years: null,
    staff_count: null,
    reason_for_sale: null,
    years_established: null,
    customer_type: null,
    claimed_recurring: false,
    description_summary: 'Extraction failed — manual review required.',
    sector_classification: 'Unknown',
    advertised_status: null,
  };
}

// ---- type coercions ----

function asInt(val: unknown): number | null {
  if (val == null) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function asFloat(val: unknown): number | null {
  if (val == null) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function asString(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === 'null' || s === '' ? null : s;
}

function asCustomerType(val: unknown): 'B2B' | 'B2C' | 'mixed' | null {
  const s = asString(val);
  if (s === 'B2B' || s === 'B2C' || s === 'mixed') return s;
  return null;
}

export function computeContentHash(html: string): string {
  // Simple hash — djb2
  let hash = 5381;
  for (let i = 0; i < Math.min(html.length, 50000); i++) {
    hash = ((hash << 5) + hash) + html.charCodeAt(i);
    hash = hash & hash; // convert to 32-bit int
  }
  return Math.abs(hash).toString(16);
}
