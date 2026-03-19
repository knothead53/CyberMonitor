# CyberMonitor Roadmap

## Current State

CyberMonitor now has:

- static-first data generation with `raw -> normalized -> correlated -> dashboard`
- broader public-source ingestion
- conservative deterministic correlation
- a cleaned-up dark correlation dashboard UI
- source health and fallback visibility

## Next Enhancements

### Entity Extraction

- Improve vendor/product extraction from advisory and NVD text
- Add stronger actor and campaign recognition without introducing opaque ML dependencies
- Add better keyword normalization for product families and cloud services

### Threat Overlays

- Threat actor overlays
- campaign-specific map layers
- vendor-family and product-family overlays
- KEV-to-advisory relationship overlays

### Filtering And UX

- regional filters
- source-type filters
- severity sliders
- saved analyst views
- better focus mode for a selected incident cluster

### Data Sources

- STIX/TAXII ingestion paths where static export is practical
- optional Cisco openVuln support when credentials are provided
- improved Broadcom / VMware advisory support if a stable public feed is available
- optional GitHub security advisory ingestion
- optional exploit-metadata enrichment where a reliable public path exists

### Correlation Quality

- stronger entity normalization across aliases
- more transparent cluster explainability output
- better tie-breaking for primary headlines
- additional guardrails against transitive over-merging

### Automation

- build artifact validation checks in CI
- screenshot refresh workflow or checklist
- deploy-preview workflow for UI review
- optional manual workflow inputs for source subsets and sample-only runs

### Future Real-Time Mode

- socket-based live mode only as an additive path later
- keep the static-generated path as the default reliable mode

## Notes

- The screenshots folder is intentionally preserved and should be refreshed after visual QA.
- The project should continue prioritizing reliability and clarity over fragile "live magic".
