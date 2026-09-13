#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stateInventory } from "../lib/state-migrations.mjs";

const appDir = path.resolve(import.meta.dirname, "..");
const dataDir = process.env.STUDYBOOK_DATA_DIR ? path.resolve(process.env.STUDYBOOK_DATA_DIR) : path.join(appDir, "data");
const statePath = path.join(dataDir, "state.json");
const backupDir = path.join(dataDir, "backups");
const label = (process.argv[2] || "manual").replace(/[^a-zA-Z0-9._-]+/g, "-");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const source = await fs.readFile(statePath);
const state = JSON.parse(source.toString("utf8"));
const sha256 = createHash("sha256").update(source).digest("hex");
const backupPath = path.join(backupDir, `state-${timestamp}-${label}.json`);
const manifestPath = backupPath.replace(/\.json$/, ".manifest.json");

await fs.mkdir(backupDir, { recursive: true });
await fs.writeFile(backupPath, source, { flag: "wx" });
await fs.writeFile(
  manifestPath,
  `${JSON.stringify({ createdAt: new Date().toISOString(), label, sha256, inventory: stateInventory(state) }, null, 2)}\n`,
  { flag: "wx" },
);

console.log(JSON.stringify({ backupPath, manifestPath, sha256, inventory: stateInventory(state) }, null, 2));
