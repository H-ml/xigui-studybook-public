import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, migrateState, stateInventory } from "../lib/state-migrations.mjs";

test("旧版学习状态迁移时保留全部用户记录", () => {
  const legacy = {
    activeSession: { id: "s1", sectionId: "4.1", status: "paused", answers: {} },
    sessionHistory: [{ id: "done" }],
    attempts: [{ id: "a1" }, { id: "a2" }],
    notes: [{ id: "n1" }],
    planTasks: [{ id: "p1" }],
    progress: { completedSections: ["4.1"] },
  };
  const before = stateInventory(legacy);
  const migrated = migrateState(legacy);
  const after = stateInventory(migrated.state);

  assert.equal(migrated.fromVersion, 1);
  assert.equal(migrated.state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.state.savedSessions, []);
  assert.deepEqual(migrated.state.questionIssues, []);
  assert.equal(migrated.state.activeSession.elapsedSeconds, 0);
  assert.equal(after.attempts, before.attempts);
  assert.equal(after.notes, before.notes);
  assert.deepEqual(after.completedSections, ["4.1"]);
});

test("v2 状态升级时合并同章笔记并保留内容版本", () => {
  const state = {
    schemaVersion: 2,
    activeSession: { id: "s", sectionId: "4.3", status: "active", answers: {} },
    savedSessions: [],
    sessionHistory: [],
    attempts: [],
    questionIssues: [],
    notes: [
      { id: "chapter", title: "04 信息系统规划", sectionId: "4.1", content: "章节原文", source: "manual", images: [], updatedAt: "2026-07-20T10:00:00Z" },
      { id: "draft", title: "4.2 补充笔记", sectionId: "4.2", content: "补充内容", source: "manual", images: [], updatedAt: "2026-07-26T10:00:00Z" },
    ],
    planTasks: [],
    preferences: {},
    knowledge: {},
    progress: { totalMinutes: 0, completedSections: [], learningDates: [] },
    proposals: {},
  };
  const migrated = migrateState(state);
  assert.equal(migrated.state.notes.length, 1);
  assert.equal(migrated.state.notes[0].id, "chapter");
  assert.match(migrated.state.notes[0].content, /补充内容/);
  assert.equal(migrated.state.notes[0].versions.length, 1);
  assert.equal(migrated.state.activeSession.elapsedSeconds, 0);
});
