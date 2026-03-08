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

## v1.4

- Status: Completed (March 2026)
- Scheduled feed generation workflow in GitHub Actions (`generate-feeds.yml`)
- Automated generated-artifact commits when data changes are detected
- Feed metadata output (`data/feed-metadata.json`) with per-feed freshness details
- Feed health output (`data/feed-health.json`) with per-feed status reporting
- Expanded public source coverage for news and outage/status ingestion
- Derived map-correlation output (`data/map.correlated.json`) from generated feeds
- Dashboard freshness and health indicators in top bar and panel headers
- Maintained static fallback compatibility for generated/sampled operation modes

## v1.5 (Next)

- Add stale-feed thresholds and explicit staleness badges in UI
- Persist last-success snapshots per feed for safer degraded-mode generation
- Add structured generator logs/artifact summary for troubleshooting workflow runs
- Expand public source diversity with category-level weighting/dedup tuning
- Tighten Pages deployment coupling so feed refresh and publish cadence stay aligned

## Longer-Term Direction

- Public-facing intelligence wallboard with predictable refresh cadence
- Optional desktop packaging after pipeline reliability hardens
- Stronger regional clustering and map analytics grounded in real feed signals
