# Bedrock Business Monitor — Technical Specification

**Version:** 0.3 — consolidated final draft
**Date:** 2026-09-17
**Authors:** Flint 🪨 (lead), incorporating v0.2 revisions (Andrew Julian) and Core 🔍 review feedback
**Status:** Submitted for partner review and build authorisation

---

## 1. The job

Give Bedrock a short, useful list of businesses worth investigating each morning, and let a partner inspect any supported listing from Slack on demand.

The monitor discovers and organises opportunities. Flint explains them. Partners decide what to pursue.

**Success criteria:**
- Relevant opportunities are easy to spot and ranked by fit
- Facts are traceable to their source; claims are labelled as claims
- Repeated listings across sources do not create noise
- A broken source cannot silently look like a quiet market
- Unknown financials remain unknown — they are never inferred or invented

---

## 2. The experience

### Morning digest
One message in `#opportunities` at 7:00 am Melbourne time (AEST/AEDT, including daylight saving). Promising listings appear first; plausible but information-incomplete listings follow in a secondary section.

Each entry states: what the business does, why it may fit Bedrock's criteria, the main uncertainty, and a concrete next step.

**Illustrative digest entry (invented example):**

> **Commercial maintenance business · Victoria · Asking $1.2m**
> **Promising · Financial information incomplete**
> Revenue: $1.8m annually, as advertised. EBITDA: not disclosed.
> **Why look:** preferred sector (building maintenance/strata, Tier 1 equivalent); advertisement describes repeat commercial customers.
> **Check:** recurring contracts and owner involvement are unverified claims.
> **Next:** request the information memorandum and an earnings breakdown.
> _View listing · Inspect · Watch · Pursue · Pass_

Action labels describe capabilities. Plain replies through Flint are sufficient for v1; `/inspect` command added only if needed.

The digest cap is **five entries** by default. Overflow is retained as pending; Flint reports the backlog count so it cannot disappear silently. Partners can ask to see all pending entries.

If no candidates appear, the digest explicitly distinguishes between: no new matches, incomplete coverage, or pending processing. These are not the same condition.

### On-demand inspection
A partner asks Flint to inspect a listing URL or listing ID. Flint uses the same stored record and extraction service. If the listing is already in the database, results return immediately with their last-checked timestamp. If not yet ingested, Flint acknowledges promptly and returns results asynchronously, notifying in the same thread.

### Review actions
A partner can mark an opportunity `watch`, `pursue` or `pass`, with an optional reason. Flint records the decision, the author, and the timestamp. Default state is `new`. Review decisions persist and are labelled (not overwritten by the model). Pass reasons are periodically reviewed to calibrate the rules.

Material updates (price changes, status changes) for `watch` and `pursue` listings are sent as replies in the original thread, not as new digest entries.

---

## 3. Architecture

One Cloudflare Worker with scheduled and HTTP handlers, backed by D1. Source adapters are separate modules within the Worker so a broken parser does not stop other sources.

