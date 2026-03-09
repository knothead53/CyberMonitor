# CyberMonitor Roadmap

## Release Timeline

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

## v1.4.1 (Stability & Hardening)

- Status: Completed (March 2026)
- Hardened generator validation path (`validateNormalizedItem`, `filterInvalidItems`, dedupe/reporting flow)
- Improved partial-failure handling with safe adapter execution and previous-output recovery when needed
- Consistent per-feed health outcomes (`ok`, `warning`, `error`) with validation context in `feed-health.json`
- Frontend resilience hardening for missing metadata/health files, malformed feed payloads, stale states, and empty results
- Clearer freshness semantics in panels (`checked` vs `newest`) and subtle stale-state indicators
- GitHub workflow hardening: per-ref concurrency, timeout guardrail, no-change idempotence, run summary output

## Development Tracks (Post-v1.4.1)

Roadmap planning now transitions to track-based increments instead of a single linear version queue.

## Intelligence Expansion

- Add more high-signal public sources while keeping schema quality and dedupe quality stable
- Improve vendor/tag confidence scoring and source weighting
- Expand category coverage without increasing UI noise

## Map Intelligence

- Improve correlation quality and methodology transparency for derived overlays
- Add stronger regional confidence signaling to prevent over-interpretation
- Keep deterministic and auditable map derivation logic

## Platform Reliability

- Continue hardening feed generation reliability, observability, and stale-data handling
- Improve operational diagnostics for automation and adapter-level degradation
- Add repeatable quality checks for generated artifacts

## Deployment & Distribution

- Tighten refresh/publish cadence alignment for GitHub Pages deployment
- Improve release hygiene around generated artifacts and screenshots
- Evaluate packaging/distribution options after reliability targets are met
