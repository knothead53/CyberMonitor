import { LAYER_DEFINITIONS, TIMELINE_WINDOWS } from "./modules/config.js";
import { loadDashboard } from "./modules/data-service.js";
import { createDashboardMap } from "./modules/map.js";
import { renderPanels } from "./modules/panels.js";
import { createInitialState, filterDashboard, savePreferences } from "./modules/state.js";
import { renderFilters, renderSourceDrawer, renderTopbar } from "./modules/telemetry.js";

const state = createInitialState();

const elements = {
  map: document.getElementById("global-map"),
  dataModeBadge: document.getElementById("data-mode-badge"),
  healthBadge: document.getElementById("feed-health-badge"),
  refreshSummary: document.getElementById("feed-refresh-summary"),
  lastUpdated: document.getElementById("last-updated"),
  signalCount: document.getElementById("signals-visible-value"),
  clusterCount: document.getElementById("clusters-visible-value"),
  severityCount: document.getElementById("high-severity-value"),
  searchInput: document.getElementById("global-search-input"),
  clearSearch: document.getElementById("global-search-clear-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  sourcesBtn: document.getElementById("sources-btn"),
  sourceDrawer: document.getElementById("source-drawer"),
  sourceDrawerClose: document.getElementById("source-drawer-close"),
  sourceDrawerBody: document.getElementById("source-drawer-body"),
  timelinePrev: document.getElementById("timeline-prev-btn"),
  timelineNext: document.getElementById("timeline-next-btn"),
  timelineLabel: document.getElementById("timeline-label"),
  layerInputs: Object.fromEntries(LAYER_DEFINITIONS.map((layer) => [layer.key, document.querySelector(`[data-layer="${layer.key}"]`)])),
  clustersList: document.getElementById("clusters-list"),
  priorityList: document.getElementById("priority-list"),
  intelList: document.getElementById("intel-list"),
  outagesList: document.getElementById("outages-list"),
  clustersCount: document.getElementById("clusters-count"),
  priorityCount: document.getElementById("priority-count"),
  intelCount: document.getElementById("intel-count"),
  outagesCount: document.getElementById("outages-count"),
  clustersStatus: document.getElementById("clusters-status"),
  priorityStatus: document.getElementById("priority-status"),
  intelStatus: document.getElementById("intel-status"),
  outagesStatus: document.getElementById("outages-status")
};

const dashboardMap = createDashboardMap(elements.map);

function render() {
  if (!state.dashboard) {
    return;
  }

  const filtered = filterDashboard(state.dashboard, state);
  renderTopbar(elements, state.dashboard, filtered, state);
  renderFilters(elements, state, filtered);
  renderPanels(elements, state.dashboard, filtered);
  renderSourceDrawer(elements, state.dashboard);
  dashboardMap.render(filtered, state.layers);
  savePreferences(state);
}

async function refreshDashboard({ bustCache = false } = {}) {
  if (elements.refreshBtn) {
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = "Refreshing";
  }

  try {
    state.dashboard = await loadDashboard({ bustCache });
    state.dataMode = state.dashboard.data_mode;
    render();
    dashboardMap.resize();
  } finally {
    if (elements.refreshBtn) {
      elements.refreshBtn.disabled = false;
      elements.refreshBtn.textContent = "Refresh";
    }
  }
}

function setTimeline(direction) {
  const currentIndex = TIMELINE_WINDOWS.findIndex((windowDef) => windowDef.key === state.timeline);
  const safeIndex = currentIndex >= 0 ? currentIndex : 2;
  const nextIndex = Math.max(0, Math.min(TIMELINE_WINDOWS.length - 1, safeIndex + direction));
  state.timeline = TIMELINE_WINDOWS[nextIndex].key;
  render();
}

function openDrawer() {
  if (elements.sourceDrawer?.open) {
    return;
  }
  if (elements.sourceDrawer?.showModal) {
    elements.sourceDrawer.showModal();
    return;
  }
  elements.sourceDrawer?.setAttribute("open", "open");
}

function closeDrawer() {
  if (elements.sourceDrawer?.close) {
    elements.sourceDrawer.close();
    return;
  }
  elements.sourceDrawer?.removeAttribute("open");
}

function bindEvents() {
  elements.searchInput?.addEventListener("input", (event) => {
    state.search = String(event.target.value || "");
    render();
  });

  elements.clearSearch?.addEventListener("click", () => {
    state.search = "";
    render();
  });

  elements.refreshBtn?.addEventListener("click", () => {
    refreshDashboard({ bustCache: true });
  });

  elements.sourcesBtn?.addEventListener("click", openDrawer);
  elements.sourceDrawerClose?.addEventListener("click", closeDrawer);
  elements.sourceDrawer?.addEventListener("click", (event) => {
    if (event.target === elements.sourceDrawer) {
      closeDrawer();
    }
  });

  elements.timelinePrev?.addEventListener("click", () => setTimeline(-1));
  elements.timelineNext?.addEventListener("click", () => setTimeline(1));

  LAYER_DEFINITIONS.forEach((layer) => {
    elements.layerInputs[layer.key]?.addEventListener("change", (event) => {
      state.layers[layer.key] = Boolean(event.target.checked);
      render();
    });
  });

  window.addEventListener("resize", () => {
    dashboardMap.resize();
  });
}

bindEvents();
refreshDashboard();
