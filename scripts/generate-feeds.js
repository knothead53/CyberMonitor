#!/usr/bin/env node

const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

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
    sources: ["BleepingComputer", "Dark Reading", "Krebs on Security"]
  },
  {
    key: "outages",
    label: "Outages adapter",
    scriptPath: path.resolve(__dirname, "adapters/outages_adapter.js"),
    outputPath: path.resolve(process.cwd(), "data/outages.json"),
    sources: ["GitHub Status", "OpenAI Status", "Discord Status", "Cloudflare Status"]
  }
];
const METADATA_OUTPUT_PATH = path.resolve(process.cwd(), "data/feed-metadata.json");
const HEALTH_OUTPUT_PATH = path.resolve(process.cwd(), "data/feed-health.json");

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

  await writeJsonFile(METADATA_OUTPUT_PATH, metadataPayload);
  await writeJsonFile(HEALTH_OUTPUT_PATH, healthPayload);

  console.log(`Wrote feed metadata to ${METADATA_OUTPUT_PATH}`);
  console.log(`Wrote feed health report to ${HEALTH_OUTPUT_PATH}`);
  console.log("\nFeed generation complete.");
  console.log("Generated files are available under data/*.json");
}

main().catch((error) => {
  console.error(`generate-feeds failed: ${error.message}`);
  process.exit(1);
});
