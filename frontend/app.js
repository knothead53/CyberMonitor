(() => {
  const FEED_LIMIT = 10;
  const MAP_OVERLAY_PATH = "../data/map.overlays.sample.json";
  const METRICS_PATH = "../data/metrics.sample.json";
  const MAP_OVERLAY_KEYS = ["cloud_regions", "major_incidents", "internet_outages"];
  const MAP_LAYER_BINDINGS = {
    news: "cloud_regions",
    kev: "major_incidents",
    outages: "internet_outages"
  };
  const DEFAULT_MAP_OVERLAYS = {
    cloud_regions: [
      {
        id: "cloud-us-east",
        name: "US-East Cloud Region",
        lat: 37.7749,
        lon: -122.4194,
        type: "cloud_region",
        severity: "MED",
        timestamp: "2026-03-05T12:01:00Z",
        summary: "Elevated auth probe traffic observed against identity services."
      },
      {
        id: "cloud-eu-west",
        name: "EU-West Cloud Region",
        lat: 53.3498,
        lon: -6.2603,
        type: "cloud_region",
        severity: "LOW",
        timestamp: "2026-03-05T11:11:00Z",
        summary: "Normal operations with periodic scanning noise."
      }
    ],
    major_incidents: [
      {
        id: "inc-na-ransom",
        name: "North America Ransomware Cluster",
        lat: 41.8781,
        lon: -87.6298,
        type: "incident",
        severity: "CRITICAL",
        timestamp: "2026-03-05T12:07:00Z",
        summary: "Coordinated exploitation of edge appliance vulnerabilities."
      },
      {
        id: "inc-apac-botnet",
        name: "APAC Botnet Expansion",
        lat: 1.3521,
        lon: 103.8198,
        type: "incident",
        severity: "HIGH",
        timestamp: "2026-03-05T09:22:00Z",
        summary: "Rapid growth in compromised IoT relay infrastructure."
      }
    ],
    internet_outages: [
      {
        id: "out-eu-dns",
        name: "Europe DNS Route Instability",
        lat: 50.1109,
        lon: 8.6821,
        type: "outage",
        severity: "HIGH",
        timestamp: "2026-03-05T10:44:00Z",
        summary: "Intermittent packet loss impacting managed DNS resolution."
      },
      {
        id: "out-us-sso",
        name: "US SSO Token Delay",
        lat: 39.9526,
        lon: -75.1652,
        type: "outage",
        severity: "MED",
        timestamp: "2026-03-05T11:59:00Z",
        summary: "SSO token issuance delays across identity clusters."
      }
    ]
  };
  const DEFAULT_METRICS_HISTORY = {
    throughput_history: [132, 141, 156, 149, 161, 178, 184, 192, 201, 214, 209, 223],
    high_sev_history: [3, 4, 4, 5, 6, 5, 7, 8, 8, 9, 10, 9],
    campaigns_history: [2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 8, 8]
  };

  const FEEDS = {
    kev: {
      path: "../data/kev.sample.json",
      listId: "kev-list",
      countId: "kev-count"
    },
    news: {
      path: "../data/news.sample.json",
      listId: "news-list",
      countId: "news-count"
    },
    outages: {
      path: "../data/outages.sample.json",
      listId: "outages-list",
      countId: "outages-count"
    }
  };

  const FILTER_DEFAULTS = {
    severity: "all",
    time: "all",
    source: "all"
  };

  const elements = {
    updated: document.getElementById("last-updated"),
    refresh: document.getElementById("refresh-btn"),
    layerInputs: Array.from(document.querySelectorAll('#layer-form input[name="layer"]')),
    map: document.getElementById("global-map"),
    metricValues: {
      throughput: document.getElementById("metric-throughput-value"),
      highSeverity: document.getElementById("metric-high-severity-value"),
      campaigns: document.getElementById("metric-campaigns-value")
    },
    metricSparklines: {
      throughput: document.getElementById("metric-throughput-sparkline"),
      highSeverity: document.getElementById("metric-high-severity-sparkline"),
      campaigns: document.getElementById("metric-campaigns-sparkline")
    },
    filterSelects: Object.keys(FEEDS).reduce((acc, key) => {
      acc[key] = {
        severity: document.getElementById(`${key}-filter-severity`),
        time: document.getElementById(`${key}-filter-time`),
        source: document.getElementById(`${key}-filter-source`)
      };
      return acc;
    }, {})
  };

  let mapInstance = null;
  let mapOverlayGroups = null;
  let mapOverlayState = {
    cloud_regions: [],
    major_incidents: [],
    internet_outages: []
  };
  const feedState = Object.keys(FEEDS).reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
  const panelFilters = Object.keys(FEEDS).reduce((acc, key) => {
    acc[key] = { ...FILTER_DEFAULTS };
    return acc;
  }, {});

  function selectFeedElements(feedKey) {
    const config = FEEDS[feedKey];
    return {
      list: document.getElementById(config.listId),
      count: document.getElementById(config.countId),
      panel: document.querySelector(`.feed-panel[data-panel="${feedKey}"]`)
    };
  }

  function toDisplayTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function normalizeSeverity(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "critical") {
      return "critical";
    }
    if (normalized === "high") {
      return "high";
    }
    if (normalized === "low") {
      return "low";
    }
    if (normalized === "med") {
      return "medium";
    }
    return "medium";
  }

  function parseTimeWindow(value) {
    if (value === "1h") {
      return 60 * 60 * 1000;
    }
    if (value === "6h") {
      return 6 * 60 * 60 * 1000;
    }
    if (value === "24h") {
      return 24 * 60 * 60 * 1000;
    }
    if (value === "7d") {
      return 7 * 24 * 60 * 60 * 1000;
    }
    return null;
  }

  function getSourceLabel(item) {
    return String(item?.source || "Unknown source");
  }

  function applyFilters(items, filters) {
    const severityFilter = filters?.severity || "all";
    const sourceFilter = filters?.source || "all";
    const windowMs = parseTimeWindow(filters?.time || "all");
    const cutoff = windowMs === null ? null : Date.now() - windowMs;

    const filtered = normalizeItems(items).filter((item) => {
      const severity = normalizeSeverity(item?.severity);
      const source = getSourceLabel(item);

      if (severityFilter !== "all" && severity !== severityFilter) {
        return false;
      }

      if (sourceFilter !== "all" && source !== sourceFilter) {
        return false;
      }

      if (cutoff !== null) {
        const published = Date.parse(item?.published || item?.timestamp || "");
        if (Number.isNaN(published) || published < cutoff) {
          return false;
        }
      }

      return true;
    });

    return sortByNewest(filtered);
  }

  function normalizeItems(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue;
    }
    if (rawValue && Array.isArray(rawValue.items)) {
      return rawValue.items;
    }
    return [];
  }

  function sortByNewest(items, dateField = "published") {
    return [...items].sort((a, b) => {
      const aTime = Date.parse(a[dateField] || "");
      const bTime = Date.parse(b[dateField] || "");
      return bTime - aTime;
    });
  }

  function renderState(listElement, message, stateClass = "state-item") {
    listElement.innerHTML = "";
    const item = document.createElement("li");
    item.className = stateClass;
    item.textContent = message;
    listElement.appendChild(item);
  }

  function createTag(text, className = "") {
    const tag = document.createElement("span");
    tag.className = `item-tag ${className}`.trim();
    tag.textContent = text;
    return tag;
  }

  function renderItems(feedKey, items) {
    const { list, count } = selectFeedElements(feedKey);
    const filteredItems = applyFilters(items, panelFilters[feedKey]);
    const limited = filteredItems.slice(0, FEED_LIMIT);

    count.textContent = String(filteredItems.length);
    list.innerHTML = "";

    if (limited.length === 0) {
      const message = normalizeItems(items).length > 0 ? "No items match current filters." : "No feed items available.";
      renderState(list, message);
      return;
    }

    limited.forEach((entry, index) => {
      const row = document.createElement("li");
      row.className = "feed-item";

      const link = document.createElement("a");
      link.className = "feed-link";
      link.href = entry.url || "#";
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = entry.title || "Untitled event";

      const meta = document.createElement("p");
      meta.className = "item-meta";
      meta.textContent = `${getSourceLabel(entry)} | ${toDisplayTime(entry.published)}`;

      const summary = document.createElement("p");
      summary.className = "item-summary";
      summary.textContent = entry.summary || "No summary provided.";

      const tagWrap = document.createElement("div");
      tagWrap.className = "item-tags";

      if (index === 0) {
        tagWrap.appendChild(createTag("newest"));
      }

      const severity = normalizeSeverity(entry.severity);
      tagWrap.appendChild(createTag(severity.toUpperCase(), `severity-${severity}`));

      if (entry.vendor) {
        tagWrap.appendChild(createTag(entry.vendor));
      }

      row.appendChild(link);
      row.appendChild(meta);
      row.appendChild(summary);
      if (tagWrap.childElementCount > 0) {
        row.appendChild(tagWrap);
      }

      list.appendChild(row);
    });
  }

  function populateSourceFilter(feedKey, items) {
    const sourceSelect = elements.filterSelects?.[feedKey]?.source;
    if (!sourceSelect) {
      return;
    }

    const availableSources = Array.from(
      new Set(normalizeItems(items).map((item) => getSourceLabel(item)))
    ).sort((a, b) => a.localeCompare(b));

    const selected = panelFilters[feedKey].source;
    sourceSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All";
    sourceSelect.appendChild(allOption);

    availableSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      sourceSelect.appendChild(option);
    });

    if (selected !== "all" && availableSources.includes(selected)) {
      sourceSelect.value = selected;
      return;
    }

    panelFilters[feedKey].source = "all";
    sourceSelect.value = "all";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeMapPoint(entry, fallbackType) {
    const lat = Number(entry?.lat);
    const lon = Number(entry?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      id: entry.id || `${fallbackType}-${lat}-${lon}`,
      name: entry.name || "Unnamed signal",
      lat,
      lon,
      type: entry.type || fallbackType,
      severity: normalizeSeverity(entry.severity),
      timestamp: entry.timestamp || new Date().toISOString(),
      summary: entry.summary || "No summary provided."
    };
  }

  function normalizeMapOverlays(rawValue) {
    const payload = rawValue && typeof rawValue === "object" ? rawValue : {};
    const normalized = {};

    MAP_OVERLAY_KEYS.forEach((key) => {
      const fallbackType = key === "cloud_regions" ? "cloud_region" : key === "major_incidents" ? "incident" : "outage";
      const rows = Array.isArray(payload[key]) ? payload[key] : [];
      normalized[key] = rows
        .map((row) => normalizeMapPoint(row, fallbackType))
        .filter(Boolean);
    });

    return normalized;
  }

  function normalizeMetricHistory(rawValue) {
    const payload = rawValue && typeof rawValue === "object" ? rawValue : {};
    const toSeries = (key) => {
      const values = Array.isArray(payload[key]) ? payload[key] : [];
      return values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    };

    return {
      throughput_history: toSeries("throughput_history"),
      high_sev_history: toSeries("high_sev_history"),
      campaigns_history: toSeries("campaigns_history")
    };
  }

  function getLocalMetricsFallback() {
    const fallbackMetrics = window.CYBERMONITOR_FALLBACK_METRICS;
    if (fallbackMetrics && typeof fallbackMetrics === "object") {
      return normalizeMetricHistory(fallbackMetrics);
    }
    return normalizeMetricHistory(DEFAULT_METRICS_HISTORY);
  }

  async function fetchMetricsHistory() {
    try {
      const response = await fetch(METRICS_PATH, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const json = await response.json();
      return {
        history: normalizeMetricHistory(json),
        usedFallback: false
      };
    } catch (error) {
      if (window.location.protocol === "file:") {
        return {
          history: getLocalMetricsFallback(),
          usedFallback: true
        };
      }

      return {
        history: normalizeMetricHistory(DEFAULT_METRICS_HISTORY),
        usedFallback: true
      };
    }
  }

  function flattenFeedItems() {
    return Object.keys(feedState).flatMap((feedKey) => normalizeItems(feedState[feedKey]));
  }

  function deriveSignalThroughput(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }

    const timestamps = items
      .map((item) => Date.parse(item?.published || ""))
      .filter((time) => Number.isFinite(time));

    if (timestamps.length === 0) {
      return items.length;
    }

    const newest = Math.max(...timestamps);
    const oldest = Math.min(...timestamps);
    const durationHours = Math.max((newest - oldest) / (60 * 60 * 1000), 1);

    return Math.max(Math.round(items.length / durationHours), 0);
  }

  function deriveHighSeverityFlags(items) {
    return normalizeItems(items).reduce((count, item) => {
      const severity = normalizeSeverity(item?.severity);
      return severity === "high" || severity === "critical" ? count + 1 : count;
    }, 0);
  }

  function deriveKnownCampaigns(items, overlays) {
    const keywordSet = new Set();
    const vendorSet = new Set();
    const keywords = ["ransomware", "campaign", "botnet", "phishing", "loader", "exploit", "malvertising"];

    normalizeItems(items).forEach((item) => {
      const summary = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
      keywords.forEach((keyword) => {
        if (summary.includes(keyword)) {
          keywordSet.add(keyword);
        }
      });

      if (item?.vendor) {
        vendorSet.add(String(item.vendor).toLowerCase());
      }
    });

    const incidentBoost = normalizeItems(overlays?.major_incidents).filter((point) => {
      const severity = normalizeSeverity(point?.severity);
      return severity === "high" || severity === "critical";
    }).length;

    return Math.max(keywordSet.size + Math.min(vendorSet.size, 5) + incidentBoost, 0);
  }

  function renderSparkline(container, values) {
    if (!container) {
      return;
    }

    const points = normalizeItems(values)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(-18);

    container.innerHTML = "";

    if (points.length === 0) {
      return;
    }

    const max = Math.max(...points, 1);
    points.forEach((point) => {
      const bar = document.createElement("span");
      bar.className = "sparkline-bar";
      bar.style.height = `${Math.max(10, Math.round((point / max) * 100))}%`;
      container.appendChild(bar);
    });
  }

  function renderMetricsWidgets(history) {
    const allItems = flattenFeedItems();
    const throughput = deriveSignalThroughput(allItems);
    const highSeverityFlags = deriveHighSeverityFlags(allItems);
    const knownCampaigns = deriveKnownCampaigns(allItems, mapOverlayState);

    if (elements.metricValues.throughput) {
      elements.metricValues.throughput.textContent = `+${throughput}/hr`;
    }
    if (elements.metricValues.highSeverity) {
      elements.metricValues.highSeverity.textContent = String(highSeverityFlags).padStart(2, "0");
    }
    if (elements.metricValues.campaigns) {
      elements.metricValues.campaigns.textContent = String(knownCampaigns);
    }

    renderSparkline(elements.metricSparklines.throughput, history?.throughput_history);
    renderSparkline(elements.metricSparklines.highSeverity, history?.high_sev_history);
    renderSparkline(elements.metricSparklines.campaigns, history?.campaigns_history);
  }

  function getLocalFallback(feedKey) {
    const fallbackFeeds = window.CYBERMONITOR_FALLBACK_FEEDS;
    if (!fallbackFeeds || !Array.isArray(fallbackFeeds[feedKey])) {
      return null;
    }
    return fallbackFeeds[feedKey];
  }

  function getLocalOverlayFallback() {
    const fallbackOverlays = window.CYBERMONITOR_FALLBACK_MAP_OVERLAYS;
    if (fallbackOverlays && typeof fallbackOverlays === "object") {
      return normalizeMapOverlays(fallbackOverlays);
    }
    return normalizeMapOverlays(DEFAULT_MAP_OVERLAYS);
  }

  async function fetchFeed(feedKey) {
    const { path } = FEEDS[feedKey];

    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const json = await response.json();
      return {
        items: normalizeItems(json),
        usedFallback: false
      };
    } catch (error) {
      const isLocalFile = window.location.protocol === "file:";
      const fallbackItems = getLocalFallback(feedKey);

      if (isLocalFile && fallbackItems) {
        return {
          items: normalizeItems(fallbackItems),
          usedFallback: true
        };
      }

      throw error;
    }
  }

  async function fetchMapOverlays() {
    try {
      const response = await fetch(MAP_OVERLAY_PATH, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const json = await response.json();
      return {
        overlays: normalizeMapOverlays(json),
        usedFallback: false
      };
    } catch (error) {
      if (window.location.protocol === "file:") {
        return {
          overlays: getLocalOverlayFallback(),
          usedFallback: true
        };
      }

      throw error;
    }
  }

  function updateLastUpdated(usedFallback) {
    if (!elements.updated) {
      return;
    }

    const prefix = `Last updated: ${toDisplayTime(new Date().toISOString())}`;
    elements.updated.textContent = usedFallback ? `${prefix} (local sample mode)` : prefix;
  }

  function setRefreshState(isRefreshing) {
    if (!elements.refresh) {
      return;
    }

    elements.refresh.disabled = isRefreshing;
    elements.refresh.textContent = isRefreshing ? "Refreshing..." : "Refresh";
  }

  async function loadPanel(feedKey) {
    const { list, count } = selectFeedElements(feedKey);
    count.textContent = "0";
    renderState(list, "Loading feed...");

    try {
      const result = await fetchFeed(feedKey);
      feedState[feedKey] = normalizeItems(result.items);
      populateSourceFilter(feedKey, feedState[feedKey]);
      renderItems(feedKey, feedState[feedKey]);
      return {
        success: true,
        usedFallback: result.usedFallback
      };
    } catch (_error) {
      feedState[feedKey] = [];
      populateSourceFilter(feedKey, []);
      renderState(list, "Error loading data. Try Refresh.");
      return {
        success: false,
        usedFallback: false
      };
    }
  }

  function buildOverlayIcon(point) {
    const className = `map-overlay-marker severity-${point.severity} type-${point.type}`;
    return window.L.divIcon({
      className,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }

  function renderMapOverlays(overlays) {
    if (!mapOverlayGroups) {
      return;
    }

    MAP_OVERLAY_KEYS.forEach((key) => {
      mapOverlayGroups[key].clearLayers();
      overlays[key].forEach((point) => {
        const marker = window.L.marker([point.lat, point.lon], {
          icon: buildOverlayIcon(point),
          title: point.name
        });

        marker.bindPopup(
          `<strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.summary)}<br><small>${escapeHtml(toDisplayTime(point.timestamp))}</small>`
        );

        marker.addTo(mapOverlayGroups[key]);
      });
    });

    applyLayerVisibility();
  }

  async function loadMapOverlays() {
    if (!mapOverlayGroups) {
      return {
        success: false,
        usedFallback: false
      };
    }

    try {
      const result = await fetchMapOverlays();
      mapOverlayState = result.overlays;
      renderMapOverlays(result.overlays);
      return {
        success: true,
        usedFallback: result.usedFallback
      };
    } catch (_error) {
      mapOverlayState = {
        cloud_regions: [],
        major_incidents: [],
        internet_outages: []
      };
      MAP_OVERLAY_KEYS.forEach((key) => {
        mapOverlayGroups[key].clearLayers();
      });
      return {
        success: false,
        usedFallback: false
      };
    }
  }

  function setMapOverlayVisibility(layerKey, isVisible) {
    if (!mapInstance || !mapOverlayGroups) {
      return;
    }

    const overlayKey = MAP_LAYER_BINDINGS[layerKey];
    const overlayLayer = mapOverlayGroups[overlayKey];
    if (!overlayLayer) {
      return;
    }

    if (isVisible) {
      if (!mapInstance.hasLayer(overlayLayer)) {
        overlayLayer.addTo(mapInstance);
      }
      return;
    }

    if (mapInstance.hasLayer(overlayLayer)) {
      mapInstance.removeLayer(overlayLayer);
    }
  }

  function applyLayerVisibility() {
    elements.layerInputs.forEach((input) => {
      const { panel } = selectFeedElements(input.value);
      if (!panel) {
        return;
      }
      panel.classList.toggle("panel-hidden", !input.checked);
      setMapOverlayVisibility(input.value, input.checked);
    });
  }

  function setupLayerFilters() {
    applyLayerVisibility();
    elements.layerInputs.forEach((input) => {
      input.addEventListener("change", applyLayerVisibility);
    });
  }

  function setupPanelFilters() {
    Object.keys(FEEDS).forEach((feedKey) => {
      const controls = elements.filterSelects[feedKey];
      if (!controls || !controls.severity || !controls.time || !controls.source) {
        return;
      }

      controls.severity.value = panelFilters[feedKey].severity;
      controls.time.value = panelFilters[feedKey].time;
      controls.source.value = panelFilters[feedKey].source;

      controls.severity.addEventListener("change", (event) => {
        panelFilters[feedKey].severity = event.target.value || "all";
        renderItems(feedKey, feedState[feedKey]);
      });

      controls.time.addEventListener("change", (event) => {
        panelFilters[feedKey].time = event.target.value || "all";
        renderItems(feedKey, feedState[feedKey]);
      });

      controls.source.addEventListener("change", (event) => {
        panelFilters[feedKey].source = event.target.value || "all";
        renderItems(feedKey, feedState[feedKey]);
      });
    });
  }

  async function loadAllPanels() {
    setRefreshState(true);

    try {
      const keys = Object.keys(FEEDS);
      const [panelResults, overlayResult, metricsResult] = await Promise.all([
        Promise.all(keys.map((feedKey) => loadPanel(feedKey))),
        loadMapOverlays(),
        fetchMetricsHistory()
      ]);
      const successful = panelResults.filter((result) => result.success);
      renderMetricsWidgets(metricsResult.history);

      const hasMetricPayload =
        metricsResult.history.throughput_history.length > 0 ||
        metricsResult.history.high_sev_history.length > 0 ||
        metricsResult.history.campaigns_history.length > 0;

      if (successful.length > 0 || overlayResult.success || hasMetricPayload) {
        const fallbackInUse =
          successful.some((result) => result.usedFallback) ||
          overlayResult.usedFallback ||
          metricsResult.usedFallback;
        updateLastUpdated(fallbackInUse);
      }
    } finally {
      setRefreshState(false);
    }
  }

  function setupRefreshButton() {
    if (!elements.refresh) {
      return;
    }

    elements.refresh.addEventListener("click", () => {
      loadAllPanels();
    });
  }

  function initMap() {
    if (!elements.map || mapInstance || typeof window.L === "undefined") {
      return;
    }

    mapInstance = window.L.map(elements.map, {
      center: [22, 8],
      zoom: 2,
      minZoom: 2,
      maxZoom: 6,
      zoomControl: true,
      worldCopyJump: true
    });

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(mapInstance);

    mapOverlayGroups = {
      cloud_regions: window.L.layerGroup().addTo(mapInstance),
      major_incidents: window.L.layerGroup().addTo(mapInstance),
      internet_outages: window.L.layerGroup().addTo(mapInstance)
    };

    window.addEventListener("resize", () => {
      mapInstance.invalidateSize();
    });

    window.requestAnimationFrame(() => {
      mapInstance.invalidateSize();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setupLayerFilters();
    setupPanelFilters();
    setupRefreshButton();
    loadAllPanels();
  });
})();
