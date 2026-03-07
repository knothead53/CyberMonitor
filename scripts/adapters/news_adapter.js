#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/news.json");
const DEFAULT_LIMIT = 180;
const USER_AGENT = "CyberMonitor-News-Adapter/1.3";

const NEWS_FEEDS = [
  {
    source: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    vendor: ""
  },
  {
    source: "Dark Reading",
    url: "https://www.darkreading.com/rss.xml",
    vendor: ""
  },
  {
    source: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    vendor: ""
  }
];

const VENDOR_KEYWORDS = [
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
  "dell"
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
    summary: extractTagValue(itemXml, "description") || extractTagValue(itemXml, "content:encoded")
  }));
}

function normalizeDate(value) {
  const parsed = Date.parse(String(value || "").trim());
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferVendor(textValue) {
  const text = String(textValue || "").toLowerCase();
  const found = VENDOR_KEYWORDS.find((vendor) => text.includes(vendor));
  return found ? toTitleCase(found) : "";
}

function inferSeverity(textValue) {
  const text = String(textValue || "").toLowerCase();

  const criticalSignals = [
    "zero-day",
    "0day",
    "actively exploited",
    "mass exploitation",
    "ransomware",
    "data breach",
    "remote code execution",
    "botnet"
  ];
  if (criticalSignals.some((token) => text.includes(token))) {
    return "CRITICAL";
  }

  const highSignals = [
    "critical",
    "severe",
    "vulnerability",
    "exploit",
    "cyberattack",
    "malware",
    "phishing",
    "credential",
    "backdoor"
  ];
  if (highSignals.some((token) => text.includes(token))) {
    return "HIGH";
  }

  const mediumSignals = ["patch", "advisory", "bug", "security update", "warning", "risk"];
  if (mediumSignals.some((token) => text.includes(token))) {
    return "MEDIUM";
  }

  return "MEDIUM";
}

function extractTags(textValue, severity, vendor, source) {
  const text = String(textValue || "").toLowerCase();
  const tags = new Set(["news", "intel-feed", severity.toLowerCase(), slugify(source)]);
  const keywordTags = [
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

  keywordTags.forEach((tag) => {
    const needle = tag.replace(/-/g, " ");
    if (text.includes(needle) || text.includes(tag)) {
      tags.add(tag);
    }
  });

  if (vendor) {
    tags.add(slugify(vendor));
  }

  return Array.from(tags);
}

function summarize(value) {
  const text = stripHtml(value);
  if (!text) {
    return "No summary provided.";
  }
  return text.length > 320 ? `${text.slice(0, 317)}...` : text;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function buildId(source, url, title, published) {
  const base = `${source}|${url || title}|${published}`;
  let hash = 5381;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 33) ^ base.charCodeAt(i);
  }
  const unsigned = hash >>> 0;
  return `news-${unsigned.toString(16).padStart(8, "0")}`;
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
  return parseRssItems(xml).map((item) => ({ ...item, source: feed.source, sourceVendor: feed.vendor }));
}

function normalizeItem(rawItem) {
  const title = stripHtml(rawItem.title) || "Untitled security item";
  const summary = summarize(rawItem.summary);
  const url = normalizeUrl(rawItem.link || rawItem.guid) || "https://example.com";
  const published = normalizeDate(rawItem.published);
  const source = String(rawItem.source || "Security Feed");
  const combined = `${title} ${summary} ${source}`;
  const vendor = rawItem.sourceVendor || inferVendor(combined);
  const severity = inferSeverity(combined);
  const tags = extractTags(combined, severity, vendor, source);

  return {
    id: buildId(source, url, title, published),
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

  const normalized = dedupeItems(collected.map((item) => normalizeItem(item)))
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
