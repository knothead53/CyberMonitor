(() => {
  const FEED_LIMIT = 10;

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

  const elements = {
    updated: document.getElementById("last-updated"),
    refresh: document.getElementById("refresh-btn"),
    layerInputs: Array.from(document.querySelectorAll('#layer-form input[name="layer"]'))
  };

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

  function normalizeItems(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue;
    }
    if (rawValue && Array.isArray(rawValue.items)) {
      return rawValue.items;
    }
    return [];
  }

  function sortByNewest(items) {
    return [...items].sort((a, b) => {
      const aTime = Date.parse(a.published || "");
      const bTime = Date.parse(b.published || "");
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
    const limited = sortByNewest(items).slice(0, FEED_LIMIT);

    count.textContent = String(limited.length);
    list.innerHTML = "";

    if (limited.length === 0) {
      renderState(list, "No feed items available.");
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
      meta.textContent = `${entry.source || "Unknown source"} | ${toDisplayTime(entry.published)}`;

      const summary = document.createElement("p");
      summary.className = "item-summary";
      summary.textContent = entry.summary || "No summary provided.";

      const tagWrap = document.createElement("div");
      tagWrap.className = "item-tags";

      if (index === 0) {
        tagWrap.appendChild(createTag("newest"));
      }

      if (entry.severity) {
        tagWrap.appendChild(createTag(entry.severity.toUpperCase(), `severity-${entry.severity}`));
      }

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

  function getLocalFallback(feedKey) {
    const fallbackFeeds = window.CYBERMONITOR_FALLBACK_FEEDS;
    if (!fallbackFeeds || !Array.isArray(fallbackFeeds[feedKey])) {
      return null;
    }
    return fallbackFeeds[feedKey];
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
      renderItems(feedKey, result.items);
      return {
        success: true,
        usedFallback: result.usedFallback
      };
    } catch (_error) {
      renderState(list, "Error loading data. Try Refresh.");
      return {
        success: false,
        usedFallback: false
      };
    }
  }

  function applyLayerVisibility() {
    elements.layerInputs.forEach((input) => {
      const { panel } = selectFeedElements(input.value);
      if (!panel) {
        return;
      }
      panel.classList.toggle("panel-hidden", !input.checked);
    });
  }

  function setupLayerFilters() {
    applyLayerVisibility();
    elements.layerInputs.forEach((input) => {
      input.addEventListener("change", applyLayerVisibility);
    });
  }

  async function loadAllPanels() {
    setRefreshState(true);

    try {
      const keys = Object.keys(FEEDS);
      const results = await Promise.all(keys.map((feedKey) => loadPanel(feedKey)));
      const successful = results.filter((result) => result.success);

      if (successful.length > 0) {
        const fallbackInUse = successful.some((result) => result.usedFallback);
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

  document.addEventListener("DOMContentLoaded", () => {
    setupLayerFilters();
    setupRefreshButton();
    loadAllPanels();
  });
})();
