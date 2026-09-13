export type PracticeMode = "study" | "practice";
export type FeedbackTiming = "immediate" | "section_end";
export type EvidenceType =
  | "open_book"
  | "closed_book_immediate"
  | "closed_book_section";
export type KnowledgeStatus = "新记录" | "薄弱" | "巩固中" | "较稳定" | "已掌握";
export type QuestionIssueType = "stem" | "options" | "answer" | "explanation" | "source";

export interface SourceAnchor {
  printedPage: number;
  physicalPage: number;
  quote?: string;
  confidence: "high" | "section";
}

export interface Question {
  id: string;
  number: number;
  sectionId: string;
  stem: string;
  options: Record<string, string>;
  answer: string;
  explanation: string;
  source: string;
  exercisePage: number;
  textbookPage?: number;
  rawReferencePage?: number;
  sourceAnchor?: SourceAnchor;
  qualityFlags?: string[];
  needsReview?: boolean;
}

export interface Section {
  id: string;
  chapterId: string;
  title: string;
  fullTitle: string;
  sourcePageStart: number;
  sourcePageEnd: number;
  physicalPageStart: number;
  physicalPageEnd: number;
  questionIds: string[];
  noteId?: string;
  importedNoteLength?: number;
}

export interface Catalog {
  generatedAt: string;
  textbook: { filename: string; pages: number };
  exerciseBook: { filename: string; pages: number };
  sections: Section[];
  questions: Question[];
  reviewQueue: Array<{ id: string; reason: string; page: number }>;
  stats: { sectionCount: number; questionCount: number; reviewCount: number };
}

export interface SessionAnswer {
  answer: string;
  submitted: boolean;
  revealed: boolean;
  correct?: boolean;
  answeredAt?: string;
  revealedAt?: string;
  changedBeforeSubmit: boolean;
  referenceAssisted: boolean;
  evidenceType?: EvidenceType;
}

export interface StudySession {
  id: string;
  sectionId: string;
  questionIds: string[];
  currentQuestionIndex: number;
  practiceMode: PracticeMode;
  feedbackTiming: FeedbackTiming;
  referenceOpened: boolean;
  status: "active" | "paused" | "completed";
  sourcePageStart: number;
  sourcePageEnd: number;
  pdfPage: number;
  targetMinutes: number;
  elapsedSeconds: number;
  recommendation: string;
  startedAt: string;
  updatedAt: string;
  answers: Record<string, SessionAnswer>;
}

export interface PlanTask {
  id: string;
  date: string;
  title: string;
  sectionId?: string;
  minutes: number;
  kind: "综合" | "复习";
  status: "todo" | "done";
  locked: boolean;
  userOverride: boolean;
}

export interface NoteVersion {
  id: string;
  title: string;
  content: string;
  images: string[];
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  title: string;
  sectionId?: string;
  content: string;
  source: "manual";
  images: string[];
  updatedAt: string;
  confirmed: boolean;
  versions: NoteVersion[];
}

export interface AttemptRecord {
  id: string;
  questionId: string;
  sectionId: string;
  sectionGroupId: string;
  answer: string;
  correct: boolean;
  evidenceType: EvidenceType;
  referenceAssisted: boolean;
  answeredAt: string;
  revealedAt?: string;
  changedBeforeSubmit: boolean;
}

export interface QuestionIssue {
  id: string;
  questionId: string;
  sectionId: string;
  type: QuestionIssueType;
  note: string;
  status: "open" | "resolved";
  createdAt: string;
  questionSnapshot: {
    stem: string;
    options: Record<string, string>;
    answer: string;
    explanation: string;
  };
}

export interface AppState {
  schemaVersion: number;
  activeSession: StudySession | null;
  savedSessions: StudySession[];
  sessionHistory: StudySession[];
  attempts: AttemptRecord[];
  questionIssues: QuestionIssue[];
  notes: NoteRecord[];
  planTasks: PlanTask[];
  preferences: {
    lastPracticeFeedback: FeedbackTiming;
    defaultLightMinutes: number;
    reducedMotion: boolean;
  };
  knowledge: Record<
    string,
    { status: KnowledgeStatus; nextReview?: string; correct: number; total: number }
  >;
  progress: {
    totalMinutes: number;
    completedSections: string[];
    learningDates: string[];
  };
  proposals: Record<string, { id: string; changes: Array<{ taskId: string; from: string; to: string }>; applied: boolean }>;
}
