# CyberMonitor Scripts

All scripts in this folder are optional developer tooling.

The frontend stays static and can run without executing any script. If no generated
feeds are present, the UI falls back to `data/*.sample.json`.

## v1.3 Script Layout

- `generate-feeds.js`: runs all adapters in one command
- `adapters/kev_adapter.js`: CISA KEV ingestion + normalization
- `adapters/news_adapter.js`: security news RSS ingestion + normalization
- `adapters/outages_adapter.js`: status/outage RSS ingestion + normalization
- `adapters/lib/normalize.js`: shared normalization helpers
- `adapters/lib/rss.js`: shared RSS/XML parsing helpers
- `refresh-sample-timestamps.js`: refreshes sample timestamps for demos

## Quick Start

Run from repository root:

```bash
node scripts/generate-feeds.js
```

Optional subset:

```bash
node scripts/generate-feeds.js --only kev
node scripts/generate-feeds.js --only news,outages
```

Generated outputs:

- `data/kev.json`
- `data/news.json`
- `data/outages.json`

## Adapter Normalization Flow

Each adapter follows the same pattern:

1. Fetch feed data from one or more public sources.
2. Parse raw content (JSON or RSS/XML).
3. Normalize records into CyberMonitor schema.
4. Deduplicate and sort newest-first.
5. Write output JSON under `data/`.

Shared helpers are used for:

- stable ID generation
- date normalization
- severity normalization/inference
- vendor and keyword tag inference
- summary fallback/truncation
- deduplication

## Required Feed Schema

Adapters are expected to emit items that include at least:

- `id`
- `title`
- `source`
- `published` (ISO-8601)
- `url`
- `summary`
- `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
- `vendor`
- `tags` (array of strings)

## Current Public Sources

- KEV: CISA Known Exploited Vulnerabilities catalog feed
- News:
  - BleepingComputer RSS
  - Dark Reading RSS
  - Krebs on Security RSS
- Outages:
  - GitHub Status RSS
  - OpenAI Status RSS
  - Discord Status RSS
  - Cloudflare Status RSS

## Frontend Fallback Contract

Frontend load order for each intelligence panel:

1. Attempt generated file (`data/*.json`)
2. If unavailable, use sample fallback (`data/*.sample.json`)

This behavior is required to preserve static-host compatibility.

## Adding A New Source

1. Extend the adapter source list in the relevant adapter.
2. Reuse helpers from `adapters/lib/normalize.js` and `adapters/lib/rss.js`.
3. Keep output schema stable with existing panel rendering.
4. Regenerate outputs with `node scripts/generate-feeds.js`.
5. Validate frontend rendering and fallback behavior.
