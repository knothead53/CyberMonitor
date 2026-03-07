# CyberMonitor Scripts

All scripts in this folder are optional developer tooling. The frontend stays static and
works without running any script.

## Adapter workflow (v1.2)

The adapter scripts normalize feed data into files that match the frontend schema:

- `data/kev.json`
- `data/news.json`
- `data/outages.json`

The dashboard attempts these generated files first. If they are missing, it falls back
to the sample files in `data/*.sample.json`.

Current adapters:

- `scripts/adapters/kev_adapter.js`
- `scripts/adapters/news_adapter.js`
- `scripts/adapters/outages_adapter.js`

Run from repository root:

```bash
node scripts/adapters/kev_adapter.js
node scripts/adapters/news_adapter.js
node scripts/adapters/outages_adapter.js
```

Each adapter supports optional overrides:

```bash
node scripts/adapters/kev_adapter.js --input data/kev.sample.json --output data/kev.json
```

## Existing utility

- `refresh-sample-timestamps.js` updates `published` timestamps in sample feeds so the
  dashboard looks fresh during demos.
