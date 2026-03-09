#!/usr/bin/env node

const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const { NEWS_FEEDS, OUTAGE_FEEDS } = require("./adapters/sources");
const {
  buildStableId,
  normalizeSeverity,
  normalizeUrl,
  safeSummary,
  slugify
} = require("./adapters/lib/normalize");

const ADAPTER_STEPS = [
  {
    key: "kev",
    label: "CISA KEV adapter",
    scriptPath: path.resolve(__dirname, "adapters/kev_adapter.js"),
    outputPath: path.resolve(process.cwd(), "data/kev.json"),
    sources: ["CISA KEV"]
  },
  {
    key: "news",
    label: "Security news adapter",
    scriptPath: path.resolve(__dirname, "adapters/news_adapter.js"),
    outputPath: path.resolve(process.cwd(), "data/news.json"),
    sources: NEWS_FEEDS.map((feed) => feed.source)
  },
  {
    key: "outages",
    label: "Outages adapter",
    scriptPath: path.resolve(__dirname, "adapters/outages_adapter.js"),
    outputPath: path.resolve(process.cwd(), "data/outages.json"),
    sources: OUTAGE_FEEDS.map((feed) => feed.source)
  }
];

const METADATA_OUTPUT_PATH = path.resolve(process.cwd(), "data/feed-metadata.json");
const HEALTH_OUTPUT_PATH = path.resolve(process.cwd(), "data/feed-health.json");
const MAP_CORRELATED_OUTPUT_PATH = path.resolve(process.cwd(), "data/map.correlated.json");

const SEVERITY_RANK = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

const REGION_PROFILES = [
  {
    key: "north-america",
    name: "North America",
    lat: 39.8283,
    lon: -98.5795,
    keywords: [
      "north america",
      "united states",
      "us",
      "canada",
      "microsoft",
      "google",
      "amazon",
      "aws",
      "github",
      "openai",
      "cloudflare",
      "okta",
      "oracle",
      "cisco",
      "intel",
      "amd",
      "dell",
      "twilio"
    ]
  },
  {
    key: "europe",
    name: "Europe",
    lat: 50.1109,
    lon: 8.6821,
    keywords: [
      "europe",
      "eu",
      "uk",
      "ireland",
      "germany",
      "france",
      "netherlands",
      "gitlab",
      "atlassian"
    ]
  },
  {
    key: "apac",
    name: "APAC",
    lat: 1.3521,
    lon: 103.8198,
    keywords: ["apac", "asia", "singapore", "japan", "australia", "india"]
  },
  {
    key: "latam",
    name: "LATAM",
    lat: -23.5505,
    lon: -46.6333,
    keywords: ["latam", "south america", "brazil", "mexico"]
  },
  {
    key: "middle-east-africa",
    name: "Middle East & Africa",
    lat: 25.2048,
    lon: 55.2708,
    keywords: ["middle east", "mea", "africa", "uae"]
  }
];

const DEFAULT_REGION_PROFILE = {
  key: "global",
  name: "Global",
  lat: 20,
  lon: 0
};
const VALIDATION_WARNING_RATIO = 0.25;

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1];
}

