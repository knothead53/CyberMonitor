# CyberMonitor Scripts

All scripts in this folder are optional developer tooling.

The frontend remains static and can run without executing scripts. When generated files
are missing, the UI falls back to `data/*.sample.json` (and sample map overlays).

## v1.4 Script Layout

- `generate-feeds.js`: unified runner for adapters + metadata/health/correlation outputs
- `refresh-sample-timestamps.js`: refreshes sample timestamps for demos
- `adapters/kev_adapter.js`: CISA KEV ingestion + normalization
- `adapters/news_adapter.js`: security news RSS ingestion + normalization
- `adapters/outages_adapter.js`: outage/status RSS ingestion + normalization
- `adapters/sources.js`: centralized public source configuration
- `adapters/lib/normalize.js`: shared normalization, tagging, dedupe helpers
- `adapters/lib/rss.js`: shared RSS/XML parsing helpers

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

## Generator Flow (v1.4)

`generate-feeds.js` runs a deterministic pipeline:

1. Runs each adapter independently (`kev`, `news`, `outages`).
2. Continues processing even if one adapter errors.
3. Reads resulting feed outputs and writes metadata report.
4. Writes health report with per-feed status and overall status.
5. Builds map-correlation overlays from generated feed signals.

This supports partial success instead of all-or-nothing generation.

## Generated Output Files

Primary feed artifacts:

- `data/kev.json`
- `data/news.json`
- `data/outages.json`

Observability artifacts:

- `data/feed-metadata.json`
- `data/feed-health.json`

Derived map artifact:

- `data/map.correlated.json`

## Health Status Semantics

Per-feed health values in `feed-health.json`:

- `ok`: adapter completed and output loaded successfully
- `warning`: adapter error occurred but existing output remained usable
- `error`: adapter failed and no generated output was available

`overallStatus` escalates to the highest severity observed across feeds.

## Current Public Sources

KEV:

- CISA Known Exploited Vulnerabilities feed

News:

- BleepingComputer RSS
- Dark Reading RSS
- Krebs on Security RSS
- The Hacker News RSS
- SANS ISC RSS

Outage/status:

- GitHub Status RSS
- OpenAI Status RSS
- Discord Status RSS
- Cloudflare Status RSS
- Slack Status RSS
- Atlassian Status RSS
- Heroku Status RSS

Source lists are configured in `scripts/adapters/sources.js`.

## GitHub Automation

Workflow: `.github/workflows/generate-feeds.yml`

- triggers on schedule (every 3 hours) and manual dispatch
- runs `node scripts/generate-feeds.js`
- stages generated artifacts when present
- commits only when outputs changed
- commit message: `chore: refresh generated intelligence feeds`

Baseline workflow usage does not require custom secrets.

## Frontend Fallback Contract

Feed panels load in this order:

1. `data/*.json` (generated)
2. `data/*.sample.json` (fallback)

Map overlays load in this order:

1. `data/map.correlated.json` (generated)
2. `data/map.overlays.sample.json` (fallback)

If metadata/health files are unavailable, UI observability labels degrade gracefully.

## Adding A New Source

1. Add source entries to `scripts/adapters/sources.js`.
2. Update adapter normalization logic only if schema mapping needs new handling.
3. Reuse shared helpers from `adapters/lib/normalize.js` and `adapters/lib/rss.js`.
4. Regenerate outputs with `node scripts/generate-feeds.js`.
5. Verify feed render, map correlation output, and fallback behavior in browser.
