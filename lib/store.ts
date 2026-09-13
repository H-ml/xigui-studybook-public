import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { AppState, Catalog } from "./types";
import { CURRENT_SCHEMA_VERSION, migrateState, stateInventory } from "./state-migrations.mjs";

const dataDir = process.env.STUDYBOOK_DATA_DIR ? path.resolve(process.env.STUDYBOOK_DATA_DIR) : path.join(process.cwd(), "data");
const contentDir = process.env.STUDYBOOK_CONTENT_DIR ? path.resolve(process.env.STUDYBOOK_CONTENT_DIR) : path.join(process.cwd(), "content");
const statePath = path.join(dataDir, "state.json");
const catalogPath = path.join(contentDir, "catalog.json");
const backupDir = path.join(dataDir, "backups");
let stateUpdateQueue: Promise<void> = Promise.resolve();

async function createInitialState(): Promise<AppState> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeSession: null,
    savedSessions: [],
    sessionHistory: [],
    attempts: [],
    questionIssues: [],
    notes: [],
    planTasks: [],
    preferences: { lastPracticeFeedback: "immediate", defaultLightMinutes: 20, reducedMotion: false },
    knowledge: {},
    progress: { totalMinutes: 0, completedSections: [], learningDates: [] },
    proposals: {},
  };
}

async function backupBeforeMigration(rawText: string, fromVersion: number) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = `state-${timestamp}-auto-before-v${CURRENT_SCHEMA_VERSION}`;
  const backupPath = path.join(backupDir, `${basename}.json`);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(backupPath, rawText, { flag: "wx" });
  await fs.writeFile(
    path.join(backupDir, `${basename}.manifest.json`),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      label: `auto-migration-v${fromVersion}-to-v${CURRENT_SCHEMA_VERSION}`,
      sha256: createHash("sha256").update(rawText).digest("hex"),
      inventory: stateInventory(JSON.parse(rawText)),
    }, null, 2)}\n`,
    { flag: "wx" },
  );
}

export async function readCatalog(): Promise<Catalog> {
  return JSON.parse(await fs.readFile(catalogPath, "utf8"));
}

export async function readState(): Promise<AppState> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const rawText = await fs.readFile(statePath, "utf8");
    const raw = JSON.parse(rawText);
    const migrated = migrateState(raw);
    if (migrated.changed) {
      await backupBeforeMigration(rawText, migrated.fromVersion);
      await writeState(migrated.state);
    }
    return migrated.state;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const state = await createInitialState();
    await writeState(state);
    return state;
  }
}

export async function writeState(state: AppState) {
  await fs.mkdir(dataDir, { recursive: true });
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporary, statePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function updateState(mutator: (state: AppState) => AppState | Promise<AppState>) {
  let result!: AppState;
  const update = stateUpdateQueue.then(async () => {
    const state = await readState();
    const next = await mutator(state);
    await writeState(next);
    result = next;
  });
  stateUpdateQueue = update.catch(() => undefined);
  await update;
  return result;
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