function parseOnlyList(value) {
  if (!value) {
    return null;
  }
  const parsed = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      cwd: process.cwd()
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Adapter failed with exit code ${code}`));
    });
  });
}

function toIsoOrNull(value) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return null;
}

function normalizeSeverityValue(value) {
  const upper = String(value || "").trim().toUpperCase();
  if (upper === "MED") {
    return "MEDIUM";
  }
  if (SEVERITY_RANK[upper]) {
    return upper;
  }
  return "MEDIUM";
}

function maxSeverity(left, right) {
  const a = normalizeSeverityValue(left);
  const b = normalizeSeverityValue(right);
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function pickLatestTimestamp(current, candidate, fallbackTimestamp) {
  const next = toIsoOrNull(candidate) || fallbackTimestamp;
  if (!current) {
    return next;
  }
  return Date.parse(next) > Date.parse(current) ? next : current;
}

function resolveRegionForText(value) {
  const text = String(value || "").toLowerCase();
  const matched = REGION_PROFILES.find((profile) => (
    profile.keywords.some((keyword) => text.includes(keyword))
  ));
  return matched || DEFAULT_REGION_PROFILE;
}

function compareGroupsByCountAndTime(left, right) {
  if (right.count !== left.count) {
    return right.count - left.count;
  }
  return Date.parse(right.latest || "") - Date.parse(left.latest || "");
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortByNewest(items, dateField = "published") {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.[dateField] || "");
    const rightTime = Date.parse(right?.[dateField] || "");
    return rightTime - leftTime;
  });
}

async function readFeedOutput(step) {
  try {
    const raw = await fs.readFile(step.outputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        exists: true,
        isValidJson: true,
        isValidArray: false,
        items: [],
        error: "Generated output is not an array."
      };
    }

    return {
      exists: true,
      isValidJson: true,
      isValidArray: true,
      items: parsed,
      error: null
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        exists: false,
        isValidJson: false,
        isValidArray: false,
        items: [],
        error: "Generated output not found."
      };
    }

    return {
      exists: true,
      isValidJson: false,
      isValidArray: false,
      items: [],
      error: error instanceof Error ? error.message : "Unable to read generated output."
    };
  }
}

function dedupeItems(items) {
  const seenById = new Set();
  const seenByUrl = new Set();
  const seenByFallback = new Set();
  const unique = [];
  let dedupedCount = 0;

  items.forEach((item) => {
    const idKey = String(item?.id || "").trim().toLowerCase();
    const urlKey = String(item?.url || "").trim().toLowerCase();
    const titleKey = String(item?.title || "").trim().toLowerCase();
    const sourceKey = String(item?.source || "").trim().toLowerCase();
    const publishedKey = String(item?.published || "").trim().toLowerCase();
    const fallbackKey = titleKey ? `${titleKey}|${sourceKey}|${publishedKey}` : "";

    let duplicate = false;
    if (idKey) {
      duplicate = seenById.has(idKey);
    } else if (urlKey) {
      duplicate = seenByUrl.has(urlKey);
    } else if (fallbackKey) {
      duplicate = seenByFallback.has(fallbackKey);
    }

    if (duplicate) {
      dedupedCount += 1;
      return;
    }

    if (idKey) {
      seenById.add(idKey);
    } else if (urlKey) {
      seenByUrl.add(urlKey);
    } else if (fallbackKey) {
      seenByFallback.add(fallbackKey);
    }
    unique.push(item);
  });

  return {
    items: unique,
    dedupedCount
  };
}

function normalizeTagList(value, fallbackTags = []) {
  const tags = new Set();

  if (Array.isArray(value)) {
    value.forEach((tag) => {
      const normalized = slugify(String(tag || "").trim());
      if (normalized) {
        tags.add(normalized);
      }
    });
  } else if (typeof value === "string") {
    value.split(",").forEach((tag) => {
      const normalized = slugify(String(tag || "").trim());
      if (normalized) {
        tags.add(normalized);
      }
    });
  }

  fallbackTags.forEach((tag) => {
    const normalized = slugify(String(tag || "").trim());
    if (normalized) {
      tags.add(normalized);
    }
  });

  return Array.from(tags);
}

function validateNormalizedItem(rawItem, step, index, runTimestamp) {
  const warnings = [];
  const errors = [];

  if (!isObjectRecord(rawItem)) {
    return {
      valid: false,
      repaired: false,
      item: null,
      warnings,
      errors: ["Item is not an object record."]
    };
  }

  const source = String(rawItem.source || step.sources[0] || step.label || "").trim();
  if (!source) {
    errors.push("Missing source.");
  }

  let title = String(rawItem.title || "").trim();
  if (!title) {
    title = "Untitled event";
    warnings.push("Missing title; applied fallback title.");
  }

  const publishedRaw = rawItem.published || rawItem.timestamp || "";
  const published = toIsoOrNull(publishedRaw) || runTimestamp;
  if (!toIsoOrNull(publishedRaw)) {
    warnings.push("Invalid published timestamp; used generation timestamp.");
  }

  let url = normalizeUrl(rawItem.url || rawItem.link || "", "");
  if (!url) {
    url = "https://example.com";
    warnings.push("Missing/invalid URL; used placeholder URL.");
  }

  const rawSummary = rawItem.summary || rawItem.description || "";
  const summary = safeSummary(rawSummary, "No summary provided.", step.key === "outages" ? 360 : 320);
  if (!String(rawSummary || "").trim()) {
    warnings.push("Missing summary; used default summary.");
  }

  const severity = normalizeSeverity(rawItem.severity || rawItem.level || rawItem.priority, "MEDIUM");
  const vendor = String(rawItem.vendor || "").trim() || "Unknown";
  if (!String(rawItem.vendor || "").trim()) {
    warnings.push("Missing vendor; set to Unknown.");
  }

  let id = String(rawItem.id || "").trim();
  if (!id) {
    id = buildStableId(step.key, [source, url, title, published, index]);
    warnings.push("Missing id; generated stable id.");
  }

  const tags = normalizeTagList(rawItem.tags, [step.key, severity.toLowerCase(), slugify(source)]);
  if (tags.length === 0) {
    warnings.push("No tags detected; tag fallback applied.");
  }

  if (title === "Untitled event" && summary === "No summary provided.") {
    errors.push("Item lacks usable title and summary content.");
  }

  const normalizedItem = {
    id,
    title,
    source,
    published,
    url,
    summary,
    severity,
    vendor,
    tags
  };

  return {
    valid: errors.length === 0,
    repaired: warnings.length > 0,
    item: normalizedItem,
    warnings,
    errors
  };
}

function filterInvalidItems(rawItems, step, runTimestamp) {
  const rows = Array.isArray(rawItems) ? rawItems : [];
  const accepted = [];
  const issues = [];
  let invalidCount = 0;
  let repairedCount = 0;

  rows.forEach((rawItem, index) => {
    const result = validateNormalizedItem(rawItem, step, index, runTimestamp);
    if (!result.valid || !result.item) {
      invalidCount += 1;
      issues.push(`item #${index + 1}: ${result.errors.join(" ")}`);
      return;
    }

    if (result.repaired) {
      repairedCount += 1;
      issues.push(`item #${index + 1}: ${result.warnings.join(" ")}`);
    }

    accepted.push(result.item);
  });

  const deduped = dedupeItems(accepted);
  const sorted = sortByNewest(deduped.items, "published");

  return {
    items: sorted,
    totalRead: rows.length,
    validCount: sorted.length,
    invalidCount,
    repairedCount,
    dedupedCount: deduped.dedupedCount,
    issueCount: issues.length,
    sampleIssues: issues.slice(0, 5)
  };
}

