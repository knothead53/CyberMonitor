import { DASHBOARD_PATHS, PANEL_ORDER } from "./config.js";
import { maxSeverity, normalizeSeverity, normalizeText } from "./utils.js";

const FALLBACK_GEO = {
  Microsoft: [47.6426, -122.1366],
  Google: [37.422, -122.0841],
  Cloudflare: [37.7749, -122.4194],
  GitHub: [37.7825, -122.393],
  OpenAI: [37.7749, -122.4194],
  Slack: [37.7749, -122.4194],
  Discord: [37.7749, -122.4194],
  Atlassian: [-33.8688, 151.2093],
  Fortinet: [37.3875, -121.9636],
  VMware: [37.4043, -122.0719]
};

async function fetchJson(path, bustCache = false) {
  const url = bustCache ? `${path}?t=${Date.now()}` : path;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  return response.json();
}

function ensurePanelShape(key, panel) {
  return {
    key,
    title: panel?.title || key,
    description: panel?.description || "",
    item_count: Number(panel?.item_count || 0),
    items: Array.isArray(panel?.items) ? panel.items : []
  };
}

function inferLayerPoint(item, layer) {
  const vendor = normalizeText(item.vendor);
  const [latitude, longitude] = FALLBACK_GEO[vendor] || [18, 0];
  return {
    id: item.id,
    layer,
    title: item.title,
    summary: item.summary,
    severity: normalizeSeverity(item.severity),
    source: item.source,
    source_count: Number(item.source_count || item.related_sources?.length || 1),
    related_cves: Array.isArray(item.cve_ids) ? item.cve_ids : [],
    related_sources: Array.isArray(item.related_sources) ? item.related_sources : [],
    anchor_time: item.published_at || item.published,
    latitude,
    longitude,
    geo_precision: "fallback",
    cluster_id: item.cluster_id || "",
    confidence: Number(item.cluster_confidence || item.confidence || 0.55),
    url: item.url,
    vendor: item.vendor,
    product: item.product,
    search_blob: item.search_blob || ""
  };
}

function buildFallbackDashboard() {
  const feeds = window.CYBERMONITOR_FALLBACK_FEEDS || {};
  const priorityItems = Array.isArray(feeds.kev) ? feeds.kev.map((item) => ({
    ...item,
    published_at: item.published,
    category: "vulnerability",
    panel: "priority",
    source_type: "sample",
    cve_ids: Array.isArray(item.cve_ids) ? item.cve_ids : item.cve ? [item.cve] : [],
    related_sources: [],
    related_event_ids: [],
    source_count: 1
  })) : [];
  const intelItems = Array.isArray(feeds.news) ? feeds.news.map((item) => ({
    ...item,
    published_at: item.published,
    category: "news",
    panel: "intel",
    source_type: "sample",
    cve_ids: Array.isArray(item.cve_ids) ? item.cve_ids : [],
    related_sources: [],
    related_event_ids: [],
    source_count: 1
  })) : [];
  const outageItems = Array.isArray(feeds.outages) ? feeds.outages.map((item) => ({
    ...item,
    published_at: item.published,
    category: "outage",
    panel: "outages",
    source_type: "sample",
    cve_ids: Array.isArray(item.cve_ids) ? item.cve_ids : [],
    related_sources: [],
    related_event_ids: [],
    source_count: 1
  })) : [];

  const all = [...priorityItems, ...intelItems, ...outageItems];
  const generatedAt = new Date().toISOString();

  return {
    generated_at: generatedAt,
    data_mode: "sample",
    summary: {
      total_events: all.length,
      total_clusters: 0,
      high_severity_events: all.filter((item) => ["HIGH", "CRITICAL"].includes(normalizeSeverity(item.severity))).length,
      degraded_sources: 0,
      fallback_sources: 3,
      source_count: 3
    },
    panels: {
      clusters: ensurePanelShape("clusters", {
        title: "Correlated Incidents",
        description: "Sample fallback mode",
        item_count: 0,
        items: []
      }),
      priority: ensurePanelShape("priority", {
        title: "Priority Vulnerabilities",
        description: "Sample fallback mode",
        item_count: priorityItems.length,
        items: priorityItems
      }),
      intel: ensurePanelShape("intel", {
        title: "Intel & Advisories",
        description: "Sample fallback mode",
        item_count: intelItems.length,
        items: intelItems
      }),
      outages: ensurePanelShape("outages", {
        title: "Service Disruptions",
        description: "Sample fallback mode",
        item_count: outageItems.length,
        items: outageItems
      })
    },
    map: {
      generated_at: generatedAt,
      methodology: "Browser-side fallback generated from bundled sample feeds.",
      layers: {
        incidents: [...priorityItems, ...intelItems].map((item) => inferLayerPoint(item, "incidents")),
        correlated_clusters: [],
        outages: outageItems.map((item) => inferLayerPoint(item, "outages")),
        kev_linked_activity: priorityItems.map((item) => inferLayerPoint(item, "kev_linked_activity")),
        density: all.map((item) => {
          const point = inferLayerPoint(item, item.panel === "outages" ? "outages" : "incidents");
          const weight = maxSeverity([point.severity]) === "CRITICAL" ? 4 : 2;
          return [point.latitude, point.longitude, weight];
        })
      },
      links: []
    },
    source_health: {
      groups: {
        priority: { name: "Priority Vulnerabilities", status: "ok", sourceCount: 1, itemCount: priorityItems.length },
        intel: { name: "Intel & Advisories", status: "ok", sourceCount: 1, itemCount: intelItems.length },
        outages: { name: "Service Disruptions", status: "ok", sourceCount: 1, itemCount: outageItems.length }
      },
      sources: {
        sample_priority: {
          name: "Sample Priority Feed",
          panel: "priority",
          sourceType: "sample",
          enabled: true,
          mode: "fallback",
          status: "ok",
          lastSuccess: generatedAt,
          lastFailure: null,
          itemCount: priorityItems.length,
          freshnessAgeMs: 0,
          failureCount: 0,
          errorMessage: "",
          fallbackUsed: true
        },
        sample_intel: {
          name: "Sample Intel Feed",
          panel: "intel",
          sourceType: "sample",
          enabled: true,
          mode: "fallback",
          status: "ok",
          lastSuccess: generatedAt,
          lastFailure: null,
          itemCount: intelItems.length,
          freshnessAgeMs: 0,
          failureCount: 0,
          errorMessage: "",
          fallbackUsed: true
        },
        sample_outages: {
          name: "Sample Outage Feed",
          panel: "outages",
          sourceType: "sample",
          enabled: true,
          mode: "fallback",
          status: "ok",
          lastSuccess: generatedAt,
          lastFailure: null,
          itemCount: outageItems.length,
          freshnessAgeMs: 0,
          failureCount: 0,
          errorMessage: "",
          fallbackUsed: true
        }
      }
    },
    source_metadata: { generatedAt, sources: {} },
    normalized: {
      total_events: all.length,
      counts_by_source: {},
      counts_by_category: {},
      counts_by_panel: {},
      events: all
    },
    correlated: {
      clusters: []
    },
    notes: {
      methodology: "Bundled sample fallback mode.",
      unsupported_sources: []
    }
  };
}

