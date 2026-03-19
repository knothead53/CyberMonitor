import { SEVERITY_ORDER, STATUS_TONE } from "./config.js";

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeSeverity(value) {
  const upper = String(value || "").trim().toUpperCase();
  return SEVERITY_ORDER[upper] ? upper : "MEDIUM";
}

export function severityRank(value) {
  return SEVERITY_ORDER[normalizeSeverity(value)] || 2;
}

export function maxSeverity(values = []) {
  return values.reduce((current, value) => (
    severityRank(value) > severityRank(current) ? normalizeSeverity(value) : current
  ), "LOW");
}

export function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function toIso(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function toDisplayTime(value) {
  const iso = toIso(value);
  if (!iso) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function toRelativeTime(value, anchor = Date.now()) {
  const iso = toIso(value);
  if (!iso) {
    return "Unknown";
  }
  const deltaMs = Date.parse(iso) - anchor;
  const seconds = Math.round(deltaMs / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return `${Math.abs(minutes)}m ${minutes < 0 ? "ago" : "ahead"}`;
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return `${Math.abs(hours)}h ${hours < 0 ? "ago" : "ahead"}`;
  }

  const days = Math.round(hours / 24);
  return `${Math.abs(days)}d ${days < 0 ? "ago" : "ahead"}`;
}

export function statusTone(status) {
  return STATUS_TONE[String(status || "").toLowerCase()] || "muted";
}

export function itemAnchorTime(item) {
  return toIso(item?.last_seen || item?.anchor_time || item?.published_at || item?.published || item?.generated_at);
}

export function searchBlob(item) {
  return normalizeSearch(
    item?.search_blob
    || [
      item?.title,
      item?.summary,
      item?.source,
      item?.vendor,
      item?.product,
      ...(Array.isArray(item?.cve_ids) ? item.cve_ids : []),
      ...(Array.isArray(item?.related_cves) ? item.related_cves : []),
      ...(Array.isArray(item?.related_sources) ? item.related_sources : []),
      item?.actor,
      item?.campaign,
      item?.category
    ].filter(Boolean).join(" ")
  );
}

export function matchesSearch(item, query) {
  const term = normalizeSearch(query);
  if (!term) {
    return true;
  }
  return searchBlob(item).includes(term);
}

export function withinTimeline(item, windowMs, anchorTime) {
  if (!Number.isFinite(windowMs) || windowMs === Number.POSITIVE_INFINITY) {
    return true;
  }
  const itemTime = Date.parse(itemAnchorTime(item) || "");
  const anchor = Date.parse(anchorTime || "") || Date.now();
  if (!Number.isFinite(itemTime)) {
    return false;
  }
  return anchor - itemTime <= windowMs;
}