function shouldEscalateValidation(report) {
  if (!report || report.totalRead === 0) {
    return false;
  }
  return (report.invalidCount / report.totalRead) >= VALIDATION_WARNING_RATIO;
}

async function readFeedSnapshot(step, fallbackTimestamp) {
  const output = await readFeedOutput(step);
  if (!output.exists || !output.isValidJson || !output.isValidArray) {
    return {
      exists: false,
      itemCount: 0,
      updatedAt: fallbackTimestamp
    };
  }

  const publishedDates = output.items
    .map((item) => toIsoOrNull(item?.published))
    .filter(Boolean);

  const updatedAt = publishedDates.length > 0
    ? publishedDates.reduce((latest, current) => (
        Date.parse(current) > Date.parse(latest) ? current : latest
      ))
    : fallbackTimestamp;

  return {
    exists: true,
    itemCount: output.items.length,
    updatedAt
  };
}

function determineOverallHealth(feedStatuses) {
  const statuses = Object.values(feedStatuses);
  if (statuses.some((status) => status === "error")) {
    return "error";
  }
  if (statuses.some((status) => status === "warning")) {
    return "warning";
  }
  return "ok";
}

function buildMetadataFeedEntry(step, snapshot, runTimestamp, healthStatus) {
  return {
    updatedAt: snapshot.updatedAt || runTimestamp,
    itemCount: snapshot.itemCount,
    mode: snapshot.exists ? "generated" : "sample-fallback",
    sources: step.sources,
    status: healthStatus
  };
}

