#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const CISA_KEV_CATALOG_URL = "https://www.cisa.gov/known-exploited-vulnerabilities-catalog";
const DEFAULT_INPUT_PATH = null;
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/kev.json");
const DEFAULT_SOURCE = "CISA KEV Catalog";
const DEFAULT_LIMIT = 0;

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1];
}

function normalizeDate(value, fallbackDate = new Date()) {
  const parsed = Date.parse(String(value || "").trim());
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return fallbackDate.toISOString();
}

function normalizeSummary(value, fallbackValue = "No summary provided.") {
  const summary = String(value || "").trim();
  if (summary.length > 0) {
    return summary;
  }
  return fallbackValue;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractNoteUrls(notesValue) {
  const text = String(notesValue || "");
  if (!text) {
    return [];
  }

  return text.match(/https?:\/\/[^\s;]+/g) || [];
}

function inferSeverity(entry) {
  const ransomware = String(entry?.knownRansomwareCampaignUse || "").trim().toLowerCase();
  if (ransomware === "known") {
    return "CRITICAL";
  }

  const haystack = [
    entry?.vulnerabilityName,
    entry?.shortDescription,
    entry?.requiredAction,
    entry?.product
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  const criticalPatterns = [
    "remote code execution",
    "arbitrary code execution",
    "authentication bypass",
    "improper authentication",
    "unauthenticated",
    "deserialization",
    "command injection"
  ];
  if (criticalPatterns.some((token) => haystack.includes(token))) {
    return "CRITICAL";
  }

  const highPatterns = [
    "privilege escalation",
    "sql injection",
    "path traversal",
    "out-of-bounds",
    "memory corruption",
    "use-after-free",
    "cross-site scripting"
  ];
  if (highPatterns.some((token) => haystack.includes(token))) {
    return "HIGH";
  }

  const mediumPatterns = ["denial of service", "dos", "information disclosure", "sensitive information"];
  if (mediumPatterns.some((token) => haystack.includes(token))) {
    return "MEDIUM";
  }

  // KEV entries are actively exploited; default to HIGH when no strong signal exists.
  return "HIGH";
}

function normalizeVendor(value) {
  const normalized = String(value || "").trim();
  return normalized || "Unknown";
}

function pickEntryUrl(entry) {
  const noteUrls = extractNoteUrls(entry?.notes);
  if (noteUrls.length > 0) {
    return noteUrls[0];
  }

  const cve = String(entry?.cveID || "").trim();
  if (cve) {
    return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`;
  }

  return CISA_KEV_CATALOG_URL;
}

function normalizeTitle(entry, cveId) {
  const name = String(entry?.vulnerabilityName || "").trim();
  if (cveId && name) {
    return `${cveId} - ${name}`;
  }
  if (name) {
    return name;
  }
  if (cveId) {
    return cveId;
  }
  return "Known exploited vulnerability";
}

function normalizeTags(entry, severity, cveId, vendor) {
  const tags = new Set();
  tags.add("kev");
  tags.add(severity.toLowerCase());
  if (cveId) {
    tags.add(cveId.toLowerCase());
  }
  if (vendor && vendor !== "Unknown") {
    tags.add(slugify(vendor));
  }

  const productTag = slugify(entry?.product);
  if (productTag) {
    tags.add(productTag);
  }

  const cwes = Array.isArray(entry?.cwes) ? entry.cwes : [];
  cwes.forEach((cwe) => {
    const normalized = slugify(cwe);
    if (normalized) {
      tags.add(normalized);
    }
  });

  if (String(entry?.knownRansomwareCampaignUse || "").trim().toLowerCase() === "known") {
    tags.add("known-ransomware-campaign-use");
  }

  return Array.from(tags);
}

function normalizeItems(payload) {
  if (payload && Array.isArray(payload.vulnerabilities)) {
    return payload.vulnerabilities;
  }
  return [];
}

function normalizeRow(row, index) {
  const cveId = String(row?.cveID || "").trim();
  const vendor = normalizeVendor(row?.vendorProject);
  const severity = inferSeverity(row);
  const title = normalizeTitle(row, cveId);
  const summary = normalizeSummary(row?.shortDescription, normalizeSummary(row?.requiredAction, title));
  const published = normalizeDate(row?.dateAdded);

  const normalized = {
    id: cveId || `kev-${String(index + 1).padStart(5, "0")}`,
    title,
    source: String(row?.source || DEFAULT_SOURCE),
    published,
    url: pickEntryUrl(row),
    summary,
    severity,
    vendor,
    tags: normalizeTags(row, severity, cveId, vendor)
  };

  if (cveId) {
    normalized.cve = cveId;
  }
  if (row?.product) {
    normalized.product = String(row.product).trim();
  }
  if (row?.dueDate) {
    normalized.dueDate = normalizeDate(row.dueDate, new Date(published));
  }
  if (row?.knownRansomwareCampaignUse) {
    normalized.knownRansomwareCampaignUse = String(row.knownRansomwareCampaignUse).trim();
  }
  const cwes = Array.isArray(row?.cwes) ? row.cwes.filter(Boolean).map((value) => String(value)) : [];
  if (cwes.length > 0) {
    normalized.cwes = cwes;
  }

  return normalized;
}

async function loadRawInput(inputPath, sourceUrl) {
  if (inputPath) {
    const raw = await fs.readFile(inputPath, "utf8");
    return JSON.parse(raw);
  }

  const response = await fetch(sourceUrl, { headers: { "User-Agent": "CyberMonitor-KEV-Adapter/1.3" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch KEV feed (${response.status})`);
  }
  return response.json();
}

async function main() {
  const inputArg = getArgValue("--input");
  const inputPath = inputArg ? path.resolve(process.cwd(), inputArg) : DEFAULT_INPUT_PATH;
  const outputPath = path.resolve(process.cwd(), getArgValue("--output") || DEFAULT_OUTPUT_PATH);
  const sourceUrl = getArgValue("--source-url") || CISA_KEV_URL;
  const limitArg = getArgValue("--limit");
  const parsedLimit = Number.parseInt(String(limitArg || DEFAULT_LIMIT), 10);
  const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;

  const parsed = await loadRawInput(inputPath, sourceUrl);

  const normalizedRows = normalizeItems(parsed)
    .map((row, index) => normalizeRow(row, index))
    .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""));
  const normalized = effectiveLimit > 0 ? normalizedRows.slice(0, effectiveLimit) : normalizedRows;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  if (inputPath) {
    console.log(`Loaded KEV source from local input: ${inputPath}`);
  } else {
    console.log(`Loaded KEV source from CISA feed: ${sourceUrl}`);
  }
  if (effectiveLimit > 0) {
    console.log(`Applied limit: ${effectiveLimit} entries`);
  }
  console.log(`Wrote ${normalized.length} KEV entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(`kev_adapter failed: ${error.message}`);
  process.exit(1);
});
