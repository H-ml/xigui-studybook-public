export function evidenceFor(practiceMode, feedbackTiming, referenceAssisted = false) {
  if (practiceMode === "study" || referenceAssisted) return "open_book";
  return feedbackTiming === "section_end"
    ? "closed_book_section"
    : "closed_book_immediate";
}

export function statusForAttempts(attempts) {
  if (!attempts.length) return "新记录";
  const valid = attempts.filter((item) => !item.referenceAssisted);
  const closed = valid.filter((item) => item.evidenceType !== "open_book");
  const section = closed.filter((item) => item.evidenceType === "closed_book_section");
  const dates = new Set(closed.map((item) => item.answeredAt.slice(0, 10)));
  const correct = closed.filter((item) => item.correct).length;
  const rate = closed.length ? correct / closed.length : 0;
  if (closed.length && rate < 0.6) return "薄弱";
  if (section.length && dates.size >= 2 && rate >= 0.9) return "已掌握";
  if (section.length && dates.size >= 2 && rate >= 0.75) return "较稳定";
  if (closed.length) return "巩固中";
  return "新记录";
}

export function recommendMode({ hasAttempts, hasOpenBook, dueReview }) {
  if (!hasAttempts) return { practiceMode: "study", feedbackTiming: "immediate", reason: "第一次进入本小节" };
  if (dueReview) return { practiceMode: "practice", feedbackTiming: "immediate", reason: "薄弱点到期复习" };
  if (hasOpenBook) return { practiceMode: "practice", feedbackTiming: "section_end", reason: "检验是否真正掌握" };
  return { practiceMode: "practice", feedbackTiming: "immediate", reason: "继续巩固最近错题" };
}

export function scoreSection(questions, answers) {
  const answered = questions.filter((question) => answers[question.id]?.answer);
  const correct = answered.filter(
    (question) => answers[question.id].answer === question.answer,
  ).length;
  return {
    correct,
    answered: answered.length,
    total: questions.length,
    accuracy: questions.length ? Math.round((correct / questions.length) * 100) : 0,
  };
}

export function isStaleCompletedSession(session, completedIds = []) {
  if (!session || !completedIds.includes(session.sectionId)) return false;
  const hasAnswer = Object.values(session.answers || {}).some((item) => Boolean(item?.answer));
  return !hasAnswer && (session.currentQuestionIndex || 0) === 0;
}

function sectionOrder(sectionId) {
  return sectionId.split(".").map((part) => Number(part) || 0);
}

export function nextSectionId(sections, currentId, completedIds = []) {
  const completed = new Set(completedIds);
  const available = sections
    .filter((section) => section.questionIds?.length)
    .sort((left, right) => {
      const a = sectionOrder(left.id);
      const b = sectionOrder(right.id);
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const difference = (a[index] || 0) - (b[index] || 0);
        if (difference) return difference;
      }
      return 0;
    });
  const currentIndex = available.findIndex((section) => section.id === currentId);
  const afterCurrent = currentIndex >= 0 ? available.slice(currentIndex + 1) : available;
  return (
    afterCurrent.find((section) => !completed.has(section.id))?.id ||
    available.find((section) => !completed.has(section.id) && section.id !== currentId)?.id ||
    null
  );
}

/**
 * @param {{
 *   sections: import("./types").Section[],
 *   activeSession?: import("./types").StudySession | null,
 *   knowledge?: Record<string, {status: string, nextReview?: string}>,
 *   planTasks?: Array<{status: string, sectionId?: string, kind: string, date: string}>,
 *   sessionHistory?: import("./types").StudySession[],
 *   completedIds?: string[],
 *   today?: string
 * }} input
 */
export function recommendedSectionId({
  sections,
  activeSession,
  knowledge = {},
  planTasks = [],
  sessionHistory = [],
  completedIds = [],
  today,
}) {
  if (activeSession && activeSession.status !== "completed") return activeSession.sectionId;
  const date = today || new Date().toISOString().slice(0, 10);
  const dueWeak = Object.entries(knowledge).find(([, value]) => value.status === "薄弱" && (!value.nextReview || value.nextReview <= date));
  if (dueWeak?.[0]) return dueWeak[0];

  const completed = new Set(completedIds);
  const eligiblePlan = (task) => task.status === "todo" && task.sectionId && (!completed.has(task.sectionId) || task.kind === "复习");
  const duePlanned = planTasks.find((task) => eligiblePlan(task) && task.date <= date);
  if (duePlanned?.sectionId) return duePlanned.sectionId;

  const lastCompleted = [...sessionHistory].reverse().find((session) => session.status === "completed");
  const afterLast = nextSectionId(sections, lastCompleted?.sectionId, completedIds);
  if (afterLast) return afterLast;

  const anyPlanned = planTasks.find(eligiblePlan);
  return anyPlanned?.sectionId || nextSectionId(sections, undefined, completedIds);
}
