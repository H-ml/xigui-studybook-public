import { NextRequest, NextResponse } from "next/server";
import type { AppState, AttemptRecord, Catalog, FeedbackTiming, PracticeMode, Question, StudySession } from "../../../lib/types";
import { newId, readCatalog, readState, updateState } from "../../../lib/store";
import { evidenceFor, isStaleCompletedSession, nextSectionId, recommendedSectionId, recommendMode, scoreSection, statusForAttempts } from "../../../lib/domain.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanPath(pathParts: string[]) {
  return pathParts.map(decodeURIComponent);
}

function sectionAttempts(state: AppState, sectionId: string) {
  return state.attempts.filter((item) => item.sectionId === sectionId);
}

function saveInterruptedSession(state: AppState) {
  const current = state.activeSession;
  if (!current || current.status === "completed") return;
  if (isStaleCompletedSession(current, state.progress.completedSections)) {
    state.savedSessions = state.savedSessions.filter((session) => session.id !== current.id);
    return;
  }
  current.status = "paused";
  const existingIndex = state.savedSessions.findIndex((session) => session.id === current.id);
  if (existingIndex >= 0) state.savedSessions[existingIndex] = structuredClone(current);
  else state.savedSessions.push(structuredClone(current));
}

function openSectionSession(
  state: AppState,
  catalog: Catalog,
  sectionId: string,
  options: { targetMinutes?: number; practiceMode?: PracticeMode; feedbackTiming?: FeedbackTiming; reason?: string } = {},
) {
  const section = catalog.sections.find((item) => item.id === sectionId && item.questionIds.length);
  if (!section) throw new Error("题库中没有这个小节");

  if (state.activeSession?.sectionId === sectionId && state.activeSession.status !== "completed") {
    state.activeSession.status = "active";
    state.activeSession.updatedAt = new Date().toISOString();
    return state.activeSession;
  }

  saveInterruptedSession(state);
  const savedIndex = state.savedSessions.findIndex((session) => session.sectionId === sectionId && session.status !== "completed");
  if (savedIndex >= 0) {
    const [saved] = state.savedSessions.splice(savedIndex, 1);
    saved.status = "active";
    saved.updatedAt = new Date().toISOString();
    state.activeSession = saved;
    return saved;
  }

  const attempts = sectionAttempts(state, section.id);
  const recommendation = recommendMode({
    hasAttempts: attempts.length > 0,
    hasOpenBook: attempts.some((item) => item.evidenceType === "open_book"),
    dueReview: state.knowledge[section.id]?.status === "薄弱",
  });
  const mode = (options.practiceMode || recommendation.practiceMode) as PracticeMode;
  const timing = (options.feedbackTiming || (mode === "study" ? "immediate" : recommendation.feedbackTiming)) as FeedbackTiming;
  const now = new Date().toISOString();
  state.activeSession = {
    id: newId("session"),
    sectionId: section.id,
    questionIds: section.questionIds,
    currentQuestionIndex: 0,
    practiceMode: mode,
    feedbackTiming: timing,
    referenceOpened: mode === "study",
    status: "active",
    sourcePageStart: section.sourcePageStart,
    sourcePageEnd: section.sourcePageEnd,
    pdfPage: section.physicalPageStart,
    targetMinutes: Number(options.targetMinutes) || state.preferences.defaultLightMinutes || 20,
    elapsedSeconds: 0,
    recommendation: `${mode === "study" ? "学习模式" : timing === "section_end" ? "刷题模式 · 小节交卷" : "刷题模式 · 逐题揭晓"} · ${options.reason || recommendation.reason}`,
    startedAt: now,
    updatedAt: now,
    answers: {},
  };
  return state.activeSession;
}

