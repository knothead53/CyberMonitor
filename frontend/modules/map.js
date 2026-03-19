import { escapeHtml, normalizeSeverity, severityRank, toDisplayTime } from "./utils.js";

function popupMarkup(point) {
  const cves = Array.isArray(point.related_cves) ? point.related_cves.slice(0, 4) : [];
  const sources = Array.isArray(point.related_sources) ? point.related_sources.slice(0, 4) : [];

  return `
    <div class="map-popup-card">
      <div class="map-popup-meta">
        <span class="ui-badge severity-${normalizeSeverity(point.severity).toLowerCase()}">${escapeHtml(normalizeSeverity(point.severity))}</span>
        <span class="ui-badge is-source">${escapeHtml(String(point.source_count || point.event_count || 1))} sources</span>
      </div>
      <h3>${escapeHtml(point.title || "Signal")}</h3>
      <p>${escapeHtml(point.summary || "No summary provided.")}</p>
      <div class="map-popup-grid">
        <span>Time</span><strong>${escapeHtml(toDisplayTime(point.anchor_time))}</strong>
        <span>Geo</span><strong>${escapeHtml(point.geo_precision || "approximate")}</strong>
        <span>Vendor</span><strong>${escapeHtml(point.vendor || "Unknown")}</strong>
      </div>
      ${cves.length > 0 ? `<p class="map-popup-inline"><strong>CVEs:</strong> ${escapeHtml(cves.join(", "))}</p>` : ""}
      ${sources.length > 0 ? `<p class="map-popup-inline"><strong>Sources:</strong> ${escapeHtml(sources.join(", "))}</p>` : ""}
      ${point.url ? `<a class="map-popup-link" href="${escapeHtml(point.url)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
    </div>
  `;
}

function markerSize(point) {
  const sourceWeight = Number(point.source_count || point.event_count || 1);
  return 18 + Math.min(sourceWeight * 2, 18) + (severityRank(point.severity) * 2);
}

function pointIcon(point, kind = "signal") {
  const severity = normalizeSeverity(point.severity).toLowerCase();
  const size = markerSize(point);
  return window.L.divIcon({
    className: `signal-marker ${kind} severity-${severity}`,
    html: `
      <span class="signal-shell" style="width:${size}px;height:${size}px"></span>
      <span class="signal-core"></span>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function clusterIcon(cluster) {
  const markers = cluster.getAllChildMarkers();
  const severity = markers.reduce((current, marker) => {
    const next = normalizeSeverity(marker.options.signalData?.severity);
    return severityRank(next) > severityRank(current) ? next : current;
  }, "LOW").toLowerCase();
  const count = cluster.getChildCount();

  return window.L.divIcon({
    className: `signal-cluster severity-${severity}`,
    html: `<span>${count}</span>`,
    iconSize: [40, 40]
  });
}

function createClusterGroup() {
  if (window.L?.markerClusterGroup) {
    return window.L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 45,
      iconCreateFunction: clusterIcon
    });
  }
  return window.L.layerGroup();
}

function addPointToLayer(layer, point, kind) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return;
  }
  const marker = window.L.marker([point.latitude, point.longitude], {
    icon: pointIcon(point, kind)
  });
  marker.options.signalData = point;
  marker.bindPopup(popupMarkup(point), { className: "map-popup" });
  marker.bindTooltip(escapeHtml(point.title || "Signal"), {
    direction: "top",
    offset: [0, -12]
  });
  layer.addLayer(marker);
}

export function createDashboardMap(container) {
  const map = window.L.map(container, {
    zoomControl: false,
    preferCanvas: true,
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 8
  });

  window.L.control.zoom({ position: "bottomright" }).addTo(map);

  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  map.setView([20, 0], 2.2);

  const layers = {
    incidents: createClusterGroup(),
    correlated_clusters: createClusterGroup(),
    outages: createClusterGroup(),
    kev_linked_activity: createClusterGroup(),
    density: window.L?.heatLayer ? window.L.heatLayer([], {
      radius: 28,
      blur: 24,
      maxZoom: 5,
      gradient: {
        0.2: "#1d5cff",
        0.45: "#29d7ff",
        0.7: "#7ff2c0",
        1: "#ff7c6a"
      }
    }) : window.L.layerGroup()
  };

  const allLayerKeys = Object.keys(layers);
  allLayerKeys.forEach((key) => {
    if (key !== "density") {
      layers[key].addTo(map);
    }
  });

  function clearLayers() {
    allLayerKeys.forEach((key) => {
      const layer = layers[key];
      if (layer?.clearLayers) {
        layer.clearLayers();
      } else if (layer?.setLatLngs) {
        layer.setLatLngs([]);
      }
    });
  }

  function render(view, visibleLayers) {
    clearLayers();

    (view.layers.incidents || []).forEach((point) => addPointToLayer(layers.incidents, point, "incident"));
    (view.layers.correlated_clusters || []).forEach((point) => addPointToLayer(layers.correlated_clusters, point, "cluster"));
    (view.layers.outages || []).forEach((point) => addPointToLayer(layers.outages, point, "outage"));
    (view.layers.kev_linked_activity || []).forEach((point) => addPointToLayer(layers.kev_linked_activity, point, "kev"));

    if (window.L?.heatLayer && layers.density?.setLatLngs) {
      layers.density.setLatLngs(view.layers.density || []);
    }

    allLayerKeys.forEach((key) => {
      const layer = layers[key];
      if (visibleLayers[key]) {
        if (!map.hasLayer(layer)) {
          layer.addTo(map);
        }
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }

  return {
    map,
    render,
    resize() {
      map.invalidateSize();
    }
  };
}
