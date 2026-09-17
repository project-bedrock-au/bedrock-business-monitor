# Bedrock Business Monitor

Automated discovery, triage, and Slack digest for Australian business-for-sale marketplaces.

## Status
Pre-build — spec under partner review.

## Specification
See [SPEC.md](./SPEC.md) for the full technical specification (v0.3).

## Architecture
Cloudflare Worker (scheduled + HTTP) · D1 database · Slack delivery

## Repository structure (planned)
```
src/
  worker.ts          # Main Worker entry point
  adapters/          # Per-source adapters (one module per marketplace)
  extraction/        # LLM field extraction and classification
  rules/             # Acquisition rules engine
  delivery/          # Slack digest and notification delivery
  db/                # D1 schema and migrations
config/
  acquisition-criteria.md   # Versioned acquisition rules (to be confirmed by partners)
  sources.json              # Source adapter configuration
```

## Build sequence
1. Spike — prove sources, confirm criteria, validate runtime limits
2. Whole loop — two adapters, triage, digest, inspection, review actions
3. One-week calibration pilot
4. Expand coverage

## Team
Built and operated by Project Bedrock. Flint coordinates; Core confirms acquisition criteria.
