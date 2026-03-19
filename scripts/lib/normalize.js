const { createHash } = require("crypto");
const { inferVictimRegion, resolveGeo } = require("./geo");

const SEVERITY_SCALE = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "for", "from", "has", "have", "in", "into", "is",
  "it", "its", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "with", "by",
  "after", "before", "during", "under", "over", "new", "latest", "update", "updates", "issue", "issues",
  "security", "cyber", "cybersecurity"
]);

const VENDOR_ALIASES = [
  { canonical: "Microsoft", aliases: ["microsoft", "msrc", "sharepoint", "exchange", "windows"] },
  { canonical: "Cisco", aliases: ["cisco", "ios xe", "asa", "nx-os"] },
  { canonical: "Fortinet", aliases: ["fortinet", "fortios", "fortimanager", "fortianalyzer", "fortigate"] },
  { canonical: "Palo Alto Networks", aliases: ["palo alto", "pan-os", "prisma access", "globalprotect"] },
  { canonical: "VMware", aliases: ["vmware", "esxi", "vcenter", "vsphere"] },
  { canonical: "Broadcom", aliases: ["broadcom", "symantec"] },
  { canonical: "Cloudflare", aliases: ["cloudflare", "workers", "pages"] },
  { canonical: "GitHub", aliases: ["github", "copilot"] },
  { canonical: "OpenAI", aliases: ["openai", "chatgpt", "codex"] },
  { canonical: "Slack", aliases: ["slack"] },
  { canonical: "Discord", aliases: ["discord"] },
  { canonical: "Atlassian", aliases: ["atlassian", "jira", "confluence", "bitbucket"] },
  { canonical: "Heroku", aliases: ["heroku"] },
  { canonical: "Google", aliases: ["google", "android", "chromium", "chrome"] },
  { canonical: "Apple", aliases: ["apple", "ios", "macos", "safari"] },
  { canonical: "Okta", aliases: ["okta"] },
  { canonical: "Ivanti", aliases: ["ivanti", "pulse secure", "connect secure"] },
  { canonical: "Citrix", aliases: ["citrix", "netscaler"] },
  { canonical: "Zimbra", aliases: ["zimbra"] },
  { canonical: "Apache", aliases: ["apache", "struts", "tomcat"] }
];

const ACTOR_PATTERNS = [
  "apt28",
  "apt29",
  "apt31",
  "salt typhoon",
  "volt typhoon",
  "lockbit",
  "black basta",
  "blackcat",
  "clop",
  "conti",
  "scattered spider",
  "lazarus"
];

const CAMPAIGN_PATTERNS = [
  "ransomware",
  "supply chain",
  "phishing",
  "credential stuffing",
  "ddos",
  "zero-day",
  "active exploitation"
];

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function safeArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, "\"")
    .trim();
}

