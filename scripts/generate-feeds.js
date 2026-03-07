#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const ADAPTER_STEPS = [
  {
    key: "kev",
    label: "CISA KEV adapter",
    scriptPath: path.resolve(__dirname, "adapters/kev_adapter.js")
  },
  {
    key: "news",
    label: "Security news adapter",
    scriptPath: path.resolve(__dirname, "adapters/news_adapter.js")
  },
  {
    key: "outages",
    label: "Outages adapter",
    scriptPath: path.resolve(__dirname, "adapters/outages_adapter.js")
  }
];

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

  for (const step of selectedSteps) {
    console.log(`\n[${step.key}] Running ${step.label}...`);
    await runNodeScript(step.scriptPath);
    console.log(`[${step.key}] Completed ${step.label}.`);
  }

  console.log("\nFeed generation complete.");
  console.log("Generated files are available under data/*.json");
}

main().catch((error) => {
  console.error(`generate-feeds failed: ${error.message}`);
  process.exit(1);
});
