# CyberMonitor

CyberMonitor is a free, no-login cybersecurity monitoring dashboard designed for instant loading on static hosting.

It aggregates cybersecurity signals into a SOC-style wallboard focused on:

- exploited vulnerabilities (CISA KEV)
- security news
- infrastructure outages
- threat signal visibility for future expansion

## Preview
![CyberMonitor dashboard preview](assets/screenshots/dashboard.png)

## What This MVP Includes

- Static front end in plain HTML, CSS, and JavaScript
- No backend server and no API keys
- Feed rendering from local JSON files in `/data`
- Layer toggles to hide or show panel streams
- Manual refresh control with last-updated timestamp
- `file://` fallback mode so `frontend/index.html` still renders data when opened directly

## Run Locally

1. Open this repository folder.
2. Double-click `frontend/index.html`.
3. The dashboard loads with sample feed data.

Optional: serve the repo with any static server if you want strict browser behavior that mirrors production hosting.

## Screenshot Placeholder

Screenshots and GIF walkthroughs will be added after visual polish and map integration in v1.1.

## Project Structure

```text
CyberMonitor/
|- frontend/
|  |- index.html         # Dashboard layout
|  |- styles.css         # Command-center visual style and responsive layout
|  |- app.js             # Feed fetching, rendering, refresh, and layer toggles
|- data/
|  |- kev.sample.json    # Sample KEV feed
|  |- news.sample.json   # Sample security news feed
|  |- outages.sample.json# Sample outage feed
|  |- fallback.sample.js # Local file-mode fallback payload
|- scripts/
|  |- README.md
|  |- refresh-sample-timestamps.js
|- assets/               # Reserved for icons/images
|- ROADMAP.md
|- CONTRIBUTING.md
|- README.md
```

## Data Contract (MVP)

Each feed item uses:

- `id`
- `title`
- `source`
- `published` (ISO timestamp)
- `url`
- `summary`
- optional tags like `severity` and `vendor`

## Roadmap Preview (v2 Focus)

- Real CISA KEV ingestion script
- Scheduled feed refresh with GitHub Actions
- Expanded feeds for ransomware and threat intelligence

See full milestones in [ROADMAP.md](ROADMAP.md).

## Contributing

Contributor expectations and lightweight workflow are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
