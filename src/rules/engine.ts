/**
 * Acquisition rules engine
 * 
 * Applies Bedrock acquisition criteria (config/acquisition-criteria.md v0.2)
 * to classify each listing as Promising / Needs information / Excluded.
 * 
 * Rules are code — not LLM. The LLM extracts facts; this engine evaluates them.
 * 
 * Application order (from spec):
 * 1. Hard exclusions (deal type + sector) → Excluded
 * 2. Revenue hard floor: disclosed revenue < $500K → Excluded
 * 3. Capital intensity check → Excluded
 * 4. Geography: non-Australia → Excluded
 * 5. Tier 1 sector + no exclusion + ≥1 positive signal + revenue in range → Promising
 * 6. Tier 1 sector + no exclusion + no signals → Needs information
 * 7. Tier 2 sector + ≥2 positive signals + revenue in range → Promising
 * 8. Tier 2 sector → Needs information
 * 9. Unknown sector or revenue undisclosed → Needs information
 */

import type { ExtractedFields, FitResult, Listing } from '../types';

export const CRITERIA_VERSION = '0.2';

// ---- Hard exclusion sectors ----
const HARD_EXCLUDED_SECTORS = new Set([
  'hospitality',   // restaurants/cafes/bars
  'retail',        // general consumer retail
  'franchise',     // franchises (deal type exclusion too)
  'gym_fitness',
  'locksmith',
  'blinds_curtains',
  'gutter_cleaning',
  'handyman_franchise',
  'massage_spa',
  'tutoring_franchise',
  'driving_school',
  'photography_studio',
  'event_hire',
  'dtc_consumables',
  'recruitment_agency',
  'promotional_merchandise',
  'solar_installation',
  'pet_services',
  'residential_gardening',
  'office_supplies',
]);

// Sector classifications from extractor that map to hard excluded
const EXCLUDED_SECTOR_MAPPINGS: Record<string, boolean> = {
  'hospitality': true,
  'retail': true,
  'franchise': true,
};

// ---- Tier 1 sectors (highest conviction) ----
const TIER_1_SECTORS = new Set([
  'fire_safety',
  'hvac_maintenance',
  'electrical_maintenance',
  'vehicle_inspection',
  'building_pest_inspection',
  'pest_control',
  'insurance_broking',
  'mortgage_broking',
  'financial_planning',
  'allied_health',
  'home_care',
]);

// ---- Tier 2 sectors (medium conviction) ----
const TIER_2_SECTORS = new Set([
  'building_maintenance_strata',
  'bookkeeping_accounting',
  'physiotherapy',
  'podiatry',
  'swim_school',
  'medical_billing',
  'commercial_cleaning',
  'preventive_health',
]);

// ---- Watchlist sectors (require elevated scrutiny) ----
const WATCHLIST_SECTORS = new Set([
  'ndis_services',
  'childcare',
  'vocational_training',
  'aged_care_residential',
  'dentistry',
]);

const WATCHLIST_CAUTIONS: Record<string, string> = {
  'ndis_services': 'NDIS: funding reform risk, thin margins, workforce challenges, compliance intensity — elevated scrutiny required before Promising classification',
  'childcare': 'Childcare: highly regulated (NQF/ACECQA) but government subsidy-dependent (CCS) — regulatory risk is real',
  'vocational_training': 'Vocational training (RTO): ASQA regulated but VET FEE-HELP history creates reputational and funding risk — watch, not pursue',
  'aged_care_residential': 'Aged care (residential): complex compliance, CDC model disruption — prefer home care over residential',
  'dentistry': 'Dentistry: active rollup already mature, entry multiples elevated — window may have closed',
};

// Revenue bounds (from criteria §8)
const REVENUE_HARD_FLOOR = 500_000;      // Below this → Excluded
const REVENUE_PREFERRED_MIN = 1_000_000; // Below this → flag in missing facts
const REVENUE_PREFERRED_MAX = 20_000_000;

export interface RulesInput {
  sector: string | null;
  revenue: number | null;
  ebitda: number | null;
  askingPrice: number | null;
  claimedRecurring: boolean;
  customerType: string | null;
  yearsEstablished: number | null;
  reasonForSale: string | null;
  locationState: string | null;
  title: string | null;
  description: string | null;
}