function buildHealthFeedEntry(status, message, lastSuccessAt, validation) {
  return {
    status,
    message,
    lastSuccessAt: lastSuccessAt || null,
    validation: validation || null
  };
}

async function safeRunAdapter(step, runTimestamp) {
  const startTime = Date.now();
  const previousOutput = await readFeedOutput(step);
  let adapterError = null;

  try {
    await runNodeScript(step.scriptPath);
  } catch (error) {
    adapterError = error;
  }

  const adapterOutput = await readFeedOutput(step);
  let selectedItems = [];
  let selectedFromPrevious = false;
  const notes = [];
  const adapterErrorMessage = adapterError instanceof Error ? adapterError.message : String(adapterError || "");

  if (!adapterError && adapterOutput.exists && adapterOutput.isValidJson && adapterOutput.isValidArray) {
    selectedItems = adapterOutput.items;
  } else if (previousOutput.exists && previousOutput.isValidJson && previousOutput.isValidArray) {
    selectedItems = previousOutput.items;
    selectedFromPrevious = true;
    if (adapterErrorMessage) {
      notes.push(`adapter error: ${adapterErrorMessage}`);
    } else if (!adapterOutput.isValidJson || !adapterOutput.isValidArray) {
      notes.push(`adapter wrote invalid output: ${adapterOutput.error}`);
    }
  } else {
    if (adapterErrorMessage) {
      notes.push(`adapter error: ${adapterErrorMessage}`);
    }
    if (adapterOutput.exists && (!adapterOutput.isValidJson || !adapterOutput.isValidArray)) {
      notes.push(`invalid output: ${adapterOutput.error}`);
    }
  }

  let validationReport = filterInvalidItems(selectedItems, step, runTimestamp);
  if (validationReport.validCount === 0 && validationReport.totalRead > 0 && previousOutput.isValidArray && previousOutput.items.length > 0 && !selectedFromPrevious) {
    const previousValidation = filterInvalidItems(previousOutput.items, step, runTimestamp);
    if (previousValidation.validCount > 0) {
      validationReport = previousValidation;
      selectedFromPrevious = true;
      notes.push(`adapter output failed validation; restored previous validated output (${previousValidation.validCount} items).`);
    }
  }

  if (validationReport.sampleIssues.length > 0) {
    console.warn(`[${step.key}] Validation notices: ${validationReport.sampleIssues.join(" | ")}`);
  }

  let wroteOutput = false;
  let removedOutput = false;
  if (validationReport.items.length > 0) {
    await writeJsonFile(step.outputPath, validationReport.items);
    wroteOutput = true;
  } else if (!selectedFromPrevious && adapterOutput.exists && (!adapterOutput.isValidJson || !adapterOutput.isValidArray)) {
    await removeFileIfExists(step.outputPath);
    removedOutput = true;
    notes.push("removed malformed generated output to avoid persisting corrupt artifacts.");
  } else if (validationReport.totalRead > 0) {
    await removeFileIfExists(step.outputPath);
    removedOutput = true;
    notes.push("removed unusable generated output to preserve sample fallback behavior.");
  }

  const snapshot = await readFeedSnapshot(step, runTimestamp);
  const durationMs = Date.now() - startTime;
  const hasGeneratedOutput = snapshot.exists;
  const warningFromValidation = shouldEscalateValidation(validationReport);

  const validationSummary = {
    totalRead: validationReport.totalRead,
    validCount: validationReport.validCount,
    invalidCount: validationReport.invalidCount,
    repairedCount: validationReport.repairedCount,
    dedupedCount: validationReport.dedupedCount,
    issueCount: validationReport.issueCount
  };

  if (adapterError && !hasGeneratedOutput) {
    const message = `Adapter failed after ${durationMs}ms and no usable output was available. ${notes.join(" ")}`.trim();
    return {
      feedKey: step.key,
      snapshot,
      metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "error"),
      health: buildHealthFeedEntry("error", message, null, validationSummary),
      generation: {
        durationMs,
        wroteOutput,
        removedOutput,
        usedPreviousOutput: selectedFromPrevious,
        adapterFailed: true,
        validation: validationSummary
      }
    };
  }

  if (adapterError || selectedFromPrevious || warningFromValidation) {
    const message = [
      `Completed with warnings in ${durationMs}ms.`,
      `Accepted ${validationReport.validCount}/${validationReport.totalRead} items.`,
      notes.join(" ")
    ]
      .filter(Boolean)
      .join(" ");

    return {
      feedKey: step.key,
      snapshot,
      metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "warning"),
      health: buildHealthFeedEntry("warning", message, snapshot.updatedAt || runTimestamp, validationSummary),
      generation: {
        durationMs,
        wroteOutput,
        removedOutput,
        usedPreviousOutput: selectedFromPrevious,
        adapterFailed: Boolean(adapterError),
        validation: validationSummary
      }
    };
  }

  const message = `Loaded ${snapshot.itemCount} entries in ${durationMs}ms.`;
  return {
    feedKey: step.key,
    snapshot,
    metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "ok"),
    health: buildHealthFeedEntry("ok", message, snapshot.updatedAt || runTimestamp, validationSummary),
    generation: {
      durationMs,
      wroteOutput,
      removedOutput,
      usedPreviousOutput: false,
      adapterFailed: false,
      validation: validationSummary
    }
  };
}

