const DEFAULT_VENDOR_KEYWORDS = [
  "microsoft",
  "google",
  "apple",
  "cisco",
  "vmware",
  "ivanti",
  "fortinet",
  "palo alto",
  "crowdstrike",
  "okta",
  "cloudflare",
  "oracle",
  "github",
  "openai",
  "atlassian",
  "adobe",
  "aws",
  "amazon",
  "meta",
  "intel",
  "amd",
  "dell",
  "discord",
  "slack",
  "heroku"
];

const SEVERITY_VALUES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDate(value, fallbackDate = new Date()) {
  const parsed = Date.parse(String(value || "").trim());
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return fallbackDate.toISOString();
}

function normalizeSeverity(value, fallback = "MEDIUM") {
  const upper = String(value || "").trim().toUpperCase();
  if (SEVERITY_VALUES.has(upper)) {
    return upper;
  }
  if (upper === "MED") {
    return "MEDIUM";
  }
  return fallback;
}

function normalizeUrl(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    return new URL(raw).toString();
  } catch (_error) {
    return fallback;
  }
}

function safeSummary(value, fallback = "No summary provided.", maxLength = 320) {
  const text = String(value || "").trim();
  if (!text) {
    return fallback;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildStableId(prefix, parts) {
  const base = parts.map((part) => String(part || "")).join("|");
  let hash = 5381;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 33) ^ base.charCodeAt(index);
  }
  const unsigned = hash >>> 0;
  return `${prefix}-${unsigned.toString(16).padStart(8, "0")}`;
}

function dedupeBy(items, selectors) {
  const selectorList = Array.isArray(selectors) ? selectors : [];
  const seen = selectorList.map(() => new Set());
  const unique = [];

  items.forEach((item) => {
    let duplicate = false;
    selectorList.forEach((selector, selectorIndex) => {
      if (duplicate || typeof selector !== "function") {
        return;
      }
      const key = selector(item);
      if (!key) {
        return;
      }
      const normalizedKey = String(key).trim().toLowerCase();
      if (!normalizedKey) {
        return;
      }
      if (seen[selectorIndex].has(normalizedKey)) {
        duplicate = true;
      }
    });

    if (duplicate) {
      return;
    }

    selectorList.forEach((selector, selectorIndex) => {
      if (typeof selector !== "function") {
        return;
      }
      const key = selector(item);
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (normalizedKey) {
        seen[selectorIndex].add(normalizedKey);
      }
    });

    unique.push(item);
  });

  return unique;
}

function inferVendorFromText(textValue, vendorKeywords = DEFAULT_VENDOR_KEYWORDS) {
  const text = String(textValue || "").toLowerCase();
  const found = vendorKeywords.find((vendor) => text.includes(vendor));
  return found ? toTitleCase(found) : "";
}

function extractKeywordTags(textValue, keywords) {
  const text = String(textValue || "").toLowerCase();
  const source = Array.isArray(keywords) ? keywords : [];
  const tags = new Set();

  source.forEach((keyword) => {
    const normalized = String(keyword || "").toLowerCase().trim();
    if (!normalized) {
      return;
    }
    const needle = normalized.replace(/-/g, " ");
    if (text.includes(needle) || text.includes(normalized)) {
      tags.add(normalized);
    }
  });

  return Array.from(tags);
}

function inferSeverityByKeywords(textValue, rules, fallback = "MEDIUM") {
  const text = String(textValue || "").toLowerCase();
  const normalizedRules = rules && typeof rules === "object" ? rules : {};

  const critical = Array.isArray(normalizedRules.critical) ? normalizedRules.critical : [];
  if (critical.some((token) => text.includes(String(token).toLowerCase()))) {
    return "CRITICAL";
  }

  const high = Array.isArray(normalizedRules.high) ? normalizedRules.high : [];
  if (high.some((token) => text.includes(String(token).toLowerCase()))) {
    return "HIGH";
  }

  const medium = Array.isArray(normalizedRules.medium) ? normalizedRules.medium : [];
  if (medium.some((token) => text.includes(String(token).toLowerCase()))) {
    return "MEDIUM";
  }

  return normalizeSeverity(fallback, "MEDIUM");
}

module.exports = {
  DEFAULT_VENDOR_KEYWORDS,
  buildStableId,
  dedupeBy,
  extractKeywordTags,
  getArgValue,
  inferSeverityByKeywords,
  inferVendorFromText,
  normalizeDate,
  normalizeSeverity,
  normalizeUrl,
  safeSummary,
  slugify,
  toTitleCase
};