export function applyRules(input: RulesInput): FitResult {
  const matchedRules: string[] = [];
  const missingFacts: string[] = [];

  // ---- Step 1: Hard exclusions — deal type ----
  if (input.title && /franchise/i.test(input.title)) {
    return excluded('Hard exclusion: franchise (deal type)', matchedRules, missingFacts);
  }

  if (input.sector && EXCLUDED_SECTOR_MAPPINGS[input.sector]) {
    return excluded(`Hard exclusion: sector (${input.sector})`, matchedRules, missingFacts);
  }

  // Check for structural decline keywords
  if (descriptionContains(input.description, ['structural decline', 'going out of business', 'closing down'])) {
    return excluded('Hard exclusion: structural decline', matchedRules, missingFacts);
  }

  // Franchise indicator in description
  if (
    input.sector === 'franchise' ||
    descriptionContains(input.description, ['franchise agreement', 'franchisor', 'franchisee'])
  ) {
    return excluded('Hard exclusion: franchise arrangement detected', matchedRules, missingFacts);
  }

  // Single-customer concentration > 50% (hard exclusion per criteria §3)
  if (descriptionContains(input.description, ['single customer', 'one customer', '100% of revenue', 'sole client'])) {
    return excluded('Hard exclusion: single-customer concentration risk (>50%)', matchedRules, missingFacts);
  }

  // ---- Step 2: Revenue hard floor ----
  if (input.revenue != null && input.revenue < REVENUE_HARD_FLOOR) {
    return excluded(
      `Hard exclusion: disclosed revenue $${input.revenue.toLocaleString()} below $500K floor`,
      matchedRules,
      missingFacts,
    );
  }

  // ---- Step 3: Capital intensity ----
  const isCapitalIntensive = descriptionContains(input.description, [
    'heavy machinery', 'fleet of vehicles', 'manufacturing plant', 'capital equipment',
    'significant plant', 'property ownership',
  ]);
  const hasServiceTail = input.claimedRecurring ||
    descriptionContains(input.description, ['service contracts', 'maintenance agreements', 'recurring service']);

  if (isCapitalIntensive && !hasServiceTail) {
    return excluded('Hard exclusion: high capital intensity without recurring service tail', matchedRules, missingFacts);
  }

  // ---- Step 4: Geography ----
  // All bsale/b2s listings are AU — geography exclusion only if explicitly overseas
  if (descriptionContains(input.description, ['new zealand only', 'uk only', 'united states only'])) {
    return excluded('Hard exclusion: non-Australian business', matchedRules, missingFacts);
  }

  // ---- Positive signals (criteria §7) ----
  const positiveSignals: string[] = [];

  if (input.claimedRecurring) {
    positiveSignals.push('Recurring/contract revenue mentioned (claimed — not verified)');
  }

  if (
    descriptionContains(input.description, [
      'licence', 'licensed', 'accredited', 'registration', 'AFSL', 'ARC', 'AHPRA',
      'FPAS', 'QBCC', 'certified', 'authorised', 'authorized',
    ])
  ) {
    positiveSignals.push('Licensed/regulated operation mentioned');
  }

  if (
    input.customerType === 'B2B' ||
    descriptionContains(input.description, [
      'commercial clients', 'business customers', 'corporate', 'government',
      'institutional', 'B2B', 'trade customers',
    ])
  ) {
    positiveSignals.push('B2B customer base described');
  }

  if (input.yearsEstablished != null && input.yearsEstablished >= 5) {
    positiveSignals.push(`Established tenure: ${input.yearsEstablished} years`);
  } else if (
    descriptionContains(input.description, ['established for', 'years of operation', 'years experience', 'founded in'])
  ) {
    // Try to extract years from description
    const yearMatch = /(\d+)\s*years?\s*(?:of\s*operation|established|experience|old)/i.exec(input.description ?? '');
    if (yearMatch) {
      const yrs = parseInt(yearMatch[1], 10);
      if (yrs >= 5) positiveSignals.push(`Established tenure: ${yrs} years (from description)`);
    }
  }

  if (
    input.reasonForSale &&
    /retirement|succession|lifestyle|health|family|personal/i.test(input.reasonForSale)
  ) {
    positiveSignals.push('Owner-operator transition indicated (retirement/lifestyle/succession)');
  }

  // ---- Missing facts assessment ----
  if (input.revenue == null) {
    missingFacts.push('Revenue not disclosed');
  } else if (input.revenue < REVENUE_PREFERRED_MIN) {
    missingFacts.push(`Revenue $${input.revenue.toLocaleString()} below preferred minimum $1M — verify`);
  } else if (input.revenue > REVENUE_PREFERRED_MAX) {
    missingFacts.push(`Revenue $${input.revenue.toLocaleString()} above $20M — flag for partner review`);
  }

  if (input.ebitda == null) {
    missingFacts.push('EBITDA not disclosed');
  }

  if (!input.claimedRecurring) {
    missingFacts.push('Recurring/contract revenue not confirmed in listing text');
  }

  if (input.locationState == null) {
    missingFacts.push('Location not identified');
  }

  // ---- Classification ----

  const sector = input.sector ?? 'Unknown';

  // Watchlist sectors — add caution note regardless of signals
  if (WATCHLIST_SECTORS.has(sector)) {
    const caution = WATCHLIST_CAUTIONS[sector];
    if (caution) missingFacts.unshift(caution);
  }

  // Step 5: Tier 1 + no exclusion + ≥1 signal + revenue in range
  if (TIER_1_SECTORS.has(sector)) {
    matchedRules.push(`Tier 1 sector: ${sector}`);

    if (positiveSignals.length >= 1 && isRevenueInRange(input.revenue)) {
      matchedRules.push(...positiveSignals);
      return {
        outcome: 'promising',
        matchedRules,
        missingFacts,
        criteriaVersion: CRITERIA_VERSION,
        sectorBedrock: sector,
      };
    }

    // Step 6: Tier 1 + no signals
    return {
      outcome: 'needs_information',
      matchedRules: [...matchedRules, `Tier 1 sector (${sector}) but no confirmed positive signals`],
      missingFacts: [...missingFacts, ...positiveSignals.map(s => `Unconfirmed signal: ${s}`)],
      criteriaVersion: CRITERIA_VERSION,
      sectorBedrock: sector,
    };
  }

  // Step 7: Tier 2 + ≥2 signals + revenue in range
  if (TIER_2_SECTORS.has(sector)) {
    matchedRules.push(`Tier 2 sector: ${sector}`);

    if (positiveSignals.length >= 2 && isRevenueInRange(input.revenue)) {
      matchedRules.push(...positiveSignals);
      return {
        outcome: 'promising',
        matchedRules,
        missingFacts,
        criteriaVersion: CRITERIA_VERSION,
        sectorBedrock: sector,
      };
    }

    // Step 8: Tier 2 → Needs information
    return {
      outcome: 'needs_information',
      matchedRules,
      missingFacts: [
        ...missingFacts,
        `Tier 2 sector (${sector}) requires ≥2 positive signals for Promising — ${positiveSignals.length} found`,
      ],
      criteriaVersion: CRITERIA_VERSION,
      sectorBedrock: sector,
    };
  }

  // Watchlist sectors with no positive signals → Needs information
  if (WATCHLIST_SECTORS.has(sector)) {
    return {
      outcome: 'needs_information',
      matchedRules: [`Watchlist sector: ${sector}`],
      missingFacts,
      criteriaVersion: CRITERIA_VERSION,
      sectorBedrock: sector,
    };
  }

  // Step 9: Unknown sector or revenue undisclosed
  return {
    outcome: 'needs_information',
    matchedRules: [`Sector unknown or unclassified (${sector})`],
    missingFacts: [...missingFacts, 'Sector classification required for further assessment'],
    criteriaVersion: CRITERIA_VERSION,
    sectorBedrock: sector === 'Unknown' ? null : sector,
  };
}

// ---- helpers ----

function excluded(reason: string, matchedRules: string[], missingFacts: string[]): FitResult {
  return {
    outcome: 'excluded',
    matchedRules: [...matchedRules, reason],
    missingFacts,
    criteriaVersion: CRITERIA_VERSION,
    sectorBedrock: null,
  };
}

function isRevenueInRange(revenue: number | null): boolean {
  if (revenue == null) return false; // Unknown — can't confirm in range
  return revenue >= REVENUE_PREFERRED_MIN && revenue <= REVENUE_PREFERRED_MAX;
}

function descriptionContains(description: string | null, terms: string[]): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  return terms.some(t => lower.includes(t.toLowerCase()));
}

export function buildRulesInput(listing: Listing, extracted: ExtractedFields): RulesInput {
  return {
    sector: extracted.sector_classification,
    revenue: extracted.revenue,
    ebitda: extracted.ebitda,
    askingPrice: listing.asking_price,
    claimedRecurring: extracted.claimed_recurring,
    customerType: extracted.customer_type,
    yearsEstablished: extracted.years_established,
    reasonForSale: extracted.reason_for_sale,
    locationState: listing.location_state,
    title: listing.title,
    description: extracted.description_summary,
  };
}
