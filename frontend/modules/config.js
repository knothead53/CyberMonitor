export const STORAGE_KEY = "cybermonitor.v2.preferences";

export const DASHBOARD_PATHS = [
  { path: "../data/correlated/dashboard.json", mode: "live" },
  { path: "../data/correlated/dashboard.sample.json", mode: "sample" }
];

export const TIMELINE_WINDOWS = [
  { key: "6h", label: "Last 6H", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24H", ms: 24 * 60 * 60 * 1000 },
  { key: "72h", label: "Last 72H", ms: 72 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30D", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All Signals", ms: Number.POSITIVE_INFINITY }
];

export const LAYER_DEFINITIONS = [
  { key: "incidents", label: "Incidents", defaultVisible: true },
  { key: "correlated_clusters", label: "Correlated Clusters", defaultVisible: true },
  { key: "outages", label: "Outages", defaultVisible: true },
  { key: "kev_linked_activity", label: "KEV-Linked Activity", defaultVisible: true },
  { key: "density", label: "Density", defaultVisible: false }
];

export const PANEL_ORDER = ["clusters", "priority", "intel", "outages"];

export const SEVERITY_ORDER = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

export const STATUS_TONE = {
  ok: "ok",
  live: "ok",
  mixed: "warn",
  degraded: "warn",
  stale: "warn",
  fallback: "muted",
  sample: "muted",
  error: "error",
  stub: "muted",
  pending: "muted"
};
