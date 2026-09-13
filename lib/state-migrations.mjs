export const CURRENT_SCHEMA_VERSION = 3;

function noteChapter(note) {
  return note.sectionId?.split(".")[0] || null;
}

function snapshotNote(note, id, createdAt) {
  return {
    id,
    title: note.title,
    content: note.content,
    images: [...(note.images || [])],
    createdAt,
  };
}

function consolidateChapterNotes(notes) {
  const groups = new Map();
  for (const note of notes) {
    note.versions ??= [];
    const chapterId = noteChapter(note);
    if (!chapterId) continue;
    const group = groups.get(chapterId) || [];
    group.push(note);
    groups.set(chapterId, group);
  }

  const removed = new Set();
  for (const [chapterId, group] of groups) {
    if (group.length < 2) continue;
    const canonical = group[0];
    for (const extra of group) {
      if (extra.id === canonical.id) continue;
      canonical.versions.push(snapshotNote(canonical, `migration-${chapterId}-${extra.id}`, extra.updatedAt || new Date(0).toISOString()));
      const addition = String(extra.content || "").trim();
      if (addition && !canonical.content.includes(addition)) {
        canonical.content = `${canonical.content.trim()}\n\n---\n\n## ${extra.title}\n\n${addition}`;
      }
      canonical.images = [...new Set([...(canonical.images || []), ...(extra.images || [])])];
      if (String(extra.updatedAt || "") > String(canonical.updatedAt || "")) canonical.updatedAt = extra.updatedAt;
      removed.add(extra.id);
    }
  }
  return notes.filter((note) => !removed.has(note.id));
}

export function migrateState(input) {
  const state = structuredClone(input);
  const fromVersion = Number(state.schemaVersion) || 1;

  if (fromVersion < 2) {
    state.savedSessions ??= [];
    state.questionIssues ??= [];
    state.schemaVersion = 2;
  }

  if (state.schemaVersion < 3) {
    for (const session of [state.activeSession, ...(state.savedSessions || []), ...(state.sessionHistory || [])].filter(Boolean)) {
      session.elapsedSeconds = Math.max(0, Number(session.elapsedSeconds) || 0);
    }
    state.notes = consolidateChapterNotes(state.notes || []);
    state.schemaVersion = 3;
  }

  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`不支持的数据版本：${state.schemaVersion}`);
  }

  return { state, fromVersion, changed: fromVersion !== CURRENT_SCHEMA_VERSION };
}

export function stateInventory(state) {
  return {
    schemaVersion: Number(state.schemaVersion) || 1,
    activeSession: state.activeSession
      ? {
          id: state.activeSession.id,
          sectionId: state.activeSession.sectionId,
          status: state.activeSession.status,
          answerCount: Object.keys(state.activeSession.answers || {}).length,
          elapsedSeconds: Number(state.activeSession.elapsedSeconds) || 0,
        }
      : null,
    sessionHistory: state.sessionHistory?.length || 0,
    savedSessions: state.savedSessions?.length || 0,
    attempts: state.attempts?.length || 0,
    notes: state.notes?.length || 0,
    planTasks: state.planTasks?.length || 0,
    completedSections: [...(state.progress?.completedSections || [])],
    questionIssues: state.questionIssues?.length || 0,
  };
}
