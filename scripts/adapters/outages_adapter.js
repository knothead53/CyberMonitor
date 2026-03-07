#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/outages.json");
const DEFAULT_LIMIT = 160;
const USER_AGENT = "CyberMonitor-Outages-Adapter/1.3";

const OUTAGE_FEEDS = [
  {
    source: "GitHub Status",
    vendor: "GitHub",
    url: "https://www.githubstatus.com/history.rss"
  },
  {
    source: "OpenAI Status",
    vendor: "OpenAI",
    url: "https://status.openai.com/history.rss"
  },
  {
    source: "Discord Status",
    vendor: "Discord",
    url: "https://status.discord.com/history.rss"
  },
  {
    source: "Cloudflare Status",
    vendor: "Cloudflare",
    url: "https://www.cloudflarestatus.com/history.rss"
  }
];

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1];
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtmlEntities(text) {
  const base = String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return base
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagValue(block, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = block.match(regex);
  return match ? stripHtml(match[1]) : "";
}

function parseRssItems(xml) {
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map((itemXml) => ({
    title: extractTagValue(itemXml, "title"),
    link: extractTagValue(itemXml, "link"),
    guid: extractTagValue(itemXml, "guid"),
    published: extractTagValue(itemXml, "pubDate"),
    summary: extractTagValue(itemXml, "description") || extractTagValue(itemXml, "content:encoded"),
    hasMaintenanceTag: /<maintenanceEndDate>/i.test(itemXml)
  }));
}

function normalizeDate(value) {
  const parsed = Date.parse(String(value || "").trim());
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).toString();
  } catch (_error) {
    return "";
  }
}

function summarize(text) {
  const summary = stripHtml(text);
  if (!summary) {
    return "No summary provided.";
  }
  return summary.length > 360 ? `${summary.slice(0, 357)}...` : summary;
}

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

function inferSeverity(textValue) {
  const text = String(textValue || "").toLowerCase();

  const criticalSignals = ["major outage", "global outage", "service unavailable", "down", "widespread"];
  if (criticalSignals.some((token) => text.includes(token))) {
    return "CRITICAL";
  }

  const highSignals = ["degraded availability", "incident", "errors", "failed", "latency", "partial outage"];
  if (highSignals.some((token) => text.includes(token))) {
    return "HIGH";
  }

  const mediumSignals = ["degraded performance", "investigating", "monitoring", "intermittent", "delay"];
  if (mediumSignals.some((token) => text.includes(token))) {
    return "MEDIUM";
  }

  return "MEDIUM";
}

function extractTags(textValue, source, vendor, severity) {
  const text = String(textValue || "").toLowerCase();
  const tags = new Set(["outage", "status-feed", severity.toLowerCase(), slugify(source), slugify(vendor)]);
  const keywordTags = [
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

  keywordTags.forEach((tag) => {
    if (text.includes(tag)) {
      tags.add(tag);
    }
  });

  return Array.from(tags);
}

function buildId(source, vendor, url, title, published) {
  const base = `${source}|${vendor}|${url || title}|${published}`;
  let hash = 5381;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 33) ^ base.charCodeAt(i);
  }
  const unsigned = hash >>> 0;
  return `outage-${unsigned.toString(16).padStart(8, "0")}`;
}

function dedupeItems(items) {
  const seenByUrl = new Set();
  const seenByTitle = new Set();
  const unique = [];

  items.forEach((item) => {
    const urlKey = normalizeUrl(item.url).toLowerCase();
    const titleKey = String(item.title || "").trim().toLowerCase();
    if (urlKey && seenByUrl.has(urlKey)) {
      return;
    }
    if (titleKey && seenByTitle.has(titleKey)) {
      return;
    }

    if (urlKey) {
      seenByUrl.add(urlKey);
    }
    if (titleKey) {
      seenByTitle.add(titleKey);
    }
    unique.push(item);
  });

  return unique;
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

function normalizeItem(rawItem) {
  const title = stripHtml(rawItem.title) || "Untitled outage event";
  const summary = summarize(rawItem.summary);
  const url = normalizeUrl(rawItem.link || rawItem.guid) || "https://example.com";
  const published = normalizeDate(rawItem.published);
  const source = String(rawItem.source || "Status Feed");
  const vendor = String(rawItem.vendor || "Unknown");
  const combined = `${title} ${summary} ${source} ${vendor}`;
  const severity = inferSeverity(combined);
  const tags = extractTags(combined, source, vendor, severity);

  return {
    id: buildId(source, vendor, url, title, published),
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
  const outputPath = path.resolve(process.cwd(), getArgValue("--output") || DEFAULT_OUTPUT_PATH);
  const limit = Number.parseInt(getArgValue("--limit") || String(DEFAULT_LIMIT), 10);
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

  const normalized = dedupeItems(collected.map((item) => normalizeItem(item)))
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
