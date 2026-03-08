#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { parseRssItems, stripHtml } = require("./lib/rss");
const { NEWS_FEEDS } = require("./sources");
const {
  buildStableId,
  dedupeBy,
  extractKeywordTags,
  getArgValue,
  inferSeverityByKeywords,
  inferVendorFromText,
  normalizeDate,
  normalizeUrl,
  safeSummary,
  slugify
} = require("./lib/normalize");

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/news.json");
const DEFAULT_LIMIT = 180;
const USER_AGENT = "CyberMonitor-News-Adapter/1.4";

const NEWS_SEVERITY_RULES = {
  critical: [
    "zero-day",
    "0day",
    "actively exploited",
    "mass exploitation",
    "ransomware",
    "data breach",
    "remote code execution",
    "botnet"
  ],
  high: [
    "critical",
    "severe",
    "vulnerability",
    "exploit",
    "cyberattack",
    "malware",
    "phishing",
    "credential",
    "backdoor"
  ],
  medium: ["patch", "advisory", "bug", "security update", "warning", "risk"]
};

const NEWS_KEYWORD_TAGS = [
  "ransomware",
  "phishing",
  "malware",
  "botnet",
  "zero-day",
  "vulnerability",
  "patch",
  "data-breach",
  "supply-chain",
  "cloud",
  "identity",
  "api"
];

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
  return parseRssItems(xml).map((item) => ({ ...item, source: feed.source, sourceVendor: feed.vendor }));
}

function buildNewsTags(text, severity, vendor, source) {
  const tags = new Set(["news", "intel-feed", severity.toLowerCase(), slugify(source)]);
  extractKeywordTags(text, NEWS_KEYWORD_TAGS).forEach((tag) => tags.add(tag));
  if (vendor) {
    tags.add(slugify(vendor));
  }
  return Array.from(tags);
}

function normalizeItem(rawItem) {
  const title = stripHtml(rawItem.title) || "Untitled security item";
  const summary = safeSummary(stripHtml(rawItem.summary), "No summary provided.", 320);
  const url = normalizeUrl(rawItem.link || rawItem.guid, "https://example.com");
  const published = normalizeDate(rawItem.published);
  const source = String(rawItem.source || "Security Feed");
  const combined = `${title} ${summary} ${source}`;
  const vendor = rawItem.sourceVendor || inferVendorFromText(combined);
  const severity = inferSeverityByKeywords(combined, NEWS_SEVERITY_RULES, "MEDIUM");
  const tags = buildNewsTags(combined, severity, vendor, source);

  return {
    id: buildStableId("news", [source, url || title, published]),
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

  const feedResults = await Promise.allSettled(NEWS_FEEDS.map((feed) => fetchFeed(feed)));
  const collected = [];
  let successCount = 0;

  feedResults.forEach((result, index) => {
    const feed = NEWS_FEEDS[index];
    if (result.status === "fulfilled") {
      successCount += 1;
      collected.push(...result.value);
      console.log(`Fetched ${result.value.length} items from ${feed.source}`);
      return;
    }

    console.warn(`Skipping ${feed.source}: ${result.reason.message}`);
  });

  if (successCount === 0) {
    throw new Error("No news feeds were successfully fetched.");
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

  console.log(`Wrote ${normalized.length} news entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(`news_adapter failed: ${error.message}`);
  process.exit(1);
});