function safeSummary(value, fallback = "No summary provided.", maxLength = 520) {
  const text = cleanText(value);
  if (!text) {
    return fallback;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeUrl(value, fallback = "") {
  const text = cleanText(value);
  if (!text) {
    return fallback;
  }
  try {
    return new URL(text).toString();
  } catch (_error) {
    return fallback;
  }
}

function toIso(value, fallback = new Date().toISOString()) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return fallback;
}

function stableHash(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function stableId(prefix, parts) {
  const base = parts.map((part) => String(part || "")).join("|");
  return `${prefix}-${stableHash(base).slice(0, 12)}`;
}

function normalizeSeverity(value, fallback = "MEDIUM") {
  const upper = String(value || "").trim().toUpperCase();
  if (SEVERITY_SCALE[upper]) {
    return upper;
  }
  if (upper === "MODERATE" || upper === "MED") {
    return "MEDIUM";
  }
  if (upper === "IMPORTANT") {
    return "HIGH";
  }
  return fallback;
}

function maxSeverity(left, right) {
  const a = normalizeSeverity(left);
  const b = normalizeSeverity(right);
  return SEVERITY_SCALE[a] >= SEVERITY_SCALE[b] ? a : b;
}

function severityWeight(severity) {
  return SEVERITY_SCALE[normalizeSeverity(severity)] || 2;
}

function tokenize(value) {
  return unique(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

function extractCveIds(textValue) {
  return unique((String(textValue || "").match(/\bCVE-\d{4}-\d{4,7}\b/gi) || []).map((value) => value.toUpperCase()));
}

function findAliasMatch(textValue, aliasTable) {
  const text = String(textValue || "").toLowerCase();
  const match = aliasTable.find((entry) => entry.aliases.some((alias) => text.includes(alias)));
  return match ? match.canonical : "";
}

function detectVendor(textValue) {
  return findAliasMatch(textValue, VENDOR_ALIASES);
}

function canonicalizeVendor(value) {
  const raw = cleanText(value);
  if (!raw) {
    return "";
  }
  const match = VENDOR_ALIASES.find((entry) => entry.canonical.toLowerCase() === raw.toLowerCase() || entry.aliases.includes(raw.toLowerCase()));
  return match ? match.canonical : raw;
}

function detectActor(textValue) {
  const text = String(textValue || "").toLowerCase();
  const match = ACTOR_PATTERNS.find((pattern) => text.includes(pattern));
  return match ? match.toUpperCase().replace(/\b\w/g, (char) => char.toUpperCase()) : "";
}

function detectCampaign(textValue) {
  const text = String(textValue || "").toLowerCase();
  const match = CAMPAIGN_PATTERNS.find((pattern) => text.includes(pattern));
  return match ? match : "";
}

function detectProduct(title, summary, vendor, fallback = "") {
  const existing = cleanText(fallback);
  if (existing) {
    return existing;
  }

  const text = `${title} ${summary}`;
  const compact = cleanText(text);
  if (!compact) {
    return "";
  }

  if (vendor) {
    const regex = new RegExp(`${vendor}\\s+([A-Z0-9][A-Za-z0-9.+/_ -]{2,60})`, "i");
    const match = compact.match(regex);
    if (match) {
      return cleanText(match[1]).split(" ").slice(0, 4).join(" ");
    }
  }

  const titleTokens = compact.split(" ");
  return titleTokens.slice(0, 4).join(" ");
}

function inferSeverityFromText(textValue, fallback = "MEDIUM") {
  const text = String(textValue || "").toLowerCase();
  if (/(actively exploited|zero-day|zero day|ransomware|data breach|remote code execution|unauthenticated|authentication bypass|mass exploitation)/.test(text)) {
    return "CRITICAL";
  }
  if (/(critical|severe|malware|exploit|compromise|privilege escalation|command injection|deserialization|botnet|account takeover|denial of service|dos)/.test(text)) {
    return "HIGH";
  }
  if (/(warning|patch|advisory|update|outage|degraded|latency|incident|issue)/.test(text)) {
    return "MEDIUM";
  }
  return normalizeSeverity(fallback);
}

function buildTags({ source, panel, category, severity, vendor, product, actor, campaign, cveIds, extraTags = [] }) {
  return unique([
    slugify(source),
    slugify(panel),
    slugify(category),
    slugify(severity),
    slugify(vendor),
    slugify(product),
    slugify(actor),
    slugify(campaign),
    ...safeArray(cveIds).map((value) => slugify(value)),
    ...safeArray(extraTags).map((value) => slugify(value))
  ]).filter(Boolean);
}

function buildIncidentKey({ category, vendor, product, actor, campaign, cveIds, title }) {
  if (safeArray(cveIds).length > 0) {
    return `cve:${safeArray(cveIds).slice(0, 3).join("+")}`;
  }
  if (actor) {
    return `actor:${slugify(actor)}`;
  }
  if (campaign) {
    return `campaign:${slugify(campaign)}`;
  }
  if (vendor && product) {
    return `vendor-product:${slugify(vendor)}:${slugify(product)}`;
  }
  if (vendor) {
    return `vendor:${slugify(vendor)}`;
  }
  const titleTokens = tokenize(title).slice(0, 4);
  return `${slugify(category)}:${titleTokens.join("-") || "unknown"}`;
}

function buildCorrelationKey({ category, vendor, product, actor, campaign, cveIds }) {
  if (safeArray(cveIds).length > 0) {
    return safeArray(cveIds).slice(0, 3).join("+");
  }
  if (actor || campaign) {
    return [actor, campaign].filter(Boolean).map((value) => slugify(value)).join("+");
  }
  return [category, vendor, product].filter(Boolean).map((value) => slugify(value)).join("+");
}

function computeConfidence(source, details) {
  const baseByType = {
    "official-catalog": 0.94,
    "official-advisory": 0.9,
    "national-vulnerability-database": 0.88,
    "vendor-advisory": 0.84,
    "security-research": 0.76,
    "security-news": 0.7,
    "status-feed": 0.82,
    sample: 0.55
  };

  let confidence = baseByType[source.sourceType] || 0.7;
  if (details.cveIds.length > 0) {
    confidence += 0.04;
  }
  if (details.vendor) {
    confidence += 0.02;
  }
  if (!details.summary) {
    confidence -= 0.1;
  }
  return clamp(confidence, 0.25, 0.99);
}

function createEvent(source, rawRecord, overrides = {}, context = {}) {
  const discoveredAt = toIso(overrides.discovered_at || context.generatedAt, new Date().toISOString());
  const title = cleanText(overrides.title || rawRecord.title || rawRecord.name || rawRecord.DocumentTitle || rawRecord.Alias || rawRecord.ID || "Untitled event");
  const summary = safeSummary(
    overrides.summary
      || rawRecord.summary
      || rawRecord.description
      || rawRecord.problem?.[0]?.value
      || rawRecord.solution?.[0]?.value
      || rawRecord.shortDescription
      || rawRecord.abstract,
    title
  );
  const url = normalizeUrl(
    overrides.url
      || rawRecord.url
      || rawRecord.link
      || rawRecord.guid
      || rawRecord.CvrfUrl
      || `${source.url || ""}`,
    source.url || ""
  );
  const publishedAt = toIso(
    overrides.published_at
      || rawRecord.published
      || rawRecord.updated
      || rawRecord.date
      || rawRecord.pubDate
      || rawRecord.CurrentReleaseDate
      || rawRecord.InitialReleaseDate
      || rawRecord.cisaExploitAdd
      || rawRecord.dateAdded,
    discoveredAt
  );

  const combinedText = [
    title,
    summary,
    rawRecord.vendorProject,
    rawRecord.product,
    rawRecord.source,
    source.label
  ].filter(Boolean).join(" ");

  const cveIds = unique([
    ...safeArray(overrides.cve_ids),
    ...safeArray(rawRecord.cve_ids),
    ...extractCveIds(combinedText),
    ...safeArray(rawRecord.cveID).map((value) => String(value || "").toUpperCase())
  ]);

  const vendor = canonicalizeVendor(
    overrides.vendor
      || rawRecord.vendor
      || rawRecord.vendorProject
      || source.vendor
      || detectVendor(combinedText)
  );

  const product = detectProduct(title, summary, vendor, overrides.product || rawRecord.product || safeArray(rawRecord.product)[0]);
  const actor = cleanText(overrides.actor || rawRecord.actor || detectActor(combinedText));
  const campaign = cleanText(overrides.campaign || rawRecord.campaign || detectCampaign(combinedText));
  const category = cleanText(overrides.category || source.category || "news");
  const sourceType = cleanText(overrides.source_type || source.sourceType || "unknown");
  const severity = normalizeSeverity(
    overrides.severity
      || rawRecord.severity
      || rawRecord.baseSeverity
      || rawRecord.Severity
      || inferSeverityFromText(`${title} ${summary}`, category === "outage" ? "HIGH" : "MEDIUM")
  );
  const victimRegion = cleanText(overrides.victim_region || rawRecord.victim_region || inferVictimRegion(combinedText));
  const geo = resolveGeo({
    vendor,
    victimRegion,
    latitude: overrides.latitude || rawRecord.latitude,
    longitude: overrides.longitude || rawRecord.longitude
  });

  const event = {
    id: cleanText(overrides.id || rawRecord.id || rawRecord.ID || stableId(source.key, [title, url, publishedAt, vendor, product, cveIds.join("|")])),
    source: source.label,
    source_key: source.key,
    source_type: sourceType,
    title,
    summary,
    url,
    published_at: publishedAt,
    discovered_at: discoveredAt,
    severity,
    confidence: overrides.confidence ?? computeConfidence(source, { vendor, summary, cveIds }),
    category,
    tags: buildTags({
      source: source.label,
      panel: source.panel,
      category,
      severity,
      vendor,
      product,
      actor,
      campaign,
      cveIds,
      extraTags: overrides.tags || rawRecord.tags
    }),
    vendor,
    product,
    cve_ids: cveIds,
    campaign,
    actor,
    victim_region: victimRegion,
    latitude: geo.latitude,
    longitude: geo.longitude,
    geo_precision: geo.geoPrecision,
    incident_key: "",
    correlation_key: "",
    related_sources: [],
    related_event_ids: [],
    raw_hash: stableHash(JSON.stringify(rawRecord || {})),
    panel: source.panel
  };

  event.incident_key = buildIncidentKey({
    category: event.category,
    vendor: event.vendor,
    product: event.product,
    actor: event.actor,
    campaign: event.campaign,
    cveIds: event.cve_ids,
    title: event.title
  });
  event.correlation_key = buildCorrelationKey({
    category: event.category,
    vendor: event.vendor,
    product: event.product,
    actor: event.actor,
    campaign: event.campaign,
    cveIds: event.cve_ids
  });

  return event;
}

module.exports = {
  cleanText,
  createEvent,
  extractCveIds,
  maxSeverity,
  normalizeSeverity,
  normalizeUrl,
  safeArray,
  safeSummary,
  SEVERITY_SCALE,
  severityWeight,
  slugify,
  stableId,
  stableHash,
  toIso,
  tokenize,
  unique
};
