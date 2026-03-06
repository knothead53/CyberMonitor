# CyberMonitor Roadmap

## v1 (Current MVP)

- Static SOC-style dashboard shell in `frontend/`
- Sample feeds in `data/` for KEV, news, and outages
- Dynamic panel rendering with loading and error states
- Layer toggles and manual refresh behavior
- Last-updated indicator in top bar

## v1.1

- Status: Completed (March 2026)
- Replace map placeholder with lightweight interactive world map layer
- Add panel-level filtering (severity, source, time window)
- Add richer status widgets for active campaigns and trend lines
- Add screenshot and demo assets for repository homepage

## v1.2 (Stub)

- Add optional localStorage persistence for layer and filter preferences
- Expand map overlays with timeline stepping controls
- Introduce browser-side search across KEV/news/outage entries
- Add optional live feed adapter scripts while keeping static-host compatibility

## v2

- Build real KEV ingestion script in `scripts/`
- Add security news normalization pipeline with source tagging
- Add ransomware/threat intel feed schemas and sample generators
- Automate JSON refresh with GitHub Actions on a schedule
- Publish to GitHub Pages with action-based deployment checks

## Stretch Goals

- Add optional timeline playback mode
- Add browser-side search across all panel feeds
- Add lightweight settings persistence in localStorage