function buildGenerationSummary(results) {
  const summary = {
    totalFeeds: results.length,
    ok: 0,
    warning: 0,
    error: 0
  };

  results.forEach((result) => {
    const status = result?.health?.status;
    if (status === "ok") {
      summary.ok += 1;
      return;
    }
    if (status === "warning") {
      summary.warning += 1;
      return;
    }
    if (status === "error") {
      summary.error += 1;
    }
  });

  return summary;
}

async function writeJsonFile(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function removeFileIfExists(outputPath) {
  try {
    await fs.rm(outputPath, { force: true });
  } catch (_error) {
    // non-fatal cleanup
  }
}

function getStep(feedKey) {
  return ADAPTER_STEPS.find((step) => step.key === feedKey) || null;
}

async function readFeedItems(feedKey, runTimestamp) {
  const step = getStep(feedKey);
  if (!step) {
    return [];
  }

  const output = await readFeedOutput(step);
  if (!output.exists || !output.isValidJson || !output.isValidArray) {
    return [];
  }

  return filterInvalidItems(output.items, step, runTimestamp || new Date().toISOString()).items;
}

function buildCloudRegionOverlays(newsItems, runTimestamp) {
  const grouped = new Map();

  newsItems.forEach((item) => {
    const combined = [item?.vendor, item?.source, item?.title, item?.summary].join(" ");
    const region = resolveRegionForText(combined);
    const key = region.key;

    if (!grouped.has(key)) {
      grouped.set(key, {
        region,
        count: 0,
        latest: null,
        severity: "MEDIUM",
        vendors: new Set(),
        sources: new Set()
      });
    }

    const bucket = grouped.get(key);
    bucket.count += 1;
    bucket.latest = pickLatestTimestamp(bucket.latest, item?.published, runTimestamp);
    bucket.severity = maxSeverity(bucket.severity, item?.severity);

    const vendor = String(item?.vendor || "").trim();
    if (vendor) {
      bucket.vendors.add(vendor);
    }

    const source = String(item?.source || "").trim();
    if (source) {
      bucket.sources.add(source);
    }
  });

  return Array.from(grouped.values())
    .sort(compareGroupsByCountAndTime)
    .slice(0, 8)
    .map((bucket) => {
      const vendors = Array.from(bucket.vendors).slice(0, 2).join(", ");
      const vendorSuffix = vendors ? `; vendors: ${vendors}` : "";
      return {
        id: `corr-cloud-${bucket.region.key}`,
        name: `${bucket.region.name} Threat Activity`,
        lat: bucket.region.lat,
        lon: bucket.region.lon,
        type: "cloud_region",
        severity: bucket.severity,
        timestamp: bucket.latest || runTimestamp,
        summary: `${bucket.count} correlated news signals from ${bucket.sources.size || 1} sources${vendorSuffix}.`
      };
    });
}

function buildMajorIncidentOverlays(kevItems, newsItems, runTimestamp) {
  const grouped = new Map();

  function ensureGroup(key, label, regionText) {
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label,
        region: resolveRegionForText(regionText),
        count: 0,
        kevCount: 0,
        newsCount: 0,
        latest: null,
        severity: "HIGH",
        sources: new Set()
      });
    }
    return grouped.get(key);
  }

  kevItems.forEach((item) => {
    const severity = normalizeSeverityValue(item?.severity);
    if (SEVERITY_RANK[severity] < SEVERITY_RANK.HIGH) {
      return;
    }

    const vendorRaw = String(item?.vendor || "").trim();
    const vendor = vendorRaw && vendorRaw.toLowerCase() !== "unknown" ? vendorRaw : "";
    const label = vendor || String(item?.source || "KEV Signals");
    const key = slugify(label) || "kev-signals";
    const group = ensureGroup(key, label, `${label} ${item?.source || ""} ${item?.product || ""}`);

    group.count += 1;
    group.kevCount += 1;
    group.latest = pickLatestTimestamp(group.latest, item?.published, runTimestamp);
    group.severity = maxSeverity(group.severity, severity);
    group.sources.add(String(item?.source || "CISA KEV"));
  });

  newsItems.forEach((item) => {
    const severity = normalizeSeverityValue(item?.severity);
    if (SEVERITY_RANK[severity] < SEVERITY_RANK.HIGH) {
      return;
    }

    const vendor = String(item?.vendor || "").trim();
    const label = vendor || String(item?.source || "Security News");
    const key = slugify(label) || "news-signals";
    const group = ensureGroup(key, label, `${label} ${item?.source || ""}`);

    group.count += 1;
    group.newsCount += 1;
    group.latest = pickLatestTimestamp(group.latest, item?.published, runTimestamp);
    group.severity = maxSeverity(group.severity, severity);
    group.sources.add(String(item?.source || "Security Feed"));
  });

  return Array.from(grouped.values())
    .sort(compareGroupsByCountAndTime)
    .slice(0, 10)
    .map((group) => ({
      id: `corr-incident-${group.key}`,
      name: `${group.label} Correlated Incident Activity`,
      lat: group.region.lat,
      lon: group.region.lon,
      type: "incident",
      severity: group.severity,
      timestamp: group.latest || runTimestamp,
      summary: `${group.kevCount} KEV and ${group.newsCount} high-severity news signals across ${group.sources.size || 1} sources.`
    }));
}

