#!/usr/bin/env node

/**
 * Refreshes sample data timestamps so demos always show recent activity.
 * Usage: node scripts/refresh-sample-timestamps.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dataFiles = [
  "kev.sample.json",
  "news.sample.json",
  "outages.sample.json"
];

const dataDir = path.join(__dirname, "..", "data");
const now = Date.now();

for (const fileName of dataFiles) {
  const filePath = path.join(dataDir, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const items = JSON.parse(raw);

  const updated = items.map((item, index) => {
    const offsetMinutes = index * 17;
    return {
      ...item,
      published: new Date(now - offsetMinutes * 60 * 1000).toISOString()
    };
  });

  fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  console.log(`Updated ${fileName}`);
}

// Rebuild the derived sample dashboard bundle so fallback JSON stays in sync.
const result = spawnSync(process.execPath, [path.join(__dirname, "build-data.js"), "--sample-only"], {
  stdio: "inherit",
  cwd: path.join(__dirname, "..")
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
