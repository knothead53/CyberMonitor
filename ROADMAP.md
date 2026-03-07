# CyberMonitor Roadmap

## v1 (Initial MVP)

- Static SOC-style dashboard shell in `frontend/`
- Sample feeds in `data/` for KEV, news, and outages
- Dynamic panel rendering with loading and error states
- Layer toggles and manual refresh behavior
- Last-updated indicator in top bar

## v1.1

- Status: Completed (March 2026)
- Leaflet world map integration in center wallboard module
- Panel-level filtering (severity, source, time window)
- Metrics widgets with sparkline trends
- Improved screenshots and repository polish

## v1.2

- Status: Completed (March 2026)
- Local preference persistence for layer/filter/search/timeline controls
- Timeline stepping controls for map overlay windows (`1h`, `6h`, `24h`, `7d`)
- Browser-side global search across KEV/news/outage panels
- Optional adapter scaffolding plus generated-feed fallback loading

## v1.3

- Status: Completed (March 2026)
- Real CISA KEV ingestion and normalization to `data/kev.json`
- Real security news ingestion from public RSS sources to `data/news.json`
- Real outage/status ingestion from public status RSS sources to `data/outages.json`
- Shared adapter normalization utilities in `scripts/adapters/lib/`
- Unified generation runner in `scripts/generate-feeds.js`
- Frontend feed-source indicators for live/sample/mixed visibility
- Continued static-host compatibility with sample fallback behavior

## v1.4 (Next)

- Add scheduled feed generation pipeline (GitHub Actions cron)
- Publish generated feed freshness metadata in the UI
- Expand source coverage with additional public intel/status feeds
- Add basic feed health reporting for failed adapters
- Improve map overlays with data-backed feed correlations (after ingestion automation hardens)

## Longer-Term Direction

- Automatic public data refresh cadence for GitHub Pages deployments
- Optional desktop packaging once data pipeline and refresh loop are stable
- More advanced threat clustering and regional intelligence overlays
