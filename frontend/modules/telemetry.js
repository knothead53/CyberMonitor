import { LAYER_DEFINITIONS, TIMELINE_WINDOWS } from "./config.js";
import { escapeHtml, formatNumber, statusTone, toDisplayTime, toRelativeTime } from "./utils.js";

function renderStatusLabel(label, tone) {
  return `<span class="status-pill tone-${tone}">${escapeHtml(label)}</span>`;
}

export function renderTopbar(elements, dashboard, filtered, state) {
  if (elements.dataModeBadge) {
    elements.dataModeBadge.innerHTML = renderStatusLabel(`Data ${dashboard.data_mode || "sample"}`.toUpperCase(), statusTone(dashboard.data_mode));
  }

  const overallStatus = dashboard.source_health?.groups
    ? Object.values(dashboard.source_health.groups).find((group) => group.status === "error")?.status
      || Object.values(dashboard.source_health.groups).find((group) => group.status === "degraded")?.status
      || Object.values(dashboard.source_health.groups).find((group) => group.status === "stale")?.status
      || "ok"
    : "ok";

  if (elements.healthBadge) {
    elements.healthBadge.innerHTML = renderStatusLabel(`Health ${overallStatus}`.toUpperCase(), statusTone(overallStatus));
  }

  if (elements.refreshSummary) {
    elements.refreshSummary.textContent = `Refresh: ${toRelativeTime(dashboard.generated_at)}`;
    elements.refreshSummary.title = `Generated ${toDisplayTime(dashboard.generated_at)}`;
  }

  if (elements.lastUpdated) {
    elements.lastUpdated.textContent = `Generated ${toDisplayTime(dashboard.generated_at)}`;
  }

  if (elements.signalCount) {
    elements.signalCount.textContent = formatNumber(filtered.summary.totalVisibleMapSignals);
  }
  if (elements.clusterCount) {
    elements.clusterCount.textContent = formatNumber(filtered.panels?.clusters?.items?.length || 0);
  }
  if (elements.severityCount) {
    const count = dashboard.normalized?.events?.filter((event) => ["HIGH", "CRITICAL"].includes(event.severity)).length || 0;
    elements.severityCount.textContent = formatNumber(count);
  }
}

export function renderFilters(elements, state, filtered) {
  if (elements.searchInput) {
    elements.searchInput.value = state.search;
  }
  if (elements.clearSearch) {
    elements.clearSearch.disabled = String(state.search || "").trim().length === 0;
  }

  const timelineIndex = TIMELINE_WINDOWS.findIndex((windowDef) => windowDef.key === state.timeline);
  if (elements.timelineLabel) {
    const current = TIMELINE_WINDOWS[timelineIndex >= 0 ? timelineIndex : 2];
    elements.timelineLabel.textContent = `${current.label} (${formatNumber(filtered.summary.totalVisibleMapSignals)})`;
  }
  if (elements.timelinePrev) {
    elements.timelinePrev.disabled = timelineIndex <= 0;
  }
  if (elements.timelineNext) {
    elements.timelineNext.disabled = timelineIndex === -1 || timelineIndex >= TIMELINE_WINDOWS.length - 1;
  }

  LAYER_DEFINITIONS.forEach((layer) => {
    const checkbox = elements.layerInputs?.[layer.key];
    if (checkbox) {
      checkbox.checked = Boolean(state.layers[layer.key]);
    }
  });
}

export function renderSourceDrawer(elements, dashboard) {
  if (!elements.sourceDrawerBody) {
    return;
  }

  const entries = Object.entries(dashboard.source_health?.sources || {})
    .sort((left, right) => String(left[1]?.panel || "").localeCompare(String(right[1]?.panel || "")) || String(left[1]?.name || "").localeCompare(String(right[1]?.name || "")));

  if (entries.length === 0) {
    elements.sourceDrawerBody.innerHTML = `<div class="panel-state">No source observability data available.</div>`;
    return;
  }

  elements.sourceDrawerBody.innerHTML = entries.map(([key, source]) => `
    <article class="source-row">
      <div class="source-row-head">
        <div>
          <h3>${escapeHtml(source.name || key)}</h3>
          <p>${escapeHtml(source.panel || "unknown")} | ${escapeHtml(source.sourceType || "unknown")}</p>
        </div>
        ${renderStatusLabel((source.mode || source.status || "unknown").toUpperCase(), statusTone(source.status || source.mode))}
      </div>
      <div class="source-row-grid">
        <span>Items <strong>${formatNumber(source.itemCount || 0)}</strong></span>
        <span>Failures <strong>${formatNumber(source.failureCount || 0)}</strong></span>
        <span>Last success <strong>${escapeHtml(source.lastSuccess ? toDisplayTime(source.lastSuccess) : "Never")}</strong></span>
        <span>Last failure <strong>${escapeHtml(source.lastFailure ? toDisplayTime(source.lastFailure) : "None")}</strong></span>
      </div>
      ${source.errorMessage ? `<p class="source-row-note">${escapeHtml(source.errorMessage)}</p>` : ""}
    </article>
  `).join("");
}