export async function loadDashboard({ bustCache = false } = {}) {
  for (const entry of DASHBOARD_PATHS) {
    try {
      const payload = await fetchJson(entry.path, bustCache);
      return normalizeDashboard(payload, entry.mode);
    } catch (_error) {
      // Continue to next fallback source.
    }
  }
  return normalizeDashboard(buildFallbackDashboard(), "sample");
}

export function normalizeDashboard(payload, fallbackMode = "sample") {
  const dashboard = payload && typeof payload === "object" ? payload : {};
  const panels = {};

  PANEL_ORDER.forEach((key) => {
    panels[key] = ensurePanelShape(key, dashboard.panels?.[key]);
  });

  return {
    generated_at: dashboard.generated_at || new Date().toISOString(),
    data_mode: dashboard.data_mode || fallbackMode,
    summary: {
      total_events: Number(dashboard.summary?.total_events || 0),
      total_clusters: Number(dashboard.summary?.total_clusters || 0),
      high_severity_events: Number(dashboard.summary?.high_severity_events || 0),
      degraded_sources: Number(dashboard.summary?.degraded_sources || 0),
      fallback_sources: Number(dashboard.summary?.fallback_sources || 0),
      source_count: Number(dashboard.summary?.source_count || 0)
    },
    panels,
    map: {
      generated_at: dashboard.map?.generated_at || dashboard.generated_at || new Date().toISOString(),
      methodology: dashboard.map?.methodology || "",
      layers: {
        incidents: Array.isArray(dashboard.map?.layers?.incidents) ? dashboard.map.layers.incidents : [],
        correlated_clusters: Array.isArray(dashboard.map?.layers?.correlated_clusters) ? dashboard.map.layers.correlated_clusters : [],
        outages: Array.isArray(dashboard.map?.layers?.outages) ? dashboard.map.layers.outages : [],
        kev_linked_activity: Array.isArray(dashboard.map?.layers?.kev_linked_activity) ? dashboard.map.layers.kev_linked_activity : [],
        density: Array.isArray(dashboard.map?.layers?.density) ? dashboard.map.layers.density : []
      },
      links: Array.isArray(dashboard.map?.links) ? dashboard.map.links : []
    },
    source_health: {
      groups: dashboard.source_health?.groups || {},
      sources: dashboard.source_health?.sources || {}
    },
    source_metadata: dashboard.source_metadata || { generatedAt: dashboard.generated_at || new Date().toISOString(), sources: {} },
    normalized: {
      total_events: Number(dashboard.normalized?.total_events || dashboard.summary?.total_events || 0),
      counts_by_source: dashboard.normalized?.counts_by_source || {},
      counts_by_category: dashboard.normalized?.counts_by_category || {},
      counts_by_panel: dashboard.normalized?.counts_by_panel || {},
      events: Array.isArray(dashboard.normalized?.events) ? dashboard.normalized.events : []
    },
    correlated: {
      clusters: Array.isArray(dashboard.correlated?.clusters) ? dashboard.correlated.clusters : []
    },
    notes: dashboard.notes || {}
  };
}