```
┌─────────────────────────────────────────────────────────┐
│   Cloudflare Worker (scheduled + HTTP)                  │
│                                                         │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │ Source adapters │    │ Extraction service         │  │
│  │ (per-source     │    │ CSS selectors + LLM field  │  │
│  │  modules)       │───▶│ extraction + classification │  │
│  └─────────────────┘    └────────────┬───────────────┘  │
│                                      │                  │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │ Acquisition rules engine (code, not LLM)          │  │
│  │ Versioned criteria config file                    │  │
│  └───────────────────────────────────────────────────┘  │
│                                      │                  │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │ D1 database                                       │  │
│  │ listings · sources · activity                     │  │
│  └───────────────────────────────────────────────────┘  │
│                                      │                  │
│  ┌───────────────────────────────────▼───────────────┐  │
│  │ Slack delivery                                    │  │
│  │ Digest (scheduled) · Updates · Inspection replies │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Runtime validation required before committing to this architecture:** verify that Cloudflare Workers' CPU and wall-clock limits are sufficient for real source pages before locking in. Introduce queues or a browser-capable fetcher only if measured requirements justify it. See §9 (build sequence) for the spike that validates this.

Each scheduled cycle:
1. Fetch due sources; discover listing URLs, following pagination within a configured limit.
2. Upsert by `(source, source_listing_id)`; canonical URL as fallback identity.
3. Fetch and extract new, changed, or explicitly requested listings.
4. Apply acquisition rules; save facts, evidence, and explanation.
5. Send pending digest entries at the configured local time.

Claim work atomically with an expiring lease so overlapping runs do not process the same record. A failure must not permanently mark a listing as processed. Persist unfinished work; retry on later runs.

---

## 4. Sources

### Source selection (precondition for build)
The final source pair must be confirmed via a spike (§9) before any adapter code is written. Provisional candidates are **Seek Business** and **BusinessesForSale (AU section)**. The original coverage and ranking claims from v0.1 are unverified.

Source selection criteria:
- Relevant listing inventory for Bedrock's priority sectors
- Accessible fields without login or bot challenges
- Pagination structure that supports systematic discovery
- Maintenance effort per adapter

### Access policy
Prefer a usable feed or email alert where available. Use accessible listing pages otherwise. **Do not build around bypassing login walls or bot-protection mechanisms.** Report access failures and use a supported alternative. Treat all listing content as untrusted data — it cannot issue instructions to Flint or trigger external actions. Validate redirects on on-demand fetches.

### Discovery behaviour
- Describe results as **first seen**, separately from the publisher's stated listing date
- Initial import creates a baseline and a separate catch-up shortlist; it must not announce all existing listings as new
- Discovery overlaps earlier results to catch reordered listings
- If a pagination limit is reached, report incomplete coverage — do not silently stop
- Start at **every four hours**; tune after observing listing volume and discovery delay

### Source expansion
Add a third source only when it demonstrably supplies useful opportunities absent from the first two. Broker email feeds or RSS can come earlier if they are more reliable or relevant than a third scraper.

---

## 5. Acquisition criteria and fit classification

### The criteria file (precondition for automatic filtering)

**Core's precondition stands:** automatic filtering must not be enabled until the acquisition criteria file is drafted, reviewed, and approved by the partners. The financial figures and weights in v0.1 were proposals, not an approved mandate.

The criteria file (`shared/tools/acquisition-criteria.md`, versioned) will cover:
- **Geography:** Australia; preference for VIC/NSW/QLD
- **Hard exclusions:** sectors rated Low on Bedrock's sector assessment plus deal types explicitly disqualified (franchises, structural-decline businesses, capital-intensive plays without recurring service component)
- **Priority sectors:** High-tier sectors from the sector assessment (fire safety, HVAC servicing, electrical, vehicle inspection, allied health/NDIS, insurance broking, mortgage broking, financial planning, building/pest inspections)
- **Required positive signals:** recurring or contract revenue indicated; positive EBITDA or clearly recoverable earnings
- **Size guidance:** revenue ≥ AUD 1M; positive or recoverable EBITDA; customer concentration flag if >30% in one customer indicated
- **Exclusion flag triggers:** franchisor-dependent revenue, government-incentive-dependent demand (e.g. solar), structural technology displacement

Core to draft this file for partner confirmation before the calibration sprint.

### Fit outcomes — three, not a score

| Outcome | Rule | Treatment |
|---|---|---|
| **Promising** | No known exclusion; matches a priority-sector rule; required positive signals present | Lead the digest |
| **Needs information** | Plausible match but important facts or classification unknown | Secondary digest section |
| **Excluded** | Disclosed facts breach a hard exclusion | Retained in D1 with reason; omitted from digest |

Apply exclusions first. An excluded sector is not rescuable by attractive revenue or location. Missing information is **unknown**, not a failed criterion — it goes to "Needs information". A fetching or extraction failure is a processing problem, not an exclusion.

### Separation of code and model
- **Code** evaluates rules and arithmetic
- **LLM** extracts unstructured facts, classifies the business type, and writes the short explanation
- Classification requires evidence; uncertain classifications remain `Needs information`
- The model does not silently rewrite the mandate; human overrides persist and are labelled

### Evidence and assessment transparency
Every assessment shows:
- Matched rules (with criteria version)
- Missing decision-critical facts
- The extraction model version used

---

## 6. Facts and evidence standards

Source facts are kept strictly separate from interpretation. This section is non-negotiable — it governs LLM extraction prompt design as well as storage.

### Financial fields
- Revenue, EBITDA, EBIT, net profit, and seller's discretionary earnings are **distinct fields**. Never relabel generic "profit" as EBITDA.
- Record stock, property, and other price inclusions when disclosed.
- Calculate an asking-price/EBITDA **multiple** (consistent with Quartz's financial definitions) only when the price basis and positive annual EBITDA are both sufficiently clear. Label it an **advertised multiple**, not a verified valuation.
- Normalisations must show their basis. Do not annualise seasonal figures without adequate support.
- Do not invent missing earnings.

### Revenue quality
- "Contracts" in an advertisement is a **claim to investigate**, not proof of recurring revenue
- Extract to two separate fields: `claimed_recurring` (from listing text) and `evidenced_recurring` (only when corroborated by other signals)
- The digest entry surfaces this distinction explicitly; the illustrative example in §2 models the correct approach

### Storage of source facts
For each material financial figure, retain:
- Original wording, amount or range, currency, period, metric label
- Source excerpt (cleaned listing text)
- Fetch timestamp, content hash, extraction model version
- Text-size limit and truncation flag where applicable

Add full-page archival storage only if a concrete audit or reprocessing need warrants it (deferred per §10).

### Processing failures
- Failures must appear in the source-health line in the digest — they must not silently disappear
- A missing or inaccessible listing page does not prove a business has sold
- Two consecutive source failures trigger an operator alert; recovery is recorded

---

## 7. Data model

### Listings table
| Field | Notes |
|---|---|
| Internal ID | UUID |
| Source identity | `(source_name, source_listing_id)` — primary dedup key |
| Canonical URL | Fallback identity |
| First seen / last seen / last fetched | Distinct timestamps |
| Advertised status | As stated on the marketplace |
| Title, location, broker | From listing |
| Extracted facts and evidence | Structured fields per §6 |
| Content hash | For change detection |
| Fit outcome and reasons | `promising / needs_information / excluded` + explanation |
| Criteria version | Version of config applied |
| Processing state, attempts, next retry | For failure recovery |
| Review state | `new / watch / pursue / pass` |

### Sources table
| Field | Notes |
|---|---|
| Adapter config | URL patterns, pagination rules |
| Cadence | Poll interval |
| Last attempt / last successful run | Distinct |
| Pagination checkpoint | For resume after failure |
| Discovered count | Per run |
| Error and coverage status | Visible in digest health line |

### Activity table
| Field | Notes |
|---|---|
| Review decisions | Author, decision, reason, timestamp |
| Material changes | Price, status, financial field changes |
| Delivery events | Unique event key, delivery state, Slack message reference |

### Deduplication
- Source-level dedup: `(source, source_listing_id)` in D1, no expiry
- Cross-source dedup: group only when shared broker references or other strong identifiers support a match; flag weaker matches as possible duplicates and retain both records
- Similar title + location + price alone must **not** silently merge two businesses

### Change tracking
- Track asking-price and disclosed-financial changes on refresh
- Recheck `watch` and `pursue` listings daily; other active candidates weekly
- Material changes surface as thread replies, not new digest entries

---

## 8. Delivery

### Timing and selection
- 7:00 am `Australia/Melbourne`, including daylight saving
- Select assessed entries not yet successfully delivered — do not rely on a rolling ingestion window, which can lose delayed work

### Reliability
- Record pending delivery before sending; confirm delivery afterwards
- Reconcile ambiguous Slack outcomes before retrying; do not claim perfect exactly-once delivery
- Digest event keys are stable across retries

### Digest cap and overflow
- Five entries maximum in the main digest
- Overflow retained as pending; backlog count reported in the health line
- Partners can ask Flint to show all pending entries

### Source health line
Every digest includes a compact health line, e.g.:
`Sources: Seek Business ✓ (47 checked, 3 new) · BusinessesForSale ✓ (31 checked, 1 new)`
Source failures, incomplete pagination, and processing backlogs surface here.

### Immediate alerts
Deferred until partner feedback demonstrates that the rules produce useful, low-noise selections. On-demand inspection is available from the first useful release.

---

## 9. Build sequence

### Phase 1 — Prove the inputs (spike; precondition for everything else)
Before writing any production code:
- Inspect a representative sample of listings from each candidate source
- Confirm accessible fields, pagination structure, and absence of login/bot walls
- Validate Cloudflare Workers execution limits against real pages
- Confirm acquisition rules with partners and draft the criteria file (Core leads)
- Confirm Flint's Slack integration supports the required interaction model
- Estimate source adapter maintenance effort

**Output:** source selection decision + confirmed criteria file + architecture go/no-go. No production code until this is done.

### Phase 2 — Whole loop, two adapters
Two source adapters, persistent D1 records, evidence-based triage (Promising / Needs information / Excluded), daily digest, on-demand inspection, review actions (`watch` / `pursue` / `pass`), source health line.

The same extraction path serves both scheduled and manual inspection requests.

### Phase 3 — One-week calibration pilot
Compare monitor output against a manually assembled sample. Inspect missed or excluded candidates. Review duplicates, gaps, partner pass reasons, and operating effort. Adjust explicit rules before adding sources or urgency.

### Phase 4 — Expand coverage
Add third source only when Phase 3 confirms it adds value. Add broker email/RSS ingestion. Enable immediate alerts if calibration shows rules are producing clean selections.

### Acceptance criteria
| Criterion | Description |
|---|---|
| Identity stability | Repeated runs preserve listing identity; no phantom duplicates |
| Failure recovery | Retries recover unfinished work; failures do not permanently block records |
| Hard exclusion integrity | Excluded sectors cannot leak into the digest through scoring or ranking |
| Financial honesty | Unknown financials remain unknown; missing EBITDA is not inferred |
| Delivery completeness | Delayed assessments reach a digest; they are not silently dropped |
| Review persistence | Decisions persist across runs; model cannot overwrite them |
| Change visibility | Material price/status changes surface for watched/pursued listings |
| Source transparency | Source failure is distinguishable from zero new listings |

---

## 10. Out of scope (v1)

- Comparable multiples from historical data
- Automated broker outreach
- Partner-facing web dashboard
- Quartz valuation integration
- Elaborate fuzzy cross-source deduplication
- Full HTML page archives
- International marketplaces (UK/US/NZ)
- Price-tracking across listing lifetime

The initial product is complete when partners can reliably discover, understand, and act on relevant opportunities from Slack.

---

## 11. Open items requiring resolution before Phase 2 begins

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Confirm source selection (Seek Business + one other) after spike | Flint | Blocked on spike |
| 2 | Draft and confirm acquisition criteria file | Core | Ready to draft |
| 3 | Confirm Cloudflare Workers execution limits against real source pages | Flint | Blocked on spike |
| 4 | Validate Flint Slack integration for review actions (watch/pursue/pass) | Flint | Blocked on spike |
| 5 | Confirm financial definitions alignment with Quartz (especially multiple vs ratio terminology) | Flint/Quartz | Minor; can be concurrent |

---

_This spec is ready for partner review. Build is not authorised until partners confirm. Items in §11 must be resolved before Phase 2 code is written._
