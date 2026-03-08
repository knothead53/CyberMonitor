#!/usr/bin/env node

const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const { NEWS_FEEDS, OUTAGE_FEEDS } = require("./adapters/sources");
const { slugify } = require("./adapters/lib/normalize");

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

async function readFeedSnapshot(step, fallbackTimestamp) {
  try {
    const raw = await fs.readFile(step.outputPath, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [];
    const publishedDates = items
      .map((item) => toIsoOrNull(item?.published))
      .filter(Boolean);

    const updatedAt = publishedDates.length > 0
      ? publishedDates.reduce((latest, current) => (
          Date.parse(current) > Date.parse(latest) ? current : latest
        ))
      : fallbackTimestamp;

    return {
      exists: true,
      itemCount: items.length,
      updatedAt
    };
  } catch (_error) {
    return {
      exists: false,
      itemCount: 0,
      updatedAt: fallbackTimestamp
    };
  }
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

function buildHealthFeedEntry(status, message, lastSuccessAt) {
  return {
    status,
    message,
    lastSuccessAt: lastSuccessAt || null
  };
}

async function runFeedSafely(step, runTimestamp) {
  const startTime = Date.now();
  try {
    await runNodeScript(step.scriptPath);
    const snapshot = await readFeedSnapshot(step, runTimestamp);
    const durationMs = Date.now() - startTime;
    const message = `Loaded ${snapshot.itemCount} entries in ${durationMs}ms`;
    return {
      feedKey: step.key,
      snapshot,
      metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "ok"),
      health: buildHealthFeedEntry("ok", message, runTimestamp)
    };
  } catch (error) {
    const snapshot = await readFeedSnapshot(step, runTimestamp);
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (snapshot.exists) {
      const message = `Adapter error after ${durationMs}ms; using existing output (${snapshot.itemCount} entries): ${errorMessage}`;
      return {
        feedKey: step.key,
        snapshot,
        metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "warning"),
        health: buildHealthFeedEntry("warning", message, snapshot.updatedAt)
      };
    }

    const message = `Adapter error after ${durationMs}ms and no generated output is available: ${errorMessage}`;
    return {
      feedKey: step.key,
      snapshot,
      metadata: buildMetadataFeedEntry(step, snapshot, runTimestamp, "error"),
      health: buildHealthFeedEntry("error", message, null)
    };
  }
}

async function writeJsonFile(outputPath, payload) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getStep(feedKey) {
  return ADAPTER_STEPS.find((step) => step.key === feedKey) || null;
}

async function readFeedItems(feedKey) {
  const step = getStep(feedKey);
  if (!step) {
    return [];
  }

  try {
    const raw = await fs.readFile(step.outputPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
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
    readFeedItems("kev"),
    readFeedItems("news"),
    readFeedItems("outages")
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
    const result = await runFeedSafely(step, runTimestamp);
    results.push(result);
    console.log(`[${step.key}] ${result.health.status.toUpperCase()}: ${result.health.message}`);
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
