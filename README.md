# CyberMonitor

CyberMonitor is a static-friendly cyber-intelligence correlation dashboard built with plain HTML, CSS, and JavaScript.

It is designed to work well on GitHub Pages or any other static host:

- feed collection happens in build scripts
- normalized and correlated JSON is committed as artifacts
- the frontend reads prepared data bundles
- sample fallback data keeps the UI usable when live feeds fail

## What Changed

CyberMonitor now moves beyond a simple demo map into a more serious correlation workflow:

- richer public-source ingestion across vulnerability, advisory, news, and status feeds
- a shared normalized event schema across all source types
- conservative multi-source incident clustering
- structured outputs in `data/raw`, `data/normalized`, and `data/correlated`
- a cleaner, darker, more polished 2D intelligence map
- a source-intelligence drawer for feed health and fallback visibility

## Architecture

### Static-first model

CyberMonitor intentionally does not require a backend server for the default experience.

The data pipeline runs ahead of time:

1. fetch live public feeds
2. store per-source raw snapshots
3. normalize records into a common event schema
4. correlate related events into incident clusters
5. export frontend-ready dashboard bundles and compatibility files
6. publish the static site with generated JSON

### Repository layers

- `frontend/`
  Static dashboard UI, modular browser code, Leaflet map, and presentation logic.
- `scripts/`
  Build pipeline, source registry, normalization helpers, and correlation logic.
- `data/raw/`
  Per-source raw snapshots from the latest successful fetch.
- `data/normalized/`
  Unified normalized event output.
- `data/correlated/`
  Correlated incident clusters, map bundle, and dashboard bundle.
- `data/*.sample.json` and `data/fallback.sample.js`
  Sample fallback content for static/offline operation.
- `.github/workflows/`
  Feed generation and GitHub Pages deployment automation.

## Data Pipeline

Entry points:

- `node scripts/build-data.js`
- `node scripts/generate-feeds.js`

`generate-feeds.js` is now a compatibility wrapper over `build-data.js`.

### Pipeline stages

1. `scripts/lib/source-config.js`
   Declares supported live sources, optional stubs, output paths, and panel groupings.
2. `scripts/lib/adapters.js`
   Fetches source payloads and converts them into normalized CyberMonitor events.
3. `scripts/lib/normalize.js`
   Applies shared schema shaping, severity logic, vendor detection, CVE extraction, geo approximation, and stable IDs.
4. `scripts/lib/correlate.js`
   Builds conservative incident clusters using deterministic similarity rules.
5. `scripts/lib/exporters.js`
   Writes:
   - `data/raw/*.json`
   - `data/normalized/events.json`
   - `data/normalized/summary.json`
   - `data/correlated/incidents.json`
   - `data/correlated/map.json`
   - `data/correlated/dashboard.json`
   - compatibility files such as `data/kev.json`, `data/news.json`, `data/outages.json`, `data/feed-health.json`, and `data/map.correlated.json`

## Normalized Event Schema

The shared normalized schema supports:

```json
{
  "id": "string",
  "source": "string",
  "source_key": "string",
  "source_type": "string",
  "title": "string",
  "summary": "string",
  "url": "string",
  "published_at": "ISO-8601 string",
  "discovered_at": "ISO-8601 string",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "confidence": 0.0,
  "category": "string",
  "tags": ["string"],
  "vendor": "string",
  "product": "string",
  "cve_ids": ["CVE-YYYY-NNNN"],
  "campaign": "string",
  "actor": "string",
  "victim_region": "string",
  "latitude": 0,
  "longitude": 0,
  "geo_precision": "reported | region | vendor-hq | global",
  "incident_key": "string",
  "correlation_key": "string",
  "related_sources": ["string"],
  "related_event_ids": ["string"],
  "raw_hash": "string"
}
```

## Correlation Model

CyberMonitor uses deterministic, conservative merge rules.

Signals are grouped only when enough evidence exists across:

- CVE overlap
- vendor/product alignment
- title similarity
- summary similarity
- actor/campaign alignment
- category/domain compatibility
- time-window proximity

The merger intentionally prefers under-merging to over-merging.

Each correlated cluster includes:

- `cluster_id`
- primary headline
- merged summary
- severity rollup
- source count
- event count
- first seen / last seen
- related sources
- related CVEs
- related vendors/products
- merge confidence

## Supported Sources

### Live sources enabled by default

Priority vulnerability / advisory sources:

- CISA KEV
- NVD recent CVEs
- Microsoft Security Update Guide
- Fortinet PSIRT
- Palo Alto Security Advisories

