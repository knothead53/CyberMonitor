#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), "data/outages.sample.json");
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/outages.json");
const DEFAULT_SOURCE = "Outages Adapter";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1];
}

function normalizeSeverity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  if (normalized === "med") {
    return "medium";
  }
  return "medium";
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(value || "");
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function normalizeRow(row, index) {
  const vendor = String(row?.vendor || "").trim();
  const normalized = {
    id: String(row?.id || `outage-${String(index + 1).padStart(3, "0")}`),
    title: String(row?.title || "Untitled outage item"),
    source: String(row?.source || DEFAULT_SOURCE),
    published: normalizeTimestamp(row?.published),
    url: String(row?.url || "#"),
    summary: String(row?.summary || "No summary provided."),
    severity: normalizeSeverity(row?.severity)
  };

  if (vendor) {
    normalized.vendor = vendor;
  }

  return normalized;
}

async function main() {
  const inputPath = path.resolve(process.cwd(), getArgValue("--input") || DEFAULT_INPUT_PATH);
  const outputPath = path.resolve(process.cwd(), getArgValue("--output") || DEFAULT_OUTPUT_PATH);

  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw);

  const normalized = normalizeItems(parsed)
    .map((row, index) => normalizeRow(row, index))
    .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  console.log(`Wrote ${normalized.length} outage entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(`outages_adapter failed: ${error.message}`);
  process.exit(1);
});
