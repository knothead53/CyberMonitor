#!/usr/bin/env node

const path = require("path");
const { runSource } = require("./lib/adapters");
const { correlateEvents } = require("./lib/correlate");
const { readJsonIfExists, writeJson } = require("./lib/files");
const {
  buildDashboardPayload,
  buildHealthPayload,
  buildLegacyPanelFeed,
  buildMapPayload,
  buildMetadataPayload,
  buildPanelCollections
} = require("./lib/exporters");
const { createEvent } = require("./lib/normalize");
const { OUTPUT_PATHS, PANEL_DEFINITIONS, PANEL_KEYS, SOURCE_REGISTRY } = require("./lib/source-config");

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1];
}

function parseOnlyList() {
  const value = getArgValue("--only");
  if (!value) {
    return null;
  }
  const parsed = value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  return parsed.length > 0 ? new Set(parsed) : null;
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];
  events.forEach((event) => {
    const key = `${event.source_key}|${event.id}|${event.raw_hash}|${event.published_at}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(event);
  });
  return deduped;
}

function normalizeBootstrapItem(source, item, generatedAt) {
  return createEvent(source, item, {
    id: item.id,
    title: item.title,
    summary: item.summary,
    url: item.url,
    published_at: item.published || item.published_at,
    severity: item.severity,
    vendor: item.vendor,
    product: item.product,
    cve_ids: item.cve_ids || (item.cve ? [item.cve] : [])
  }, { generatedAt });
}

function findSourceByLabel(label, panelKey) {
  const normalized = String(label || "").trim().toLowerCase();
  return SOURCE_REGISTRY.find((source) => String(source.label || "").trim().toLowerCase() === normalized && (!panelKey || source.panel === panelKey))
    || SOURCE_REGISTRY.find((source) => String(source.label || "").trim().toLowerCase() === normalized)
    || null;
}

async function loadLegacyBootstrapEvents(generatedAt) {
  const panels = [
    { path: OUTPUT_PATHS.legacy.priority, panel: PANEL_KEYS.PRIORITY, fallbackSource: "cisa_kev" },
    { path: OUTPUT_PATHS.legacy.intel, panel: PANEL_KEYS.INTEL, fallbackSource: "bleepingcomputer" },
    { path: OUTPUT_PATHS.legacy.outages, panel: PANEL_KEYS.OUTAGES, fallbackSource: "cloudflare_status" }
  ];

  const all = [];

  for (const panel of panels) {
    const items = await readJsonIfExists(panel.path, []);
    if (!Array.isArray(items)) {
      continue;
    }
    items.forEach((item) => {
      const matchedSource = findSourceByLabel(item.source, panel.panel)
        || SOURCE_REGISTRY.find((source) => source.key === panel.fallbackSource);
      if (!matchedSource) {
        return;
      }
      all.push(normalizeBootstrapItem(matchedSource, item, generatedAt));
    });
  }

  return all;
}

async function loadPreviousState(generatedAt) {
  const normalized = await readJsonIfExists(OUTPUT_PATHS.normalized.events, null);
  if (Array.isArray(normalized) && normalized.length > 0) {
    return normalized;
  }
  return loadLegacyBootstrapEvents(generatedAt);
}

function groupEventsBySource(events) {
  return events.reduce((acc, event) => {
    if (!acc[event.source_key]) {
      acc[event.source_key] = [];
    }
    acc[event.source_key].push(event);
    return acc;
  }, {});
}

function buildSourceStatus({ source, generatedAt, previousHealthEntry, currentEvents, fetchError, fallbackUsed, rawSnapshot }) {
  const itemCount = currentEvents.length;
  const enabled = source.enabled !== false;
  const newestItemAt = itemCount > 0
    ? currentEvents.reduce((latest, event) => (Date.parse(event.published_at || "") > Date.parse(latest || "") ? event.published_at : latest), currentEvents[0]?.published_at || generatedAt)
    : previousHealthEntry?.newestItemAt || null;
  const lastSuccessAt = !fetchError && rawSnapshot?.fetchedAt
    ? rawSnapshot.fetchedAt
    : previousHealthEntry?.lastSuccess || previousHealthEntry?.last_success || null;
  const lastFailureAt = fetchError ? generatedAt : previousHealthEntry?.lastFailure || previousHealthEntry?.last_failure || null;
  const freshnessAgeMs = lastSuccessAt ? Math.max(0, Date.parse(generatedAt) - Date.parse(lastSuccessAt)) : null;
  const staleThreshold = (source.freshnessHours || 24) * 60 * 60 * 1000;

  let status = "ok";
  if (!enabled) {
    status = "degraded";
  } else if (fetchError && itemCount === 0) {
    status = "error";
  } else if (fetchError && fallbackUsed) {
    status = "degraded";
  } else if (freshnessAgeMs != null && freshnessAgeMs > staleThreshold * 1.5) {
    status = "stale";
  }

  const previousFailureCount = Number.parseInt(String(previousHealthEntry?.failureCount || 0), 10) || 0;
  const failureCount = fetchError ? previousFailureCount + 1 : 0;

  return {
    name: source.label,
    panel: source.panel,
    sourceType: source.sourceType,
    url: source.url,
    enabled,
    mode: !enabled ? "stub" : fallbackUsed ? "fallback" : "live",
    status,
    lastSuccess: lastSuccessAt,
    newestItemAt,
    lastFailure: lastFailureAt,
    itemCount,
    freshnessAgeMs,
    failureCount,
    errorMessage: fetchError ? fetchError.message : (!enabled ? source.stubReason : ""),
    fallbackUsed,
    rawSnapshotPath: rawSnapshot ? `data/raw/${source.key}.json` : null
  };
}

function buildGroupStatuses(sourceStatuses) {
  const groups = {
    [PANEL_KEYS.PRIORITY]: [],
    [PANEL_KEYS.INTEL]: [],
    [PANEL_KEYS.OUTAGES]: []
  };

  Object.values(sourceStatuses).forEach((entry) => {
    if (!groups[entry.panel]) {
      groups[entry.panel] = [];
    }
    groups[entry.panel].push(entry);
  });

  return Object.fromEntries(Object.entries(groups).map(([panelKey, entries]) => {
    const title = PANEL_DEFINITIONS[panelKey]?.title || panelKey;
    const itemCount = entries.reduce((total, entry) => total + (entry.itemCount || 0), 0);
    const statuses = entries.filter((entry) => entry.enabled !== false).map((entry) => entry.status);
    const status = statuses.includes("error")
      ? "error"
      : statuses.includes("degraded")
        ? "degraded"
        : statuses.includes("stale")
          ? "stale"
          : "ok";
    return [
      panelKey,
      {
        name: title,
        status,
        sourceCount: entries.length,
        itemCount
      }
    ];
  }));
}

function buildNotes(sourceStatuses) {
  const unsupported = Object.entries(sourceStatuses)
    .filter(([_key, entry]) => entry.enabled === false)
    .map(([key, entry]) => ({
      key,
      name: entry.name,
      reason: entry.errorMessage
    }));

  return {
    methodology: "Deterministic correlation uses CVE overlap, vendor/product normalization, title and summary similarity, actor/campaign matching, source categories, and time windows. Weak matches stay separate.",
    unsupported_sources: unsupported
  };
}

async function buildLiveArtifacts() {
  const generatedAt = new Date().toISOString();
  const previousHealth = await readJsonIfExists(OUTPUT_PATHS.legacy.health, {});
  const previousEvents = await loadPreviousState(generatedAt);
  const previousBySource = groupEventsBySource(previousEvents);
  const onlySet = parseOnlyList();
  const selectedSources = SOURCE_REGISTRY.filter((source) => !onlySet || onlySet.has(source.key) || onlySet.has(source.panel));

  const collectedEvents = [];
  const sourceStatuses = {};
  const sourceMetadata = {
    generatedAt,
    sources: {}
  };

  for (const source of selectedSources) {
    const previousEventsForSource = previousBySource[source.key] || [];
    const previousHealthEntry = previousHealth?.sources?.[source.key] || {};
    let currentEvents = [];
    let fetchError = null;
    let fallbackUsed = false;
    let rawSnapshot = null;

    try {
      const result = await runSource(source, { generatedAt });
      currentEvents = dedupeEvents(result.events || []);
      rawSnapshot = result.rawSnapshot;

      if (rawSnapshot?.mode !== "stub") {
        await writeJson(path.resolve(OUTPUT_PATHS.rawDir, `${source.key}.json`), rawSnapshot);
      }
    } catch (error) {
      fetchError = error instanceof Error ? error : new Error("Unknown source failure");
      if (previousEventsForSource.length > 0) {
        currentEvents = previousEventsForSource;
        fallbackUsed = true;
      }
    }

    const statusEntry = buildSourceStatus({
      source,
      generatedAt,
      previousHealthEntry,
      currentEvents,
      fetchError,
      fallbackUsed,
      rawSnapshot
    });

    sourceStatuses[source.key] = statusEntry;
    sourceMetadata.sources[source.key] = {
      name: source.label,
      panel: source.panel,
      sourceType: source.sourceType,
      url: source.url,
      enabled: source.enabled !== false,
      status: statusEntry.status,
      mode: statusEntry.mode,
      updatedAt: statusEntry.lastSuccess,
      itemCount: statusEntry.itemCount
    };

    collectedEvents.push(...currentEvents);

    const message = fetchError
      ? `${source.label}: ${statusEntry.status.toUpperCase()} (${statusEntry.errorMessage})`
      : `${source.label}: ${statusEntry.status.toUpperCase()} (${statusEntry.itemCount} items)`;
    console.log(message);
  }

  const dedupedEvents = dedupeEvents(collectedEvents)
    .sort((left, right) => Date.parse(right.published_at || "") - Date.parse(left.published_at || ""));
  const correlated = correlateEvents(dedupedEvents);
  const panels = buildPanelCollections(correlated.events, correlated.clusters);
  const groupStatuses = buildGroupStatuses(sourceStatuses);
  const sourceHealth = {
    groups: groupStatuses,
    sources: sourceStatuses
  };
  const notes = buildNotes(sourceStatuses);
  const dashboard = buildDashboardPayload({
    generatedAt,
    events: correlated.events,
    clusters: correlated.clusters,
    sourceHealth,
    sourceMetadata,
    notes
  });

  await writeJson(OUTPUT_PATHS.normalized.events, correlated.events);
  await writeJson(OUTPUT_PATHS.normalized.summary, dashboard.normalized);
  await writeJson(OUTPUT_PATHS.correlated.incidents, dashboard.correlated);
  await writeJson(OUTPUT_PATHS.correlated.map, dashboard.map);
  await writeJson(OUTPUT_PATHS.correlated.dashboard, dashboard);
  await writeJson(OUTPUT_PATHS.legacy.priority, buildLegacyPanelFeed(correlated.events, PANEL_KEYS.PRIORITY));
  await writeJson(OUTPUT_PATHS.legacy.intel, buildLegacyPanelFeed(correlated.events, PANEL_KEYS.INTEL));
  await writeJson(OUTPUT_PATHS.legacy.outages, buildLegacyPanelFeed(correlated.events, PANEL_KEYS.OUTAGES));
  await writeJson(OUTPUT_PATHS.legacy.clusters, dashboard.correlated.clusters);
  await writeJson(OUTPUT_PATHS.legacy.map, buildMapPayload(correlated.events, correlated.clusters, generatedAt));
  await writeJson(OUTPUT_PATHS.legacy.metadata, buildMetadataPayload(generatedAt, sourceMetadata, panels));
  await writeJson(OUTPUT_PATHS.legacy.health, buildHealthPayload(generatedAt, sourceHealth));
}

async function buildSampleArtifacts() {
  const generatedAt = new Date().toISOString();
  const sampleGroups = [
    {
      source: {
        key: "sample_priority",
        label: "Sample Priority Feed",
        panel: PANEL_KEYS.PRIORITY,
        category: "vulnerability",
        sourceType: "sample"
      },
      path: OUTPUT_PATHS.samples.priority
    },
    {
      source: {
        key: "sample_intel",
        label: "Sample Intel Feed",
        panel: PANEL_KEYS.INTEL,
        category: "news",
        sourceType: "sample"
      },
      path: OUTPUT_PATHS.samples.intel
    },
    {
      source: {
        key: "sample_outages",
        label: "Sample Outage Feed",
        panel: PANEL_KEYS.OUTAGES,
        category: "outage",
        sourceType: "sample"
      },
      path: OUTPUT_PATHS.samples.outages
    }
  ];

  const collected = [];
  const sources = {};
  const metadata = {
    generatedAt,
    sources: {}
  };

  for (const entry of sampleGroups) {
    const items = await readJsonIfExists(entry.path, []);
    const events = Array.isArray(items) ? items.map((item) => normalizeBootstrapItem(entry.source, item, generatedAt)) : [];
    collected.push(...events);
    sources[entry.source.key] = {
      name: entry.source.label,
      panel: entry.source.panel,
      sourceType: "sample",
      url: entry.path.replace(process.cwd(), "").replace(/\\/g, "/"),
      enabled: true,
      mode: "fallback",
      status: "ok",
      lastSuccess: events[0]?.published_at || generatedAt,
      lastFailure: null,
      itemCount: events.length,
      freshnessAgeMs: 0,
      failureCount: 0,
      errorMessage: "",
      fallbackUsed: true
    };
    metadata.sources[entry.source.key] = {
      name: entry.source.label,
      panel: entry.source.panel,
      sourceType: "sample",
      url: entry.path,
      enabled: true,
      status: "ok",
      mode: "fallback",
      updatedAt: events[0]?.published_at || generatedAt,
      itemCount: events.length
    };
  }

  const correlated = correlateEvents(dedupeEvents(collected));
  const sourceHealth = {
    groups: buildGroupStatuses(sources),
    sources
  };
  const dashboard = buildDashboardPayload({
    generatedAt,
    events: correlated.events,
    clusters: correlated.clusters,
    sourceHealth,
    sourceMetadata: metadata,
    notes: {
      methodology: "Sample dashboard bundle generated from committed fallback feeds.",
      unsupported_sources: []
    }
  });

  await writeJson(OUTPUT_PATHS.correlated.dashboardSample, dashboard);
  await writeJson(OUTPUT_PATHS.samples.map, buildMapPayload(correlated.events, correlated.clusters, generatedAt));
}

async function main() {
  const sampleOnly = process.argv.includes("--sample-only") || process.argv.includes("--offline");
  if (!sampleOnly) {
    await buildLiveArtifacts();
  }
  await buildSampleArtifacts();
  console.log(sampleOnly
    ? "Built CyberMonitor sample artifacts."
    : "Built CyberMonitor live + sample artifacts.");
}

main().catch((error) => {
  console.error(`build-data failed: ${error.message}`);
  process.exit(1);
});
