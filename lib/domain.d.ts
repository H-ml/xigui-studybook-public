import type { AttemptRecord, FeedbackTiming, PracticeMode, Question, Section, SessionAnswer, StudySession } from "./types";

export function evidenceFor(practiceMode: PracticeMode, feedbackTiming: FeedbackTiming, referenceAssisted?: boolean): "open_book" | "closed_book_immediate" | "closed_book_section";
export function statusForAttempts(attempts: AttemptRecord[]): "新记录" | "薄弱" | "巩固中" | "较稳定" | "已掌握";
export function recommendMode(input: { hasAttempts: boolean; hasOpenBook: boolean; dueReview: boolean }): { practiceMode: PracticeMode; feedbackTiming: FeedbackTiming; reason: string };
export function scoreSection(questions: Question[], answers: Record<string, SessionAnswer>): { correct: number; answered: number; total: number; accuracy: number };
export function isStaleCompletedSession(session: StudySession | null, completedIds?: string[]): boolean;
export function nextSectionId(sections: Section[], currentId?: string, completedIds?: string[]): string | null;
export function recommendedSectionId(input: {
  sections: Section[];
  activeSession?: StudySession | null;
  knowledge?: Record<string, { status: string; nextReview?: string }>;
  planTasks?: Array<{ status: string; sectionId?: string; kind: string; date: string }>;
  sessionHistory?: StudySession[];
  completedIds?: string[];
  today?: string;
}): string | null;