function buildOutageOverlays(outageItems, runTimestamp) {
  const grouped = new Map();

  outagesItemsLoop:
  for (const item of outageItems) {
    const severity = normalizeSeverityValue(item?.severity);
    if (SEVERITY_RANK[severity] < SEVERITY_RANK.MEDIUM) {
      continue outagesItemsLoop;
    }

    const vendor = String(item?.vendor || "").trim();
    const source = String(item?.source || "Status Feed").trim();
    const label = vendor || source;
    const key = slugify(label) || slugify(source) || "status-feed";
    const region = resolveRegionForText(`${label} ${source}`);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label,
        region,
        count: 0,
        latest: null,
        severity: "MEDIUM",
        sources: new Set()
      });
    }

    const bucket = grouped.get(key);
    bucket.count += 1;
    bucket.latest = pickLatestTimestamp(bucket.latest, item?.published, runTimestamp);
    bucket.severity = maxSeverity(bucket.severity, severity);
    if (source) {
      bucket.sources.add(source);
    }
  }

  return Array.from(grouped.values())
    .sort(compareGroupsByCountAndTime)
    .slice(0, 12)
    .map((bucket) => ({
      id: `corr-outage-${bucket.key}`,
      name: `${bucket.label} Service Disruption Signals`,
      lat: bucket.region.lat,
      lon: bucket.region.lon,
      type: "outage",
      severity: bucket.severity,
      timestamp: bucket.latest || runTimestamp,
      summary: `${bucket.count} correlated outage events from ${bucket.sources.size || 1} status feeds.`
    }));
}

