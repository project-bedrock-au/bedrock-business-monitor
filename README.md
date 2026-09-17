# Bedrock Business Monitor

Automated discovery, triage, and Slack digest for Australian business-for-sale marketplaces.

**Stack:** TypeScript · Cloudflare Workers · D1 · Workers AI

**Status:** Ready to deploy (Phase 2 complete)

---

## What it does

Each morning at 7:00am Melbourne time, the monitor:

1. Discovers new listings from Business2Sell and Bsale
2. Extracts structured fields via Workers AI (LLM)
3. Classifies each listing as *Promising*, *Needs information*, or *Excluded* using Bedrock's acquisition criteria
4. Sends a digest to Slack — Promising first, Needs information second, up to 5 entries
5. Reports source health and backlog count

Partners can also `/inspect` any listing URL for an immediate enriched report.

---

## Source selection

| Source | URL | Notes |
|---|---|---|
| Business2Sell | business2sell.com.au | 5,797 AU listings; explicitly allows AI crawlers |
| Bsale | bsale.com.au | ~10,000 AU listings; JSON-LD discovery |

**Seek Business** and **BusinessesForSale AU** (the original candidates) were evaluated in the Phase 1 spike and rejected — both are protected by Cloudflare bot-protection (HTTP 403 for all programmatic access). Bypassing bot-protection is explicitly prohibited by the spec.

See `spike/source-findings.md` for full spike report.

---

## Directory structure

```
src/
  index.ts           # Worker entry point — routes scheduled + HTTP requests
  types.ts           # Shared TypeScript types
  adapters/
    business2sell.ts # Business2Sell discovery and detail fetch
    bsale.ts         # Bsale discovery and detail fetch
  extraction/
    extractor.ts     # Workers AI LLM field extraction + sector classification
  rules/
    engine.ts        # Acquisition rules engine (code, not LLM)
  delivery/
    slack.ts         # Slack digest + inspection reply
  db/
    schema.sql       # D1 schema + migrations
    queries.ts       # D1 query helpers
config/
  acquisition-criteria.md  # Versioned acquisition criteria (v0.2 — draft, awaiting partner confirmation)
  sources.json             # Source adapter config
spike/
  source-findings.md       # Phase 1 spike report
wrangler.jsonc
```

---

## Deployment

### Prerequisites

- Node 18+
- Wrangler 4+: `npm i -g wrangler`
- Cloudflare account with Workers Paid plan (for AI binding)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/project-bedrock-au/bedrock-business-monitor.git
cd bedrock-business-monitor
npm install

# 2. Create D1 database
wrangler d1 create bedrock-monitor
# Copy the returned database_id into wrangler.jsonc

# 3. Run migrations
wrangler d1 execute bedrock-monitor --file=src/db/schema.sql
# or: npm run db:migrate

# 4. Set secrets
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put SLACK_BOT_TOKEN   # optional, for thread replies
wrangler secret put SLACK_CHANNEL_ID  # optional, used with bot token

# 5. Dev (local)
wrangler dev
# Triggers: POST http://localhost:8787/run (development mode)
# Inspect:  POST http://localhost:8787/inspect {"url": "..."}
# Review:   POST http://localhost:8787/review {"listingId": "...", "action": "watch", "actor": "andrew"}

# 6. Deploy
wrangler deploy
```

### Post-deploy

The worker runs on schedule (`0 20 * * *` UTC = 7am Melbourne AEST).

To force an immediate cycle: `POST /run` (only available in development mode).

---

## API endpoints

### `POST /inspect`

Inspect a listing by URL or stored ID.

```json
{ "url": "https://www.business2sell.com.au/businesses-details/..." }
// or
{ "listingId": "business2sell:399612" }
```

Returns the enriched listing record + human-readable summary. If not yet in D1, queues extraction and returns `{ status: "processing" }`.

### `POST /review`

Mark a listing for follow-up.

```json
{
  "listingId": "business2sell:399612",
  "action": "watch",        // watch | pursue | pass
  "actor": "andrew",
  "reason": "Good fit, check financials"
}
```

### `GET /status`

Returns source health status.

---

## Configuration

### wrangler.jsonc

Update `database_id` after running `wrangler d1 create bedrock-monitor`.

The cron `0 20 * * *` fires at UTC 8pm (= 7am Melbourne AEST). During AEDT (daylight saving, October–April) this becomes 7am UTC+11, so adjust to `0 19 * * *` during that period. A future version should use a time-aware library for automatic adjustment.

### Acquisition criteria

`config/acquisition-criteria.md` (v0.2) is the criteria file read by the rules engine. It is a **draft pending partner confirmation** — automatic filtering is enabled in the code but the criteria file notes which parameters still need sign-off (§12 of that file).

Key parameters awaiting confirmation:
- Revenue hard floor AUD 500K
- Revenue ceiling flag AUD 20M
- NDIS: Medium/watchlist status confirmed (not Tier 1)
- Home care (aged care): elevation to Tier 1 agreed in Ronan session but not formally confirmed

---

## Architecture decisions

### Why Cloudflare Workers + D1?

- Workers AI is available as a native binding — no external API calls for LLM extraction
- D1 gives persistent storage for listing dedup, state management, and activity log
- Scheduled Workers handle the 7am cron natively
- No server to manage; global edge deployment

### Why not Queues?

The spike confirmed that Workers CPU/wall-clock limits are sufficient for source page fetching and HTML parsing. LLM extraction runs via Workers AI (out-of-process). Queues deferred to Phase 4 if extraction volume grows beyond the 20-item batch limit.

### Extraction: LLM vs code

- **Code** evaluates acquisition rules and arithmetic (rules engine)
- **LLM** extracts unstructured facts from listing text (field extraction)

This separation is intentional. The LLM cannot override rules or reclassify exclusions.

---

## Open items

These require partner confirmation before automatic filtering should be treated as final:

| Item | Notes |
|---|---|
| Revenue floor $500K | In criteria v0.2 — confirm or adjust |
| Revenue ceiling flag $20M | In criteria v0.2 — confirm or adjust |
| NDIS watchlist status | Agreed in Ronan session; confirm formally |
| Home care Tier 1 elevation | Agreed in Ronan session; confirm formally |
| AEDT cron adjustment | `0 19 * * *` in Oct–Apr vs `0 20 * * *` in Apr–Oct |
| Workers Paid plan | Required for Workers AI binding |

---

## Phase roadmap

| Phase | Status |
|---|---|
| Phase 1: Spike | ✅ Complete — see spike/source-findings.md |
| Phase 2: Full implementation | ✅ Complete — ready to deploy |
| Phase 3: One-week calibration pilot | ⏳ Pending deployment |
| Phase 4: Expand coverage | ⏳ After Phase 3 calibration |

---

*Part of Project Bedrock — confidential.*
