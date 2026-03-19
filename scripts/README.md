# CyberMonitor Scripts

The scripts directory is the static data pipeline for CyberMonitor.

The frontend does not fetch live feeds directly. Instead, scripts prepare JSON artifacts that the static UI can read safely.

## Entry Points

- `build-data.js`
  Main build pipeline.
- `generate-feeds.js`
  Compatibility wrapper that simply calls `build-data.js`.
- `refresh-sample-timestamps.js`
  Refreshes sample timestamps and regenerates the sample dashboard bundle.

## Current Script Layout

```text
scripts/
|- build-data.js
|- generate-feeds.js
|- refresh-sample-timestamps.js
|- lib/
|  |- adapters.js
|  |- correlate.js
|  |- exporters.js
|  |- files.js
|  |- geo.js
|  |- http.js
|  |- normalize.js
|  |- rss.js
|  |- source-config.js
```

## Build Flow

`build-data.js` runs this pipeline:

1. load source registry from `lib/source-config.js`
2. fetch live source payloads through `lib/adapters.js`
3. store raw snapshots in `data/raw/`
4. normalize source-specific records into a common schema
5. correlate related events into conservative clusters
6. export:
   - normalized events
   - correlated incidents
   - map bundle
   - dashboard bundle
   - legacy compatibility files
   - feed metadata and health
7. regenerate the sample dashboard bundle

## Output Files

### Raw

- `data/raw/*.json`

### Normalized

- `data/normalized/events.json`
- `data/normalized/summary.json`

### Correlated

- `data/correlated/incidents.json`
- `data/correlated/map.json`
- `data/correlated/dashboard.json`
- `data/correlated/dashboard.sample.json`

### Compatibility / frontend-friendly

- `data/kev.json`
- `data/news.json`
- `data/outages.json`
- `data/clusters.json`
- `data/map.correlated.json`
- `data/feed-metadata.json`
- `data/feed-health.json`

## CLI Usage

Full live + sample build:

```bash
node scripts/build-data.js
```

Sample-only:

```bash
node scripts/build-data.js --sample-only
```

Subset build:

```bash
node scripts/build-data.js --only cisa_kev,nvd_recent
node scripts/build-data.js --only priority
node scripts/build-data.js --only intel,outages
```

Compatibility wrapper:

```bash
node scripts/generate-feeds.js
```

## Sample Refresh

```bash
node scripts/refresh-sample-timestamps.js
```

That script:

1. updates timestamps in the committed sample feed files
2. reruns `build-data.js --sample-only`
3. refreshes the sample dashboard/map artifacts

## Source Registry

All sources live in `lib/source-config.js`.

Each source declares:

- key
- label
- adapter
- panel
- category
- source type
- URL
- freshness threshold
- enabled/disabled mode
- optional stub reason

## Notes

- Source failures should not break the entire dashboard build.
- Fallback reuse of previous normalized output is preferred over dropping a source entirely.
- Stubbed sources remain visible in health output so unsupported paths are explicit instead of implied.
