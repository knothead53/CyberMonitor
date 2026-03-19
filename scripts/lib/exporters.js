const { PANEL_DEFINITIONS } = require("./source-config");
const { severityWeight, unique } = require("./normalize");

function buildSearchBlob(item) {
  return [
    item.title,
    item.summary,
    item.source,
    item.vendor,
    item.product,
    ...(Array.isArray(item.cve_ids) ? item.cve_ids : []),
    ...(Array.isArray(item.related_cves) ? item.related_cves : []),
    ...(Array.isArray(item.related_sources) ? item.related_sources : []),
    item.actor,
    item.campaign,
    item.category
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortEventsForPanel(panelKey, items) {
  const copy = [...items];
  if (panelKey === "priority") {
    return copy.sort((left, right) => {
      const scoreDiff = severityWeight(right.severity) - severityWeight(left.severity);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return Date.parse(right.published_at || "") - Date.parse(left.published_at || "");
    });
  }
  return copy.sort((left, right) => Date.parse(right.published_at || "") - Date.parse(left.published_at || ""));
}

function toPanelEvent(event) {
  return {
    ...event,
    search_blob: buildSearchBlob(event)
  };
}

function toClusterCard(cluster) {
  return {
    ...cluster,
    title: cluster.primary_headline,
    summary: cluster.merged_summary,
    search_blob: buildSearchBlob(cluster)
  };
}

function buildPanelCollections(events, clusters) {
  const panels = {
    clusters: {
      ...PANEL_DEFINITIONS.clusters,
      item_count: clusters.filter((cluster) => cluster.event_count > 1).length,
      items: clusters
        .filter((cluster) => cluster.event_count > 1)
        .map((cluster) => toClusterCard(cluster))
        .slice(0, PANEL_DEFINITIONS.clusters.limit)
    }
  };

  Object.keys(PANEL_DEFINITIONS).forEach((panelKey) => {
    if (panelKey === "clusters") {
      return;
    }
    const definition = PANEL_DEFINITIONS[panelKey];
    const panelEvents = sortEventsForPanel(panelKey, events.filter((event) => event.panel === panelKey)).map((event) => toPanelEvent(event));
    panels[panelKey] = {
      ...definition,
      item_count: panelEvents.length,
      items: panelEvents.slice(0, definition.limit)
    };
  });

  return panels;
}

function buildMapPayload(events, clusters, generatedAt) {
  const recentIncidentWindowMs = 21 * 24 * 60 * 60 * 1000;
  const recentOutageWindowMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.parse(generatedAt);

  const incidents = events
    .filter((event) => event.category !== "outage" && now - Date.parse(event.published_at || generatedAt) <= recentIncidentWindowMs)
    .map((event) => ({
      id: event.id,
      layer: "incidents",
      title: event.title,
      summary: event.summary,
      severity: event.severity,
      source: event.source,
      source_count: event.source_count,
      related_cves: event.cve_ids,
      related_sources: event.related_sources,
      anchor_time: event.published_at,
      latitude: event.latitude,
      longitude: event.longitude,
      geo_precision: event.geo_precision,
      cluster_id: event.cluster_id,
      confidence: event.cluster_confidence || event.confidence,
      url: event.url,
      vendor: event.vendor,
      product: event.product,
      search_blob: buildSearchBlob(event)
    }));

  const correlatedClusters = clusters
    .filter((cluster) => cluster.event_count > 1)
    .map((cluster) => ({
      id: cluster.cluster_id,
      layer: "correlated_clusters",
      title: cluster.primary_headline,
      summary: cluster.merged_summary,
      severity: cluster.severity,
      source_count: cluster.source_count,
      event_count: cluster.event_count,
      related_cves: cluster.related_cves,
      related_sources: cluster.related_sources,
      anchor_time: cluster.last_seen,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      geo_precision: cluster.geo_precision,
      confidence: cluster.confidence,
      url: cluster.url,
      vendor: cluster.vendor,
      product: cluster.product,
      cluster_id: cluster.cluster_id,
      search_blob: buildSearchBlob(cluster)
    }));

  const outages = events
    .filter((event) => event.category === "outage" && now - Date.parse(event.published_at || generatedAt) <= recentOutageWindowMs)
    .map((event) => ({
      id: event.id,
      layer: "outages",
      title: event.title,
      summary: event.summary,
      severity: event.severity,
      source: event.source,
      source_count: event.source_count,
      related_cves: event.cve_ids,
      related_sources: event.related_sources,
      anchor_time: event.published_at,
      latitude: event.latitude,
      longitude: event.longitude,
      geo_precision: event.geo_precision,
      cluster_id: event.cluster_id,
      confidence: event.cluster_confidence || event.confidence,
      url: event.url,
      vendor: event.vendor,
      product: event.product,
      search_blob: buildSearchBlob(event)
    }));

  const kevLinkedIds = unique([
    ...events
      .filter((event) => event.source_key === "cisa_kev" || event.cve_ids.length > 0)
      .map((event) => event.id),
    ...clusters
      .filter((cluster) => cluster.is_kev_linked || cluster.related_cves.length > 0)
      .map((cluster) => cluster.cluster_id)
  ]);

  const kevClusterActivity = correlatedClusters.filter((point) => kevLinkedIds.includes(point.cluster_id))
    .map((point) => ({ ...point, layer: "kev_linked_activity" }));
  const kevIncidentActivity = incidents.filter((point) => kevLinkedIds.includes(point.id))
    .map((point) => ({ ...point, layer: "kev_linked_activity" }));
  const kevLinkedActivity = kevClusterActivity.length > 0 ? kevClusterActivity : kevIncidentActivity;

  const density = unique(
    [...incidents, ...correlatedClusters, ...outages]
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      .map((point) => `${point.latitude}|${point.longitude}|${severityWeight(point.severity)}`)
  ).map((value) => {
    const [lat, lon, weight] = value.split("|");
    return [Number.parseFloat(lat), Number.parseFloat(lon), Number.parseFloat(weight)];
  });

  const links = clusters
    .filter((cluster) => cluster.event_count > 1 && cluster.related_sources.length > 1)
    .slice(0, 40)
    .map((cluster) => ({
      id: `link-${cluster.cluster_id}`,
      cluster_id: cluster.cluster_id,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      severity: cluster.severity,
      anchor_time: cluster.last_seen
    }));

  return {
    generated_at: generatedAt,
    methodology: "Deterministic map overlay generated from normalized events and conservative correlation clusters. Location is approximate unless the source exposed a specific location.",
    layers: {
      incidents,
      correlated_clusters: correlatedClusters,
      outages,
      kev_linked_activity: kevLinkedActivity,
      density
    },
    links
  };
}

function buildNormalizedSummary(events) {
  const countsBySource = {};
  const countsByCategory = {};
  const countsByPanel = {};

  events.forEach((event) => {
    countsBySource[event.source] = (countsBySource[event.source] || 0) + 1;
    countsByCategory[event.category] = (countsByCategory[event.category] || 0) + 1;
    countsByPanel[event.panel] = (countsByPanel[event.panel] || 0) + 1;
  });

  return {
    total_events: events.length,
    counts_by_source: countsBySource,
    counts_by_category: countsByCategory,
    counts_by_panel: countsByPanel
  };
}

function buildModeSummary(sourceHealth) {
  const enabledSources = Object.values(sourceHealth.sources || {}).filter((entry) => entry.enabled !== false);
  const liveSources = enabledSources.filter((entry) => entry.mode === "live").length;
  const fallbackSources = enabledSources.filter((entry) => entry.mode === "fallback").length;
  if (enabledSources.length === 0) {
    return "sample";
  }
  if (liveSources === enabledSources.length) {
    return "live";
  }
  if (liveSources > 0 && fallbackSources > 0) {
    return "mixed";
  }
  if (fallbackSources === enabledSources.length) {
    return "fallback";
  }
  return "degraded";
}

function buildDashboardPayload({ generatedAt, events, clusters, sourceHealth, sourceMetadata, notes }) {
  const map = buildMapPayload(events, clusters, generatedAt);
  const panels = buildPanelCollections(events, clusters);
  const normalized = buildNormalizedSummary(events);
  const highSeverity = events.filter((event) => ["HIGH", "CRITICAL"].includes(event.severity)).length;
  const degradedSources = Object.values(sourceHealth.sources || {}).filter((entry) => ["degraded", "stale", "error"].includes(entry.status)).length;
  const fallbackSources = Object.values(sourceHealth.sources || {}).filter((entry) => entry.mode === "fallback").length;

  return {
    generated_at: generatedAt,
    data_mode: buildModeSummary(sourceHealth),
    summary: {
      total_events: normalized.total_events,
      total_clusters: clusters.filter((cluster) => cluster.event_count > 1).length,
      high_severity_events: highSeverity,
      degraded_sources: degradedSources,
      fallback_sources: fallbackSources,
      source_count: Object.keys(sourceHealth.sources || {}).length
    },
    panels,
    map,
    source_health: sourceHealth,
    source_metadata: sourceMetadata,
    normalized: {
      ...normalized,
      events: events.map((event) => ({
        ...event,
        search_blob: buildSearchBlob(event)
      }))
    },
    correlated: {
      clusters: clusters.map((cluster) => ({
        ...cluster,
        search_blob: buildSearchBlob(cluster)
      }))
    },
    notes
  };
}

function buildLegacyPanelFeed(events, panelKey) {
  return sortEventsForPanel(panelKey, events.filter((event) => event.panel === panelKey)).map((event) => ({
    id: event.id,
    title: event.title,
    source: event.source,
    source_type: event.source_type,
    published: event.published_at,
    url: event.url,
    summary: event.summary,
    severity: event.severity,
    vendor: event.vendor,
    product: event.product,
    cve_ids: event.cve_ids,
    tags: event.tags,
    cluster_id: event.cluster_id,
    correlation_confidence: event.cluster_confidence,
    related_sources: event.related_sources,
    related_event_ids: event.related_event_ids
  }));
}

function determineOverallStatus(sourceEntries) {
  const statuses = Object.values(sourceEntries || {}).filter((entry) => entry.enabled !== false).map((entry) => entry.status);
  if (statuses.includes("error")) {
    return "error";
  }
  if (statuses.includes("degraded")) {
    return "degraded";
  }
  if (statuses.includes("stale")) {
    return "stale";
  }
  return "ok";
}

function buildMetadataPayload(generatedAt, sourceMetadata, panels) {
  return {
    generatedAt: generatedAt,
    outputVersion: "2.0",
    panels: Object.fromEntries(Object.entries(panels).map(([key, panel]) => [
      key,
      {
        title: panel.title,
        itemCount: panel.item_count
      }
    ])),
    sources: sourceMetadata.sources,
    directories: {
      raw: "data/raw",
      normalized: "data/normalized",
      correlated: "data/correlated"
    }
  };
}

function buildHealthPayload(generatedAt, sourceHealth) {
  return {
    generatedAt: generatedAt,
    overallStatus: determineOverallStatus(sourceHealth.sources),
    groups: sourceHealth.groups,
    sources: sourceHealth.sources
  };
}

module.exports = {
  buildDashboardPayload,
  buildHealthPayload,
  buildLegacyPanelFeed,
  buildMapPayload,
  buildMetadataPayload,
  buildModeSummary,
  buildPanelCollections
};
