const { fetchJson, fetchText } = require("./http");
const { parseFeed, stripHtml } = require("./rss");
const { createEvent, extractCveIds, normalizeSeverity, safeArray, safeSummary, toIso, unique } = require("./normalize");

function pickEnglishDescription(descriptions) {
  const entries = safeArray(descriptions);
  const english = entries.find((entry) => entry && entry.lang === "en");
  return english?.value || entries[0]?.value || "";
}

function collectCpeInfo(nodes, bucket = []) {
  safeArray(nodes).forEach((node) => {
    safeArray(node?.cpeMatch).forEach((match) => {
      if (!match?.criteria) {
        return;
      }
      const parts = String(match.criteria).split(":");
      if (parts.length >= 5) {
        bucket.push({
          vendor: parts[3],
          product: parts[4]
        });
      }
    });
    collectCpeInfo(node?.children, bucket);
    collectCpeInfo(node?.nodes, bucket);
  });
  return bucket;
}

function normalizeCisaKev(source, payload, context) {
  const vulnerabilities = Array.isArray(payload?.vulnerabilities) ? payload.vulnerabilities : [];
  return vulnerabilities.map((entry, index) => {
    const cveId = String(entry?.cveID || "").trim().toUpperCase();
    const title = cveId && entry?.vulnerabilityName
      ? `${cveId} - ${entry.vulnerabilityName}`
      : entry?.vulnerabilityName || cveId || `CISA KEV ${index + 1}`;
    const severity = String(entry?.knownRansomwareCampaignUse || "").toLowerCase() === "known"
      ? "CRITICAL"
      : normalizeSeverity(entry?.severity, "HIGH");

    return createEvent(source, entry, {
      id: cveId || undefined,
      title,
      summary: safeSummary(entry?.shortDescription || entry?.requiredAction, title),
      url: (String(entry?.notes || "").match(/https?:\/\/[^\s;]+/i) || [])[0] || (cveId ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}` : source.url),
      published_at: toIso(entry?.dateAdded, context.generatedAt),
      severity,
      vendor: entry?.vendorProject,
      product: entry?.product,
      cve_ids: cveId ? [cveId] : [],
      tags: [
        ...(Array.isArray(entry?.cwes) ? entry.cwes : []),
        String(entry?.knownRansomwareCampaignUse || "").toLowerCase() === "known" ? "known-ransomware" : ""
      ]
    }, context);
  });
}

function normalizeNvd(source, payload, context) {
  const rows = Array.isArray(payload?.vulnerabilities) ? payload.vulnerabilities : [];
  return rows.map((wrapper) => {
    const cve = wrapper?.cve || {};
    const metrics = cve?.metrics || {};
    const cvss = metrics?.cvssMetricV31?.[0]
      || metrics?.cvssMetricV30?.[0]
      || metrics?.cvssMetricV2?.[0]
      || {};
    const cpeInfo = collectCpeInfo(cve?.configurations);
    const vendor = cpeInfo[0]?.vendor ? String(cpeInfo[0].vendor).replace(/_/g, " ") : "";
    const product = cpeInfo[0]?.product ? String(cpeInfo[0].product).replace(/_/g, " ") : "";
    const description = pickEnglishDescription(cve?.descriptions);
    const title = `${cve?.id || "NVD"} - ${description.split(".")[0] || "NVD vulnerability"}`;
    const references = safeArray(cve?.references).map((entry) => entry?.url).filter(Boolean);
    const cweValues = safeArray(cve?.weaknesses)
      .flatMap((entry) => safeArray(entry?.description))
      .map((entry) => entry?.value)
      .filter(Boolean);
    const severity = normalizeSeverity(
      cvss?.cvssData?.baseSeverity
        || cvss?.baseSeverity
        || (cve?.cisaExploitAdd ? "CRITICAL" : "HIGH"),
      "HIGH"
    );

    return createEvent(source, cve, {
      id: cve?.id,
      title,
      summary: description,
      url: references[0] || (cve?.id ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}` : source.url),
      published_at: cve?.published,
      severity,
      vendor,
      product,
      cve_ids: cve?.id ? [String(cve.id).toUpperCase()] : [],
      tags: [
        ...cweValues,
        cve?.cisaExploitAdd ? "kev-linked" : ""
      ]
    }, context);
  });
}

function normalizeFeedItems(source, items, context, options = {}) {
  return items.map((item) => {
    const combinedText = `${item.title || ""} ${item.summary || ""}`;
    return createEvent(source, item, {
      title: stripHtml(item.title),
      summary: safeSummary(stripHtml(item.summary)),
      url: item.link || item.guid || source.url,
      published_at: item.published || item.updated || context.generatedAt,
      severity: options.severityResolver ? options.severityResolver(item, combinedText) : undefined,
      vendor: options.vendor || item.vendor,
      product: options.productResolver ? options.productResolver(item) : undefined,
      cve_ids: unique(extractCveIds(combinedText)),
      tags: [
        ...(Array.isArray(item.categories) ? item.categories : []),
        source.category
      ]
    }, context);
  });
}

