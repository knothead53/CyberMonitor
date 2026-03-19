import { LAYER_DEFINITIONS, STORAGE_KEY, TIMELINE_WINDOWS } from "./config.js";
import { matchesSearch, withinTimeline } from "./utils.js";

function defaultLayers() {
  return Object.fromEntries(LAYER_DEFINITIONS.map((layer) => [layer.key, layer.defaultVisible]));
}

export function loadPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      timeline: typeof parsed.timeline === "string" ? parsed.timeline : "72h",
      layers: {
        ...defaultLayers(),
        ...(parsed.layers && typeof parsed.layers === "object" ? parsed.layers : {})
      }
    };
  } catch (_error) {
    return {
      search: "",
      timeline: "72h",
      layers: defaultLayers()
    };
  }
}

export function savePreferences(state) {
  const payload = {
    search: state.search,
    timeline: state.timeline,
    layers: state.layers
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function createInitialState() {
  const preferences = loadPreferences();
  return {
    dashboard: null,
    search: preferences.search,
    timeline: preferences.timeline,
    layers: preferences.layers,
    dataMode: "pending"
  };
}

export function timelineDefinition(key) {
  return TIMELINE_WINDOWS.find((windowDef) => windowDef.key === key) || TIMELINE_WINDOWS[2];
}

function filterItems(items, state, anchorTime) {
  const windowMs = timelineDefinition(state.timeline).ms;
  return (Array.isArray(items) ? items : []).filter((item) => (
    matchesSearch(item, state.search) && withinTimeline(item, windowMs, anchorTime)
  ));
}

export function filterDashboard(dashboard, state) {
  const anchorTime = dashboard?.generated_at || new Date().toISOString();
  const panels = {};

  Object.entries(dashboard?.panels || {}).forEach(([key, panel]) => {
    panels[key] = {
      ...panel,
      items: filterItems(panel.items, state, anchorTime)
    };
  });

  const layers = {};
  Object.entries(dashboard?.map?.layers || {}).forEach(([key, items]) => {
    layers[key] = filterItems(items, state, anchorTime);
  });

  return {
    anchorTime,
    panels,
    layers,
    summary: {
      totalVisiblePanelItems: Object.values(panels).reduce((sum, panel) => sum + (panel.items?.length || 0), 0),
      totalVisibleMapSignals: Object.entries(layers).reduce((sum, [key, items]) => (
        key === "density" ? sum : sum + items.length
      ), 0)
    }
  };
}