function refreshKnowledge(state: AppState, sectionId: string) {
  const attempts = sectionAttempts(state, sectionId);
  const closed = attempts.filter((item) => item.evidenceType !== "open_book" && !item.referenceAssisted);
  state.knowledge[sectionId] = {
    status: statusForAttempts(attempts),
    correct: closed.filter((item) => item.correct).length,
    total: closed.length,
    nextReview: new Date(Date.now() + (closed.length && closed.every((item) => item.correct) ? 7 : 2) * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}

function createAttempt(session: StudySession, question: Question, answer: string, changedBeforeSubmit: boolean): AttemptRecord {
  const evidenceType = evidenceFor(session.practiceMode, session.feedbackTiming, session.referenceOpened);
  return {
    id: newId("attempt"),
    questionId: question.id,
    sectionId: session.sectionId,
    sectionGroupId: session.id,
    answer,
    correct: answer === question.answer,
    evidenceType,
    referenceAssisted: session.referenceOpened,
    answeredAt: new Date().toISOString(),
    revealedAt: session.feedbackTiming === "immediate" || session.practiceMode === "study" ? new Date().toISOString() : undefined,
    changedBeforeSubmit,
  };
}

function summarizeWeek(state: AppState) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const sessions = state.sessionHistory.filter((item) => dates.includes(item.updatedAt.slice(0, 10)));
  return {
    dates,
    completedSessions: sessions.length,
    answered: state.attempts.filter((item) => dates.includes(item.answeredAt.slice(0, 10))).length,
    totalMinutes: state.progress.totalMinutes,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawPath } = await context.params;
  const parts = cleanPath(rawPath);
  const [root, id] = parts;
  const catalog = await readCatalog();
  const state = await readState();

  if (root === "bootstrap") {
    return json({
      state,
      sections: catalog.sections.map((section) => ({ ...section, questionCount: section.questionIds.length })),
      stats: catalog.stats,
      generatedAt: catalog.generatedAt,
      currentTime: new Date().toISOString(),
      weekly: summarizeWeek(state),
      examDate: process.env.EXAM_DATE || null,
      today: {
        taskCount: state.planTasks.filter((task) => task.date === new Date().toISOString().slice(0, 10)).length,
        completed: state.sessionHistory.filter((session) => session.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      },
    });
  }
  if (root === "sections" && id) {
    const section = catalog.sections.find((item) => item.id === id);
    if (!section) return json({ error: "找不到该小节" }, 404);
    const ids = new Set(section.questionIds);
    return json({ section, questions: catalog.questions.filter((question) => ids.has(question.id)) });
  }
  if (root === "notes" && id === "export") {
    const content = state.notes
      .map((note) => `---\ntitle: ${note.title}\ntags:\n  - 软考\n  - 系规练习簿\n---\n\n# ${note.title}\n\n${note.content}`)
      .join("\n\n---\n\n");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename*=UTF-8''xigui-notes.md",
      },
    });
  }
  if (root === "notes") return json({ notes: state.notes });
  if (root === "progress" && id === "today") {
    const today = new Date().toISOString().slice(0, 10);
    return json({ attempts: state.attempts.filter((item) => item.answeredAt.startsWith(today)), tasks: state.planTasks.filter((task) => task.date === today) });
  }
  if (root === "progress" && id === "weekly") return json(summarizeWeek(state));
  if (root === "catalog" && id === "review-queue") return json({ reviewQueue: catalog.reviewQueue, userIssues: state.questionIssues, stats: { ...catalog.stats, userIssueCount: state.questionIssues.filter((issue) => issue.status === "open").length } });
  return json({ error: "接口不存在" }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawPath } = await context.params;
  const parts = cleanPath(rawPath);
  const [root, id, action] = parts;
  const body = await request.json().catch(() => ({}));
  const catalog = await readCatalog();

  if (root === "session" && id === "start") {
    const next = await updateState((state) => {
      if (state.activeSession && state.activeSession.status !== "completed" && !body.sectionId) {
        if (isStaleCompletedSession(state.activeSession, state.progress.completedSections)) {
          state.savedSessions = state.savedSessions.filter((session) => session.id !== state.activeSession?.id);
          state.activeSession = null;
        } else {
          state.activeSession.status = "active";
          state.activeSession.updatedAt = new Date().toISOString();
          return state;
        }
      }
      const preferredId = body.sectionId || recommendedSectionId({
        sections: catalog.sections,
        activeSession: state.activeSession,
        knowledge: state.knowledge,
        planTasks: state.planTasks,
        sessionHistory: state.sessionHistory,
        completedIds: state.progress.completedSections,
      });
      if (!preferredId) throw new Error("全部可用小节都已经完成");
      openSectionSession(state, catalog, preferredId, {
        targetMinutes: body.targetMinutes,
        practiceMode: body.practiceMode,
        feedbackTiming: body.feedbackTiming,
        reason: body.sectionId ? "你选择了这个小节" : undefined,
      });
      return state;
    });
    return json({ session: next.activeSession });
  }

  if (root === "session" && id === "next") {
    let targetId: string | null = null;
    const next = await updateState((state) => {
      const currentId = body.sectionId || state.activeSession?.sectionId;
      targetId = nextSectionId(catalog.sections, currentId, state.progress.completedSections);
      if (!targetId) return state;
      openSectionSession(state, catalog, targetId, { targetMinutes: body.targetMinutes, reason: `完成 ${currentId} 后继续` });
      return state;
    });
    if (!targetId) return json({ error: "已经学到题库中的最后一个小节" }, 409);
    return json({ session: next.activeSession, sectionId: targetId });
  }

  if (root === "session" && id === "mode") {
    const next = await updateState((state) => {
      if (!state.activeSession) return state;
      const previousMode = state.activeSession.practiceMode;
      state.activeSession.practiceMode = body.practiceMode || state.activeSession.practiceMode;
      state.activeSession.feedbackTiming = state.activeSession.practiceMode === "study" ? "immediate" : body.feedbackTiming || state.activeSession.feedbackTiming;
      if (state.activeSession.practiceMode === "study") state.activeSession.referenceOpened = true;
      if (previousMode === "study" && state.activeSession.practiceMode === "practice") state.activeSession.referenceOpened = false;
      if (body.feedbackTiming) state.preferences.lastPracticeFeedback = body.feedbackTiming;
      state.activeSession.recommendation = `${state.activeSession.practiceMode === "study" ? "学习模式" : state.activeSession.feedbackTiming === "section_end" ? "刷题模式 · 小节交卷" : "刷题模式 · 逐题揭晓"} · 本次已选择`;
      state.activeSession.updatedAt = new Date().toISOString();
      return state;
    });
    return json({ session: next.activeSession });
  }

  if (root === "session" && id === "pause") {
    const next = await updateState((state) => {
      if (state.activeSession) {
        state.activeSession.status = "paused";
        state.activeSession.pdfPage = Number(body.pdfPage) || state.activeSession.pdfPage;
        state.activeSession.currentQuestionIndex = Number.isFinite(body.currentQuestionIndex) ? body.currentQuestionIndex : state.activeSession.currentQuestionIndex;
        if (Number.isFinite(body.elapsedSeconds)) state.activeSession.elapsedSeconds = Math.max(0, Math.floor(body.elapsedSeconds));
        state.activeSession.updatedAt = new Date().toISOString();
      }
      return state;
    });
    return json({ session: next.activeSession });
  }

  if (root === "session" && id === "progress") {
    const next = await updateState((state) => {
      if (state.activeSession) {
        state.activeSession.currentQuestionIndex = Number.isFinite(body.currentQuestionIndex) ? body.currentQuestionIndex : state.activeSession.currentQuestionIndex;
        state.activeSession.pdfPage = Number(body.pdfPage) || state.activeSession.pdfPage;
        if (Number.isFinite(body.elapsedSeconds)) state.activeSession.elapsedSeconds = Math.max(0, Math.floor(body.elapsedSeconds));
        state.activeSession.updatedAt = new Date().toISOString();
      }
      return state;
    });
    return json({ session: next.activeSession });
  }

  if (root === "questions" && id && action === "answer") {
    const question = catalog.questions.find((item) => item.id === id);
    if (!question) return json({ error: "找不到题目" }, 404);
    const next = await updateState((state) => {
      const session = state.activeSession;
      if (!session || !session.questionIds.includes(id)) return state;
      const previous = session.answers[id];
      if (previous?.submitted) return state;
      const immediate = session.practiceMode === "study" || session.feedbackTiming === "immediate";
      session.answers[id] = {
        answer: body.answer,
        submitted: immediate,
        revealed: immediate,
        correct: immediate ? body.answer === question.answer : undefined,
        answeredAt: new Date().toISOString(),
        revealedAt: immediate ? new Date().toISOString() : undefined,
        changedBeforeSubmit: Boolean(previous?.answer && previous.answer !== body.answer) || Boolean(previous?.changedBeforeSubmit),
        referenceAssisted: session.referenceOpened,
        evidenceType: immediate ? evidenceFor(session.practiceMode, session.feedbackTiming, session.referenceOpened) : undefined,
      };
      session.updatedAt = new Date().toISOString();
      if (immediate) {
        state.attempts.push(createAttempt(session, question, body.answer, session.answers[id].changedBeforeSubmit));
        refreshKnowledge(state, session.sectionId);
      }
      return state;
    });
    return json({ answer: next.activeSession?.answers[id], correctAnswer: next.activeSession?.answers[id]?.revealed ? question.answer : undefined, explanation: next.activeSession?.answers[id]?.revealed ? question.explanation : undefined });
  }

  if (root === "questions" && id && action === "reveal") {
    const question = catalog.questions.find((item) => item.id === id);
    if (!question) return json({ error: "找不到题目" }, 404);
    const next = await updateState((state) => {
      const answer = state.activeSession?.answers[id];
      if (answer?.submitted) {
        answer.revealed = true;
        answer.revealedAt = new Date().toISOString();
      }
      return state;
    });
    const answer = next.activeSession?.answers[id];
    return json({ answer, correctAnswer: answer?.revealed ? question.answer : undefined, explanation: answer?.revealed ? question.explanation : undefined });
  }

  if (root === "questions" && id && action === "reference-opened") {
    const next = await updateState((state) => {
      if (state.activeSession) {
        state.activeSession.referenceOpened = true;
        for (const answer of Object.values(state.activeSession.answers)) answer.referenceAssisted = true;
        for (const attempt of state.attempts) {
          if (attempt.sectionGroupId !== state.activeSession.id) continue;
          attempt.referenceAssisted = true;
          attempt.evidenceType = "open_book";
        }
        refreshKnowledge(state, state.activeSession.sectionId);
      }
      return state;
    });
    return json({ session: next.activeSession });
  }

  if (root === "questions" && id && action === "issue") {
    const question = catalog.questions.find((item) => item.id === id);
    if (!question) return json({ error: "找不到题目" }, 404);
    const allowed = new Set(["stem", "options", "answer", "explanation", "source"]);
    if (!allowed.has(body.type)) return json({ error: "请选择问题类型" }, 400);
    const next = await updateState((state) => {
      state.questionIssues.push({
        id: newId("issue"),
        questionId: question.id,
        sectionId: question.sectionId,
        type: body.type,
        note: String(body.note || "").trim(),
        status: "open",
        createdAt: new Date().toISOString(),
        questionSnapshot: {
          stem: question.stem,
          options: question.options,
          answer: question.answer,
          explanation: question.explanation,
        },
      });
      return state;
    });
    return json({ issue: next.questionIssues.at(-1) });
  }

  if (root === "sections" && id && action === "submit") {
    const sectionQuestions = catalog.questions.filter((question) => question.sectionId === id);
    let report: ReturnType<typeof scoreSection> | null = null;
    const next = await updateState((state) => {
      const session = state.activeSession;
      if (!session || session.sectionId !== id) return state;
      if (session.status === "completed") return state;
      const answered = sectionQuestions.filter((question) => session.answers[question.id]?.answer).length;
      if (answered < sectionQuestions.length) return state;
      if (Number.isFinite(body.elapsedSeconds)) session.elapsedSeconds = Math.max(0, Math.floor(body.elapsedSeconds));
      for (const question of sectionQuestions) {
        const answer = session.answers[question.id];
        if (!answer?.answer) continue;
        answer.submitted = true;
        answer.revealed = true;
        answer.correct = answer.answer === question.answer;
        answer.revealedAt = new Date().toISOString();
        answer.evidenceType = evidenceFor(session.practiceMode, session.feedbackTiming, session.referenceOpened);
        const exists = state.attempts.some((item) => item.sectionGroupId === session.id && item.questionId === question.id);
        if (!exists) state.attempts.push(createAttempt(session, question, answer.answer, answer.changedBeforeSubmit));
      }
      report = scoreSection(sectionQuestions, session.answers);
      session.status = "completed";
      session.updatedAt = new Date().toISOString();
      state.sessionHistory.push(structuredClone(session));
      state.savedSessions = state.savedSessions.filter((saved) => saved.id !== session.id && saved.sectionId !== id);
      if (!state.progress.completedSections.includes(id)) state.progress.completedSections.push(id);
      const date = new Date().toISOString().slice(0, 10);
      if (!state.progress.learningDates.includes(date)) state.progress.learningDates.push(date);
      state.progress.totalMinutes += Math.max(1, Math.round((session.elapsedSeconds || 0) / 60));
      refreshKnowledge(state, id);
      const matchingTask = state.planTasks.find((task) => task.sectionId === id && task.status === "todo");
      if (matchingTask) matchingTask.status = "done";
      return state;
    });
    if (!report) return json({ error: `请先完成本小节全部 ${sectionQuestions.length} 道题，或者暂停后继续`, answered: next.activeSession ? Object.values(next.activeSession.answers).filter((answer) => answer.answer).length : 0, total: sectionQuestions.length }, 409);
    return json({ report, session: next.activeSession, knowledge: next.knowledge[id] });
  }

  if (root === "notes" && id === "draft") {
    const question = catalog.questions.find((item) => item.id === body.questionId);
    const section = catalog.sections.find((item) => item.id === (question?.sectionId || body.sectionId));
    const localDraft = `## ${section?.fullTitle || "薄弱知识点"}\n\n### 完整表述\n${question?.explanation || body.context || "请补充教材中的准确表述。"}\n\n### 为什么容易混淆\n- 这道题考查的是概念边界，而不是关键词表面相似。\n- 错误选项通常替换了范围、顺序或必要条件。\n\n### 本题错误选项\n${question ? Object.entries(question.options).map(([key, value]) => `- ${key}：${value}${key === question.answer ? "（正确）" : ""}`).join("\n") : "- 请结合原题补充。"}\n\n### 记忆提示\n先复述框架，再合上资料写出关键词；两天后用回忆题闭卷检验。\n\n> 来源：一本通 P${question?.sourceAnchor?.printedPage || section?.sourcePageStart || "-"}；题库第 ${question?.exercisePage || "-"} 页。`;
    return json({ id: newId("draft"), title: `${section?.fullTitle || "薄弱点"} · 补充笔记`, sectionId: section?.id, content: localDraft, confirmed: false });
  }

  return json({ error: "接口不存在" }, 404);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawPath } = await context.params;
  const parts = cleanPath(rawPath);
  const [root, id] = parts;
  const body = await request.json().catch(() => ({}));

  if (root === "notes" && id) {
    let savedId = id;
    const next = await updateState((state) => {
      const chapterId = String(body.sectionId || "").split(".")[0];
      const chapterNote = body.append && chapterId
        ? state.notes.find((item) => item.sectionId?.split(".")[0] === chapterId)
        : undefined;
      const note = state.notes.find((item) => item.id === id) || chapterNote;
      const now = new Date().toISOString();
      if (note) {
        savedId = note.id;
        note.versions ??= [];
        note.versions.push({
          id: newId("note-version"),
          title: note.title,
          content: note.content,
          images: [...(note.images || [])],
          createdAt: now,
        });
        const addition = String(body.content || "").trim();
        const content = body.append && addition
          ? `${String(note.content || "").trim()}\n\n---\n\n${addition}`
          : body.content || "";
        Object.assign(note, {
          title: body.append ? note.title : body.title || note.title,
          sectionId: note.sectionId || body.sectionId,
          content,
          source: note.source || body.source || "manual",
          images: [...new Set([...(note.images || []), ...(body.images || [])])],
          updatedAt: now,
          confirmed: true,
        });
      } else {
        state.notes.unshift({
          id,
          title: body.title || "未命名笔记",
          sectionId: body.sectionId,
          content: body.content || "",
          source: body.source || "manual",
          images: body.images || [],
          updatedAt: now,
          confirmed: true,
          versions: [],
        });
      }
      return state;
    });
    return json({ note: next.notes.find((item) => item.id === savedId) });
  }

  if (root === "plans" && id) {
    const next = await updateState((state) => {
      const task = state.planTasks.find((item) => item.id === id);
      if (task) Object.assign(task, body, { userOverride: true });
      else state.planTasks.push({ id, title: body.title || "新学习任务", date: body.date || new Date().toISOString().slice(0, 10), minutes: Number(body.minutes) || 20, kind: body.kind || "综合", status: "todo", locked: false, userOverride: true });
      return state;
    });
    return json({ tasks: next.planTasks });
  }
  return json({ error: "接口不存在" }, 404);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawPath } = await context.params;
  const [root, id] = cleanPath(rawPath);
  if (root === "plans" && id) {
    const next = await updateState((state) => {
      state.planTasks = state.planTasks.filter((item) => item.id !== id);
      return state;
    });
    return json({ tasks: next.planTasks });
  }
  return json({ error: "接口不存在" }, 404);
}