function normalizeStatusItems(source, items, context) {
  return normalizeFeedItems(source, items, context, {
    vendor: source.vendor,
    severityResolver(item) {
      const text = `${String(item.title || "")} ${String(item.summary || "")}`.toLowerCase();
      if (/(major outage|global outage|service unavailable|critical)/.test(text)) {
        return "CRITICAL";
      }
      if (/(incident|degraded|latency|error|outage|partial)/.test(text)) {
        return "HIGH";
      }
      return normalizeSeverity(source.defaultSeverity, "MEDIUM");
    }
  }).filter((event) => {
    const lowered = `${event.title} ${event.summary}`.toLowerCase();
    return !/scheduled maintenance|scheduled event/.test(lowered);
  });
}

function normalizePaloAlto(source, payload, context) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return rows.map((entry) => createEvent(source, entry, {
    id: entry?.ID,
    title: safeSummary(entry?.title || entry?.ID, entry?.ID || "Palo Alto advisory", 160),
    summary: safeSummary(entry?.problem?.[0]?.value || entry?.solution?.[0]?.value || entry?.title),
    url: entry?.ID ? `https://security.paloaltonetworks.com/${encodeURIComponent(entry.ID)}` : source.url,
    published_at: entry?.updated || entry?.date || context.generatedAt,
    severity: entry?.severity || entry?.baseSeverity || entry?.threatSeverity || "HIGH",
    vendor: source.vendor,
    product: safeArray(entry?.product)[0],
    cve_ids: unique([
      ...safeArray(entry?.ID).filter((value) => /^CVE-/i.test(String(value || ""))),
      ...extractCveIds(`${entry?.title || ""} ${entry?.problem?.[0]?.value || ""}`)
    ]),
    tags: safeArray(entry?.product)
  }, context));
}

function normalizeMsrcUpdates(source, payload, context) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload?.updates)
        ? payload.updates
        : [];

  return rows.slice(0, 18).map((entry) => createEvent(source, entry, {
    id: entry?.ID || entry?.id || entry?.Alias || entry?.alias,
    title: entry?.DocumentTitle || entry?.documentTitle || entry?.Alias || entry?.alias || "Microsoft Security Update Guide release",
    summary: safeSummary([
      entry?.Severity ? `Severity: ${entry.Severity}.` : "",
      entry?.Alias ? `Release: ${entry.Alias}.` : "",
      entry?.DocumentTitle || ""
    ].filter(Boolean).join(" ")),
    url: entry?.CvrfUrl || entry?.cvrfUrl || "https://msrc.microsoft.com/update-guide",
    published_at: entry?.CurrentReleaseDate || entry?.InitialReleaseDate || context.generatedAt,
    severity: entry?.Severity || "HIGH",
    vendor: "Microsoft",
    product: "Security Update Guide",
    cve_ids: extractCveIds(`${entry?.DocumentTitle || ""} ${entry?.Alias || ""}`)
  }, context));
}

async function runSource(source, context) {
  if (!source.enabled || source.adapter === "stub") {
    return {
      events: [],
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: 0,
        mode: "stub",
        stubReason: source.stubReason || "Disabled source"
      }
    };
  }

  if (source.adapter === "cisaKev") {
    const response = await fetchJson(source.url, { timeoutMs: 20000 });
    return {
      events: normalizeCisaKev(source, response.json, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: Array.isArray(response.json?.vulnerabilities) ? response.json.vulnerabilities.length : 0,
        mode: "live",
        payload: response.json
      }
    };
  }

  if (source.adapter === "nvdRecent") {
    const now = new Date(context.generatedAt);
    const start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const url = `${source.url}?lastModStartDate=${encodeURIComponent(start.toISOString())}&lastModEndDate=${encodeURIComponent(now.toISOString())}&resultsPerPage=150`;
    const response = await fetchJson(url, { timeoutMs: 20000 });
    return {
      events: normalizeNvd(source, response.json, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url,
        fetchedAt: context.generatedAt,
        itemCount: Array.isArray(response.json?.vulnerabilities) ? response.json.vulnerabilities.length : 0,
        mode: "live",
        payload: response.json
      }
    };
  }

  if (source.adapter === "paloAltoJson") {
    const response = await fetchJson(source.url, { timeoutMs: 20000 });
    return {
      events: normalizePaloAlto(source, response.json, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: Array.isArray(response.json) ? response.json.length : Array.isArray(response.json?.items) ? response.json.items.length : 0,
        mode: "live",
        payload: response.json
      }
    };
  }

  if (source.adapter === "msrcUpdates") {
    const response = await fetchJson(source.url, { timeoutMs: 20000 });
    return {
      events: normalizeMsrcUpdates(source, response.json, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: Array.isArray(response.json) ? response.json.length : Array.isArray(response.json?.value) ? response.json.value.length : 0,
        mode: "live",
        payload: response.json
      }
    };
  }

  if (source.adapter === "genericRss") {
    const response = await fetchText(source.url, {
      timeoutMs: 20000,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });
    const items = parseFeed(response.text);
    return {
      events: normalizeFeedItems(source, items, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: items.length,
        mode: "live",
        payload: items
      }
    };
  }

  if (source.adapter === "statusRss") {
    const response = await fetchText(source.url, {
      timeoutMs: 20000,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });
    const items = parseFeed(response.text);
    return {
      events: normalizeStatusItems(source, items, context),
      rawSnapshot: {
        source: source.label,
        sourceKey: source.key,
        url: source.url,
        fetchedAt: context.generatedAt,
        itemCount: items.length,
        mode: "live",
        payload: items
      }
    };
  }

  throw new Error(`Unsupported adapter: ${source.adapter}`);
}

module.exports = {
  runSource
};
