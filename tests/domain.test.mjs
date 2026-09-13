import test from "node:test";
import assert from "node:assert/strict";
import { evidenceFor, isStaleCompletedSession, nextSectionId, recommendedSectionId, recommendMode, scoreSection, statusForAttempts } from "../lib/domain.mjs";

test("学习、逐题揭晓和小节交卷产生三种隔离证据", () => {
  assert.equal(evidenceFor("study", "immediate"), "open_book");
  assert.equal(evidenceFor("practice", "immediate"), "closed_book_immediate");
  assert.equal(evidenceFor("practice", "section_end"), "closed_book_section");
  assert.equal(evidenceFor("practice", "section_end", true), "open_book");
});

test("新小节先推荐学习，学过后推荐小节闭卷检验", () => {
  assert.deepEqual(recommendMode({ hasAttempts: false, hasOpenBook: false, dueReview: false }), {
    practiceMode: "study", feedbackTiming: "immediate", reason: "第一次进入本小节",
  });
  assert.equal(recommendMode({ hasAttempts: true, hasOpenBook: true, dueReview: false }).feedbackTiming, "section_end");
  assert.equal(recommendMode({ hasAttempts: true, hasOpenBook: true, dueReview: true }).feedbackTiming, "immediate");
});

test("只有跨日且包含小节交卷的闭卷证据才能进入稳定状态", () => {
  const base = { sectionId: "4.1", sectionGroupId: "g", questionId: "q", answer: "A", referenceAssisted: false, changedBeforeSubmit: false };
  assert.equal(statusForAttempts([{ ...base, id: "1", correct: true, evidenceType: "open_book", answeredAt: "2026-07-20T10:00:00Z" }]), "新记录");
  assert.equal(statusForAttempts([{ ...base, id: "2", correct: false, evidenceType: "closed_book_immediate", answeredAt: "2026-07-21T10:00:00Z" }]), "薄弱");
  assert.equal(statusForAttempts([
    { ...base, id: "3", correct: true, evidenceType: "closed_book_section", answeredAt: "2026-07-21T10:00:00Z" },
    { ...base, id: "4", correct: true, evidenceType: "closed_book_immediate", answeredAt: "2026-07-22T10:00:00Z" },
  ]), "已掌握");
});

test("小节报告按整组题量计算，未答题不会被忽略", () => {
  const questions = [{ id: "a", answer: "A" }, { id: "b", answer: "B" }, { id: "c", answer: "C" }];
  const report = scoreSection(questions, { a: { answer: "A" }, b: { answer: "D" } });
  assert.deepEqual(report, { correct: 1, answered: 2, total: 3, accuracy: 33 });
});

test("完成当前小节后进入数值顺序的下一未完成小节", () => {
  const sections = [
    { id: "4.10", questionIds: ["q3"] },
    { id: "4.2", questionIds: ["q2"] },
    { id: "4.1", questionIds: ["q1"] },
    { id: "5.1", questionIds: [] },
  ];
  assert.equal(nextSectionId(sections, "4.1", ["4.1"]), "4.2");
  assert.equal(nextSectionId(sections, "4.2", ["4.1", "4.2"]), "4.10");
});

test("已完成小节的空会话不会阻挡进入下一节，但真实进度会保留", () => {
  const emptyReplay = { sectionId: "4.1", currentQuestionIndex: 0, answers: {} };
  assert.equal(isStaleCompletedSession(emptyReplay, ["4.1"]), true);
  assert.equal(isStaleCompletedSession({ ...emptyReplay, currentQuestionIndex: 1 }, ["4.1"]), false);
  assert.equal(isStaleCompletedSession({ ...emptyReplay, answers: { q1: { answer: "A" } } }, ["4.1"]), false);
  assert.equal(isStaleCompletedSession(emptyReplay, []), false);
});

test("首页和开始接口在完成 4.2 后一致推荐 4.3", () => {
  const sections = [
    { id: "4.1", questionIds: ["q1"] },
    { id: "4.2", questionIds: ["q2"] },
    { id: "4.3", questionIds: ["q3"] },
  ];
  assert.equal(recommendedSectionId({
    sections,
    activeSession: { sectionId: "4.2", status: "completed" },
    sessionHistory: [{ sectionId: "4.2", status: "completed" }],
    completedIds: ["4.1", "4.2"],
    planTasks: [{ sectionId: "4.1", status: "todo", kind: "综合", date: "2026-07-20" }],
    today: "2026-07-26",
  }), "4.3");
  assert.equal(recommendedSectionId({
    sections,
    sessionHistory: [{ sectionId: "4.2", status: "completed" }],
    completedIds: ["4.1", "4.2"],
    planTasks: [{ sectionId: "4.1", status: "todo", kind: "复习", date: "2026-07-20" }],
    today: "2026-07-26",
  }), "4.1");
});

test("空白用户从题库第一个有效小节开始", () => {
  const sections = [
    { id: "2.1", questionIds: ["q2"] },
    { id: "1.2", questionIds: ["q12"] },
    { id: "1.1", questionIds: ["q1"] },
  ];
  assert.equal(recommendedSectionId({ sections }), "1.1");
});
