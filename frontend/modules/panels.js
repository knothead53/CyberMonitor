import { escapeHtml, formatNumber, normalizeSeverity, statusTone, toDisplayTime, toRelativeTime } from "./utils.js";

function badge(label, className = "") {
  return `<span class="ui-badge ${className}">${escapeHtml(label)}</span>`;
}

function renderEventItem(item) {
  const severity = normalizeSeverity(item.severity);
  const cves = Array.isArray(item.cve_ids) ? item.cve_ids.slice(0, 3) : [];
  const relatedSourceCount = Array.isArray(item.related_sources) ? item.related_sources.length : 0;
  const correlationBadge = item.is_correlated || relatedSourceCount > 0
    ? badge(`Correlated ${Math.max(Number(item.source_count || 1), relatedSourceCount + 1)}x`, "is-correlated")
    : "";

  return `
    <article class="intel-item">
      <div class="intel-item-meta">
        ${badge(severity, `severity-${severity.toLowerCase()}`)}
        ${badge(item.source || "Unknown", "is-source")}
        ${correlationBadge}
      </div>
      <h3 class="intel-item-title">
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled signal")}</a>` : escapeHtml(item.title || "Untitled signal")}
      </h3>
      <p class="intel-item-summary">${escapeHtml(item.summary || "No summary available.")}</p>
      <div class="intel-item-footer">
        <span>${escapeHtml(item.vendor || item.product || item.category || "Signal")}</span>
        <span>${escapeHtml(toDisplayTime(item.published_at || item.published))}</span>
        <span>${escapeHtml(toRelativeTime(item.published_at || item.published))}</span>
      </div>
      ${cves.length > 0 ? `<div class="intel-item-tags">${cves.map((value) => badge(value, "is-cve")).join("")}</div>` : ""}
    </article>
  `;
}

function renderClusterItem(item) {
  const severity = normalizeSeverity(item.severity);
  const cves = Array.isArray(item.related_cves) ? item.related_cves.slice(0, 4) : [];
  const sources = Array.isArray(item.related_sources) ? item.related_sources.slice(0, 4) : [];

  return `
    <article class="intel-item cluster-item">
      <div class="intel-item-meta">
        ${badge(severity, `severity-${severity.toLowerCase()}`)}
        ${badge(`${formatNumber(item.source_count || 0)} sources`, "is-source")}
        ${badge(`${Math.round(Number(item.confidence || 0) * 100)}% merge`, "is-confidence")}
      </div>
      <h3 class="intel-item-title">
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.primary_headline || "Correlated incident")}</a>` : escapeHtml(item.title || item.primary_headline || "Correlated incident")}
      </h3>
      <p class="intel-item-summary">${escapeHtml(item.summary || item.merged_summary || "No merged summary available.")}</p>
      <div class="intel-item-footer">
        <span>${formatNumber(item.event_count || 0)} signals</span>
        <span>${escapeHtml(toDisplayTime(item.last_seen || item.anchor_time))}</span>
        <span>${escapeHtml(item.cluster_type || "incident")}</span>
      </div>
      ${cves.length > 0 ? `<div class="intel-item-tags">${cves.map((value) => badge(value, "is-cve")).join("")}</div>` : ""}
      ${sources.length > 0 ? `<div class="intel-item-tags">${sources.map((value) => badge(value, "is-source")).join("")}</div>` : ""}
    </article>
  `;
}

function renderState(message) {
  return `<div class="panel-state">${escapeHtml(message)}</div>`;
}

function panelStatusMarkup(groupHealth) {
  const tone = statusTone(groupHealth?.status);
  const label = groupHealth?.status ? groupHealth.status.toUpperCase() : "PENDING";
  return `<span class="status-pill tone-${tone}">${escapeHtml(label)}</span>`;
}

export function renderPanels(elements, dashboard, filtered) {
  const groupHealth = dashboard.source_health?.groups || {};

  const panelMap = [
    { key: "clusters", list: elements.clustersList, count: elements.clustersCount, status: elements.clustersStatus, renderer: renderClusterItem },
    { key: "priority", list: elements.priorityList, count: elements.priorityCount, status: elements.priorityStatus, renderer: renderEventItem },
    { key: "intel", list: elements.intelList, count: elements.intelCount, status: elements.intelStatus, renderer: renderEventItem },
    { key: "outages", list: elements.outagesList, count: elements.outagesCount, status: elements.outagesStatus, renderer: renderEventItem }
  ];

  panelMap.forEach((panel) => {
    const data = filtered.panels?.[panel.key] || dashboard.panels?.[panel.key] || { items: [] };
    const items = Array.isArray(data.items) ? data.items : [];
    if (panel.count) {
      panel.count.textContent = formatNumber(items.length);
    }
    if (panel.status) {
      panel.status.innerHTML = panelStatusMarkup(groupHealth[panel.key] || { status: dashboard.data_mode || "pending" });
    }
    if (!panel.list) {
      return;
    }
    panel.list.innerHTML = items.length > 0
      ? items.map((item) => panel.renderer(item)).join("")
      : renderState("No signals match the current search and timeline filters.");
  });
}
