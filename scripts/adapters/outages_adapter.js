#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { parseRssItems, stripHtml } = require("./lib/rss");
const { OUTAGE_FEEDS } = require("./sources");
const {
  buildStableId,
  dedupeBy,
  extractKeywordTags,
  getArgValue,
  inferSeverityByKeywords,
  normalizeDate,
  normalizeUrl,
  safeSummary,
  slugify
} = require("./lib/normalize");

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/outages.json");
const DEFAULT_LIMIT = 160;
const USER_AGENT = "CyberMonitor-Outages-Adapter/1.4";

const OUTAGE_SEVERITY_RULES = {
  critical: ["major outage", "global outage", "service unavailable", "down", "widespread"],
  high: ["degraded availability", "incident", "errors", "failed", "latency", "partial outage"],
  medium: ["degraded performance", "investigating", "monitoring", "intermittent", "delay"]
};

const OUTAGE_KEYWORD_TAGS = [
  "incident",
  "degraded",
  "outage",
  "availability",
  "latency",
  "api",
  "login",
  "webhook",
  "chatgpt",
  "copilot"
];

function shouldSkipScheduled(rawItem) {
  const title = String(rawItem.title || "").toLowerCase();
  const summary = String(rawItem.summary || "").toLowerCase();
  if (rawItem.hasMaintenanceTag) {
    return true;
  }
  if (summary.includes("this is a scheduled event")) {
    return true;
  }
  if (summary.includes("scheduled maintenance")) {
    return true;
  }
  if (/ on \d{4}-\d{2}-\d{2}$/.test(title)) {
    return true;
  }
  return false;
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`${feed.source} request failed (${response.status})`);
  }

  const xml = await response.text();
  return parseRssItems(xml).map((item) => ({ ...item, source: feed.source, vendor: feed.vendor }));
}

function buildOutageTags(text, source, vendor, severity) {
  const tags = new Set(["outage", "status-feed", severity.toLowerCase(), slugify(source), slugify(vendor)]);
  extractKeywordTags(text, OUTAGE_KEYWORD_TAGS).forEach((tag) => tags.add(tag));
  return Array.from(tags);
}

function normalizeItem(rawItem) {
  const title = stripHtml(rawItem.title) || "Untitled outage event";
  const summary = safeSummary(stripHtml(rawItem.summary), "No summary provided.", 360);
  const url = normalizeUrl(rawItem.link || rawItem.guid, "https://example.com");
  const published = normalizeDate(rawItem.published);
  const source = String(rawItem.source || "Status Feed");
  const vendor = String(rawItem.vendor || "Unknown");
  const combined = `${title} ${summary} ${source} ${vendor}`;
  const severity = inferSeverityByKeywords(combined, OUTAGE_SEVERITY_RULES, "MEDIUM");
  const tags = buildOutageTags(combined, source, vendor, severity);

  return {
    id: buildStableId("outage", [source, vendor, url || title, published]),
    title,
    source,
    published,
    url,
    summary,
    severity,
    vendor,
    tags
  };
}

async function main() {
  const outputPath = path.resolve(process.cwd(), getArgValue(process.argv, "--output") || DEFAULT_OUTPUT_PATH);
  const limit = Number.parseInt(getArgValue(process.argv, "--limit") || String(DEFAULT_LIMIT), 10);
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT;

  const feedResults = await Promise.allSettled(OUTAGE_FEEDS.map((feed) => fetchFeed(feed)));
  const collected = [];
  let successCount = 0;

  feedResults.forEach((result, index) => {
    const feed = OUTAGE_FEEDS[index];
    if (result.status === "fulfilled") {
      const usable = result.value.filter((item) => !shouldSkipScheduled(item));
      collected.push(...usable);
      successCount += 1;
      console.log(`Fetched ${usable.length} outage items from ${feed.source}`);
      return;
    }

    console.warn(`Skipping ${feed.source}: ${result.reason.message}`);
  });

  if (successCount === 0) {
    throw new Error("No outage feeds were successfully fetched.");
  }

  const normalized = dedupeBy(
    collected.map((item) => normalizeItem(item)),
    [
      (item) => item.url,
      (item) => item.title
    ]
  )
    .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""))
    .slice(0, effectiveLimit);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  console.log(`Wrote ${normalized.length} outage entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(`outages_adapter failed: ${error.message}`);
  process.exit(1);
});