Intel / advisory sources:

- CISA Alerts & Advisories
- BleepingComputer
- Dark Reading
- Krebs on Security
- The Hacker News
- SANS ISC

Operational status sources:

- Cloudflare Status
- GitHub Status
- OpenAI Status
- Discord Status
- Slack Status
- Atlassian Status
- Heroku Status

### Explicit stubs

These are kept visible in feed health so the project is honest about what is not yet automated:

- Cisco PSIRT openVuln
  Disabled by default because it requires API credentials.
- Broadcom / VMware advisories
  Stubbed because public machine-readable access is inconsistent and brittle.

## Feed Health And Fallback

`data/feed-health.json` tracks per source:

- status
- mode (`live`, `fallback`, `stub`)
- last success
- last failure
- item count
- freshness age
- failure count
- error message

If a live fetch fails, the builder tries to retain the last known normalized data for that source when available.

If generated dashboard bundles are unavailable in the browser, the frontend falls back to:

1. `data/correlated/dashboard.sample.json`
2. `data/fallback.sample.js`

## Frontend Notes

The current UI keeps the dark cyber-ops aesthetic while cleaning up structure:

- left rail: map layers and telemetry
- center: premium dark 2D map with clustering and density mode
- right rail:
  - Correlated Incidents
  - Priority Vulnerabilities
  - Intel & Advisories
  - Service Disruptions
- source-intelligence drawer with per-source health

The map uses Leaflet and external tile/CDN libraries. If those browser dependencies fail, the rest of the dashboard still renders.

## Local Run

### 1. Generate data

Live + sample artifacts:

```bash
node scripts/build-data.js
```

Sample-only artifacts:

```bash
node scripts/build-data.js --sample-only
```

Subset generation:

```bash
node scripts/build-data.js --only cisa_kev,nvd_recent
node scripts/build-data.js --only priority
node scripts/build-data.js --only intel,outages
```

### 2. Serve the repo root

Example with Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/frontend/
```

## Exact Local Verification Steps

Use these in order:

1. `node scripts/build-data.js --sample-only`
2. `node scripts/build-data.js`
3. `python -m http.server 8000`
4. Open `http://localhost:8000/frontend/`
5. Verify:
   - the top bar shows data mode and health
   - the map renders markers and layer toggles work
   - timeline buttons reduce the visible signal count
   - the Source Intelligence drawer opens and lists sources
   - the right-rail panels update when search text changes

## GitHub Actions

### Feed generation

Workflow: `.github/workflows/generate-feeds.yml`

- runs on schedule every 3 hours
- supports manual dispatch
- runs `node scripts/build-data.js`
- commits changed generated artifacts under `data/`
- writes a run summary including overall pipeline health and source count

### GitHub Pages deployment

Workflow: `.github/workflows/deploy-pages.yml`

- supports manual dispatch
- auto-deploys on pushes to `main` that change `frontend/`, `data/`, or `assets/`
- publishes the static site bundle with no backend requirements

## Screenshots

The screenshots folder is preserved as requested:

- `assets/screenshots/`

The current screenshots should be refreshed after the new correlation dashboard is visually validated in-browser.

## Known Limitations

- Some vendor sources remain intentionally stubbed until a reliable public machine-readable path exists.
- Geographic placement is approximate for many cyber signals and should not be treated as authoritative attribution.
- The project currently depends on browser-accessible CDN assets for Leaflet plugins and map tiles.
- This repo does not yet provide STIX/TAXII or socket-based live streaming.

## Project Structure

```text
CyberMonitor/
|- .github/
|  |- workflows/
|     |- deploy-pages.yml
|     |- generate-feeds.yml
|- assets/
|  |- screenshots/
|- data/
|  |- raw/
|  |- normalized/
|  |- correlated/
|  |- kev.sample.json
|  |- news.sample.json
|  |- outages.sample.json
|  |- map.overlays.sample.json
|  |- fallback.sample.js
|  |- kev.json
|  |- news.json
|  |- outages.json
|  |- clusters.json
|  |- feed-metadata.json
|  |- feed-health.json
|  |- map.correlated.json
|- frontend/
|  |- index.html
|  |- styles.css
|  |- app.js
|  |- modules/
|- scripts/
|  |- build-data.js
|  |- generate-feeds.js
|  |- refresh-sample-timestamps.js
|  |- lib/
|- ROADMAP.md
```

## Related Docs

- [ROADMAP.md](ROADMAP.md)
- [scripts/README.md](scripts/README.md)