async function buildCorrelatedMapPayload(runTimestamp) {
  const [kevItems, newsItems, outageItems] = await Promise.all([
    readFeedItems("kev", runTimestamp),
    readFeedItems("news", runTimestamp),
    readFeedItems("outages", runTimestamp)
  ]);

  return {
    generatedAt: runTimestamp,
    methodology:
      "Derived visualization from feed signals using deterministic vendor/source-to-region approximations. This is not authoritative geolocation intelligence.",
    cloud_regions: buildCloudRegionOverlays(newsItems, runTimestamp),
    major_incidents: buildMajorIncidentOverlays(kevItems, newsItems, runTimestamp),
    internet_outages: buildOutageOverlays(outageItems, runTimestamp)
  };
}

async function main() {
  const onlyList = parseOnlyList(getArgValue("--only"));
  const selectedSteps = onlyList
    ? ADAPTER_STEPS.filter((step) => onlyList.includes(step.key))
    : ADAPTER_STEPS;

  if (selectedSteps.length === 0) {
    throw new Error("No adapters selected. Valid values for --only are: kev,news,outages");
  }

  console.log("CyberMonitor feed generation started.");
  console.log(`Working directory: ${process.cwd()}`);
  const runTimestamp = new Date().toISOString();
  const results = [];

  for (const step of selectedSteps) {
    console.log(`\n[${step.key}] Running ${step.label}...`);
    const result = await safeRunAdapter(step, runTimestamp);
    results.push(result);
    console.log(`[${step.key}] ${result.health.status.toUpperCase()}: ${result.health.message}`);
    console.log(
      `[${step.key}] Validation: ${result.generation.validation.validCount} valid, ${result.generation.validation.invalidCount} invalid, ${result.generation.validation.dedupedCount} deduped`
    );
    console.log(`[${step.key}] Completed ${step.label}.`);
  }

  const metadataFeeds = {};
  const healthFeeds = {};
  results.forEach((result) => {
    metadataFeeds[result.feedKey] = result.metadata;
    healthFeeds[result.feedKey] = result.health;
  });

  const healthStatuses = results.reduce((acc, result) => {
    acc[result.feedKey] = result.health.status;
    return acc;
  }, {});
  const overallStatus = determineOverallHealth(healthStatuses);

  const metadataPayload = {
    generatedAt: runTimestamp,
    feeds: metadataFeeds
  };
  const healthPayload = {
    generatedAt: runTimestamp,
    overallStatus,
    feeds: healthFeeds
  };

  const correlatedMapPayload = await buildCorrelatedMapPayload(runTimestamp);

  await writeJsonFile(METADATA_OUTPUT_PATH, metadataPayload);
  await writeJsonFile(HEALTH_OUTPUT_PATH, healthPayload);
  await writeJsonFile(MAP_CORRELATED_OUTPUT_PATH, correlatedMapPayload);

  const generationSummary = buildGenerationSummary(results);
  console.log(
    `Generation summary: ${generationSummary.totalFeeds} feeds (${generationSummary.ok} ok, ${generationSummary.warning} warning, ${generationSummary.error} error)`
  );

  console.log(`Wrote feed metadata to ${METADATA_OUTPUT_PATH}`);
  console.log(`Wrote feed health report to ${HEALTH_OUTPUT_PATH}`);
  console.log(`Wrote correlated map overlays to ${MAP_CORRELATED_OUTPUT_PATH}`);
  console.log("\nFeed generation complete.");
  console.log("Generated files are available under data/*.json");
}

main().catch((error) => {
  console.error(`generate-feeds failed: ${error.message}`);
  process.exit(1);
});
