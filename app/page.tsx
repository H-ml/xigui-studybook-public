"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AppState, FeedbackTiming, NoteRecord, PlanTask, PracticeMode, Question, QuestionIssueType, Section, StudySession } from "../lib/types";
import { recommendedSectionId } from "../lib/domain.mjs";

type View = "home" | "session" | "plan" | "notes";
type Bootstrap = {
  state: AppState;
  sections: Array<Section & { questionCount: number }>;
  stats: { sectionCount: number; questionCount: number; reviewCount: number };
  weekly: { completedSessions: number; answered: number; totalMinutes: number };
  currentTime: string;
  examDate: string | null;
  today: { taskCount: number; completed: number };
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function dateLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function weekday(date: string) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${date}T12:00:00`).getDay()];
}

function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown-view">
      {content.split("\n").map((line, index) => {
        const image = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(line.trim());
        if (image) return <img key={index} src={image[2]} alt={image[1] || "笔记插图"} loading="lazy" />; // eslint-disable-line @next/next/no-img-element
        if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
        if (/^[-*]\s/.test(line)) return <div className="md-list" key={index}>• {line.replace(/^[-*]\s/, "")}</div>;
        if (/^\d+\.\s/.test(line)) return <div className="md-list" key={index}>{line}</div>;
        if (line.startsWith(">")) return <blockquote key={index}>{line.replace(/^>\s?/, "")}</blockquote>;
        if (!line.trim()) return <div className="md-space" key={index} />;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-book" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span>系规练习簿</span>}
    </div>
  );
}

function Header({ view, onNavigate, active }: { view: View; onNavigate: (view: View) => void; active: boolean }) {
  return (
    <header className="topbar">
      <button className="brand-button" onClick={() => onNavigate("home")} aria-label="回到首页"><Brand /></button>
      <nav aria-label="主导航">
        {([[
          "home", "今日"
        ], ["plan", "计划"], ["notes", "笔记"]] as Array<[View, string]>).map(([id, label]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => onNavigate(id)}>{label}</button>
        ))}
      </nav>
      <button className="header-action" onClick={() => onNavigate(active ? "session" : "home")}>{active ? "继续学习" : "开始学习"}<span>→</span></button>
    </header>
  );
}

function Loading() {
  return (
    <main className="loading-page">
      <Brand />
      <div className="loading-paper"><span>正在翻开你的练习簿</span><i /></div>
    </main>
  );
}

function SectionPicker({ data, currentId, onSelect, onClose }: { data: Bootstrap; currentId?: string; onSelect: (sectionId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = data.sections.filter((section) => section.questionCount > 0 && (!normalized || `${section.id} ${section.title}`.toLowerCase().includes(normalized)));
  const chapters = [...new Set(visible.map((section) => section.chapterId))];
  const savedBySection = new Map(data.state.savedSessions.map((session) => [session.sectionId, session]));

  const statusFor = (section: Section & { questionCount: number }) => {
    if (data.state.activeSession?.sectionId === section.id && data.state.activeSession.status !== "completed") {
      return `进行中 · 第 ${data.state.activeSession.currentQuestionIndex + 1} 题`;
    }
    const saved = savedBySection.get(section.id);
    if (saved) return `已暂停 · 第 ${saved.currentQuestionIndex + 1} 题`;
    if (data.state.progress.completedSections.includes(section.id)) return data.state.knowledge[section.id]?.status || "已学习";
    return "未开始";
  };

  return <div className="modal-backdrop section-picker-backdrop" role="dialog" aria-modal="true" aria-label="选择学习小节">
    <div className="section-picker">
      <div className="modal-heading"><div><span className="hand-note">随时可以换一节</span><h2>章节目录</h2></div><button onClick={onClose}>×</button></div>
      <p>直接开始仍由系统安排；只有你主动选择时，才会切换本次学习内容。原小节进度会自动保存。</p>
      <label className="section-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 4.2 或小节名称" autoFocus /></label>
      <div className="section-groups">
        {chapters.map((chapterId) => {
          const sections = visible.filter((section) => section.chapterId === chapterId);
          const isCurrentChapter = currentId?.split(".")[0] === chapterId;
          return <details key={chapterId} open={Boolean(normalized) || isCurrentChapter}>
            <summary><b>第 {chapterId} 章</b><span>{sections.length} 个小节</span></summary>
            <div>{sections.map((section) => <button key={section.id} className={section.id === currentId ? "current" : ""} onClick={() => onSelect(section.id)}><span><b>{section.fullTitle}</b><small>{section.questionCount} 道题 · 一本通 P{section.sourcePageStart}–{section.sourcePageEnd}</small></span><em>{statusFor(section)}</em></button>)}</div>
          </details>;
        })}
      </div>
    </div>
  </div>;
}

function Home({ data, onStart, onNavigate, starting }: { data: Bootstrap; onStart: (minutes?: number, sectionId?: string) => Promise<boolean>; onNavigate: (view: View) => void; starting: boolean }) {
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const state = data.state;
  const active = state.activeSession && state.activeSession.status !== "completed" ? state.activeSession : null;
  const weak = Object.values(state.knowledge).some((item) => item.status === "薄弱");
  const title = active ? "接着刚才的地方" : weak ? "先把容易忘的稳住" : data.today.completed ? "计划完成，也可以再学一点" : "现在，学一点";
  const button = active ? "继续学习" : data.today.completed ? "再学一会儿" : "开始学习";
  const sectionId = recommendedSectionId({
    sections: data.sections,
    activeSession: state.activeSession,
    knowledge: state.knowledge,
    planTasks: state.planTasks,
    sessionHistory: state.sessionHistory,
    completedIds: state.progress.completedSections,
  });
  const section = data.sections.find((item) => item.id === sectionId) || data.sections.find((item) => item.questionCount > 0);
  const mode = active?.recommendation || "学习模式 · 第一次进入本小节";
  const currentWeek = Array.from({ length: 7 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7) + index);
    return value.toISOString().slice(0, 10);
  });
  const doneDates = new Set(state.progress.learningDates);
  const countdown = data.examDate
    ? Math.max(0, Math.ceil((new Date(data.examDate).getTime() - new Date(data.currentTime).getTime()) / 86400000))
    : null;
  const overall = Math.round((state.progress.completedSections.length / Math.max(1, data.sections.length)) * 100);
  const todayTasks = state.planTasks.filter((task) => task.date === new Date().toISOString().slice(0, 10));

  return (
    <main className="home-page page-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{new Date(data.currentTime).toLocaleDateString("zh-CN", { weekday: "short" })} · 今天不用先做决定</span>
          <h1 className={title.length > 6 ? "long-title" : ""}>{title}</h1>
          <p className="hand-note">计划可以调整，你只管开始 <span className="scribble-arrow">↘</span></p>
          <p className="hero-intro">系统已经替你接好上次进度、今日计划和薄弱点。打开就学，停下也不会丢。</p>
          <button className="primary-pill" onClick={() => onStart()} disabled={starting}>{starting ? "正在准备…" : button}<span>→</span></button>
          <div className="quiet-adjust">
            <span>本次约 {active?.targetMinutes || 20} 分钟</span>
            {!active && <><button onClick={() => onStart(10)}>10</button><button onClick={() => onStart(30)}>30</button><button onClick={() => onStart(45)}>45</button></>}
          </div>
        </div>
        <article className="studybook-card">
          <div className="tape" aria-hidden="true" />
          <div className="card-kicker"><span>本次学习簿</span><span className="status-dot">已备好</span></div>
          <h2>{section?.fullTitle || "正在整理下一小节"}</h2>
          <p className="mode-line">{mode}</p>
          <div className="session-facts">
            <div><b>{active ? active.currentQuestionIndex + 1 : 1}</b><span>当前题号</span></div>
            <div><b>{section?.questionCount || section?.questionIds.length || 0}</b><span>小节题目</span></div>
            <div><b>P{section?.sourcePageStart || "-"}</b><span>教材起页</span></div>
          </div>
          <div className="card-footer-line"><span>系统为什么这样安排？</span><p>{active ? "恢复未完成会话，避免重新选择。" : "这是计划中最靠前、且尚未完成的小节。"}</p><button className="change-section-button" onClick={() => setSectionPickerOpen(true)}>换一节</button></div>
          <div className="pencil" aria-hidden="true"><i /></div>
        </article>
      </section>

      <section className="today-grid">
        <article className="paper-panel weekly-panel">
          <div className="panel-heading"><div><span className="eyebrow">本周脚印</span><h3>你已经在路上了</h3></div><button onClick={() => onNavigate("plan")}>看计划 →</button></div>
          <div className="week-strip">
            {currentWeek.map((date) => {
              const isToday = date === new Date().toISOString().slice(0, 10);
              const isDone = doneDates.has(date);
              return <div key={date} className={`${isToday ? "today" : ""} ${isDone ? "done" : ""}`}><span>{weekday(date).slice(1)}</span><b>{new Date(`${date}T12:00:00`).getDate()}</b><i>{isDone ? "✓" : ""}</i></div>;
            })}
          </div>
          <div className="week-copy"><strong>{data.weekly.answered} 道</strong><span>本周作答</span><strong>{data.weekly.completedSessions} 次</strong><span>完整学习</span><strong>{state.notes.length} 篇</strong><span>已收进笔记</span></div>
        </article>
        <article className="paper-panel progress-panel">
          <span className="eyebrow">备考进度</span>
          <div className="big-number">{overall}<small>%</small></div>
          <div className="progress-track"><i style={{ width: `${Math.max(3, overall)}%` }} /></div>
          <p>已完成 {state.progress.completedSections.length} / {data.sections.length} 个教材小节</p>
          {countdown !== null && <div className="countdown"><b>{countdown}</b><span>天后进入考试窗口</span></div>}
        </article>
      </section>

      <section className="lower-grid">
        <article className="paper-panel task-panel">
          <div className="panel-heading"><div><span className="eyebrow">今天的安排</span><h3>做得到的，才是好计划</h3></div><span>{todayTasks.reduce((sum, task) => sum + task.minutes, 0)} 分钟</span></div>
          <div className="task-list">
            {todayTasks.length ? todayTasks.map((task) => <div key={task.id} className={task.status === "done" ? "complete" : ""}><i>{task.status === "done" ? "✓" : ""}</i><span><b>{task.title}</b><small>{task.kind} · {task.minutes} 分钟</small></span><em>{task.locked ? "已锁定" : "可调整"}</em></div>) : <div className="empty-line">今天没有硬性任务，随时开始一段 20 分钟轻学习。</div>}
          </div>
        </article>
        <article className="feedback-card">
          <span className="feedback-mark">good!</span>
          <h3>{state.attempts.length ? "每一次闭卷证据，都在让判断更准" : "第一步不是学很多，是先开始"}</h3>
          <p>{state.attempts.length ? `已经积累 ${state.attempts.length} 条作答证据。学习模式不会虚报掌握，真正稳定要靠跨日闭卷。` : "题库已经准备好。现在只差按下开始，笔记和计划会随着学习逐步形成。"}</p>
          <button onClick={() => onNavigate("notes")}>看看我的知识笔记 →</button>
        </article>
      </section>
      <footer className="orange-band"><Brand /><span>少一点切换，多一点真的学进去。</span><b>{new Date().getFullYear()} · 系统规划与管理师</b></footer>
      {sectionPickerOpen && <SectionPicker data={data} currentId={section?.id} onClose={() => setSectionPickerOpen(false)} onSelect={(selectedId) => { setSectionPickerOpen(false); onStart(undefined, selectedId); }} />}
    </main>
  );
}

function TextbookPageViewer({
  page,
  physicalPageStart,
  physicalPageEnd,
  printedPageStart,
  onPageChange,
  onCollapse,
}: {
  page: number;
  physicalPageStart: number;
  physicalPageEnd: number;
  printedPageStart: number;
  onPageChange: (page: number) => void;
  onCollapse?: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const safePage = Math.max(physicalPageStart, Math.min(physicalPageEnd, page));
  const printedPage = printedPageStart + safePage - physicalPageStart;
  const pageUrl = `/api/materials/textbook/pages/${safePage}?v=1${retry ? `&r=${retry}` : ""}`;

  useEffect(() => {
    for (const adjacent of [safePage - 1, safePage + 1]) {
      if (adjacent < physicalPageStart || adjacent > physicalPageEnd) continue;
      const preload = new window.Image();
      preload.src = `/api/materials/textbook/pages/${adjacent}?v=1`;
    }
  }, [physicalPageEnd, physicalPageStart, safePage]);

  const changePage = (nextPage: number) => {
    onPageChange(Math.max(physicalPageStart, Math.min(physicalPageEnd, nextPage)));
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const retryPage = () => {
    setFailedPage(null);
    setLoadedPage(null);
    setRetry((value) => value + 1);
  };

  return (
    <>
      <div className="pane-toolbar">
        <div><b>综合考点一本通</b><span>印刷 P{printedPage} · PDF {safePage}</span></div>
        <div className="textbook-tools">
          <button disabled={safePage <= physicalPageStart} onClick={() => changePage(safePage - 1)} aria-label="上一页教材">←</button>
          <button disabled={safePage >= physicalPageEnd} onClick={() => changePage(safePage + 1)} aria-label="下一页教材">→</button>
          <button disabled={zoom <= 70} onClick={() => setZoom((value) => Math.max(70, value - 15))} aria-label="缩小教材">−</button>
          <span>{zoom}%</span>
          <button disabled={zoom >= 175} onClick={() => setZoom((value) => Math.min(175, value + 15))} aria-label="放大教材">＋</button>
          <button onClick={() => viewportRef.current?.requestFullscreen()}>全屏</button>
          <a href={`/api/materials/textbook#page=${safePage}&view=FitH`} target="_blank" rel="noreferrer" title="在新标签页打开完整 PDF">原 PDF</a>
          {onCollapse && <button onClick={onCollapse}>收起</button>}
        </div>
      </div>
      <div className="textbook-page-viewport" ref={viewportRef}>
        {loadedPage !== safePage && failedPage !== safePage && <div className="textbook-page-status"><i /><b>正在翻到印刷 P{printedPage}</b><span>只加载这一页，前后页会在后台准备</span></div>}
        {failedPage === safePage ? <div className="textbook-page-status error"><b>这一页暂时没有加载出来</b><span>可以重试，或临时打开完整 PDF。</span><div><button onClick={retryPage}>重新加载</button><a href={`/api/materials/textbook#page=${safePage}&view=FitH`} target="_blank" rel="noreferrer">打开完整 PDF</a></div></div> : <Image
          key={pageUrl}
          className={loadedPage === safePage ? "textbook-page-image loaded" : "textbook-page-image"}
          src={pageUrl}
          alt={`综合考点一本通印刷第 ${printedPage} 页`}
          width={993}
          height={1404}
          unoptimized
          style={{ width: `${zoom}%` }}
          onLoad={() => setLoadedPage(safePage)}
          onError={() => setFailedPage(safePage)}
        />}
      </div>
    </>
  );
}

function SessionView({ bootstrap, session, setSession, onBack, onStartSection, refreshBootstrap }: { bootstrap: Bootstrap; session: StudySession; setSession: (session: StudySession) => void; onBack: () => void; onStartSection: (sectionId: string) => Promise<boolean>; refreshBootstrap: () => Promise<void> }) {
  const [section, setSection] = useState<Section | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(session.elapsedSeconds || 0);
  const [timerActive, setTimerActive] = useState(true);
  const [noteOpen, setNoteOpen] = useState(true);
  const [referenceVisible, setReferenceVisible] = useState(session.practiceMode === "study" || session.referenceOpened);
  const [mobilePane, setMobilePane] = useState<"textbook" | "question" | "notes">("question");
  const [draft, setDraft] = useState<{ id: string; title: string; sectionId?: string; content: string } | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<{ correct: number; total: number; accuracy: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [issueDraft, setIssueDraft] = useState<{ type: QuestionIssueType; note: string } | null>(null);
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueQueueOpen, setIssueQueueOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(elapsed);
  const [pdfWidth, setPdfWidth] = useState(50);

  useEffect(() => {
    api<{ section: Section; questions: Question[] }>(`/api/sections/${encodeURIComponent(session.sectionId)}`).then((result) => {
      setSection(result.section);
      setQuestions(result.questions);
      setLoading(false);
    });
  }, [session.sectionId]);

  useEffect(() => {
    const updateTimerState = () => setTimerActive(document.visibilityState === "visible" && document.hasFocus());
    updateTimerState();
    document.addEventListener("visibilitychange", updateTimerState);
    window.addEventListener("focus", updateTimerState);
    window.addEventListener("blur", updateTimerState);
    return () => {
      document.removeEventListener("visibilitychange", updateTimerState);
      window.removeEventListener("focus", updateTimerState);
      window.removeEventListener("blur", updateTimerState);
    };
  }, []);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    if (!timerActive) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerActive]);

  const currentIndex = Math.min(session.currentQuestionIndex, Math.max(0, questions.length - 1));
  const question = questions[currentIndex];
  const currentAnswer = question ? session.answers[question.id] : undefined;
  const answeredCount = questions.filter((item) => session.answers[item.id]?.answer).length;
  const modeLabel = session.practiceMode === "study" ? "学习模式" : session.feedbackTiming === "immediate" ? "逐题揭晓" : "小节交卷";
  const chapterNotes = bootstrap.state.notes.filter((note) => note.sectionId?.split(".")[0] === session.sectionId.split(".")[0]);
  const relatedNote = chapterNotes[0];
  const orderedSections = useMemo(
    () => [...bootstrap.sections]
      .filter((item) => item.questionCount > 0)
      .sort((left, right) => left.id.localeCompare(right.id, "zh-CN", { numeric: true })),
    [bootstrap.sections],
  );
  const sectionPosition = orderedSections.findIndex((item) => item.id === session.sectionId);
  const previousSection = sectionPosition > 0 ? orderedSections[sectionPosition - 1] : null;
  const nextSection = sectionPosition >= 0 ? orderedSections[sectionPosition + 1] : null;

  useEffect(() => {
    if (!timerActive) return;
    const timer = window.setInterval(() => {
      void api("/api/session/progress", {
        method: "POST",
        body: JSON.stringify({ currentQuestionIndex: currentIndex, pdfPage: session.pdfPage, elapsedSeconds: elapsedRef.current }),
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [currentIndex, session.id, session.pdfPage, timerActive]);

  const switchSection = async (sectionId: string) => {
    setSectionPickerOpen(false);
    setMessage("");
    setReport(null);
    await api("/api/session/progress", {
      method: "POST",
      body: JSON.stringify({ currentQuestionIndex: currentIndex, pdfPage: session.pdfPage, elapsedSeconds: elapsedRef.current }),
    });
    setLoading(true);
    const started = await onStartSection(sectionId);
    if (!started) setLoading(false);
  };

  const updateMode = async (practiceMode: PracticeMode, feedbackTiming?: FeedbackTiming) => {
    const result = await api<{ session: StudySession }>("/api/session/mode", { method: "POST", body: JSON.stringify({ practiceMode, feedbackTiming }) });
    setSession(result.session);
    setReferenceVisible(practiceMode === "study");
    setMobilePane("question");
  };

  const move = async (nextIndex: number) => {
    const safe = Math.max(0, Math.min(questions.length - 1, nextIndex));
    const next = { ...session, currentQuestionIndex: safe, updatedAt: new Date().toISOString() };
    setSession(next);
    await api("/api/session/progress", { method: "POST", body: JSON.stringify({ currentQuestionIndex: safe, pdfPage: session.pdfPage, elapsedSeconds: elapsedRef.current }) });
    paneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const answerQuestion = async (choice: string) => {
    if (!question || currentAnswer?.submitted) return;
    const result = await api<{ answer: StudySession["answers"][string] }>(`/api/questions/${question.id}/answer`, { method: "POST", body: JSON.stringify({ answer: choice }) });
    setSession({ ...session, answers: { ...session.answers, [question.id]: result.answer } });
    if (result.answer.revealed) {
      setMessage(result.answer.correct ? "答对了。先说出你为什么选它，再继续。" : "这一步还不稳，解析和教材位置已经展开。");
    }
  };

  const openReference = async () => {
    if (!section || !question) return;
    const targetPage = question.sourceAnchor?.physicalPage || section.physicalPageStart;
    let updatedSession = session;
    if (!session.referenceOpened) {
      const result = await api<{ session: StudySession }>(`/api/questions/${question?.id || "current"}/reference-opened`, { method: "POST", body: "{}" });
      updatedSession = result.session;
    }
    updatedSession = { ...updatedSession, pdfPage: targetPage, elapsedSeconds: elapsedRef.current };
    setSession(updatedSession);
    await api("/api/session/progress", { method: "POST", body: JSON.stringify({ currentQuestionIndex: currentIndex, pdfPage: targetPage, elapsedSeconds: elapsedRef.current }) });
    setReferenceVisible(true);
    setMobilePane("textbook");
  };

  const createDraft = async () => {
    if (!question) return;
    const result = await api<{ id: string; title: string; sectionId?: string; content: string }>("/api/notes/draft", { method: "POST", body: JSON.stringify({ questionId: question.id }) });
    setDraft(result);
  };

  const saveDraft = async () => {
    if (!draft) return;
    setDraftSaving(true);
    const result = await api<{ note: NoteRecord }>(`/api/notes/${draft.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...draft, source: "manual", append: Boolean(relatedNote) }),
    });
    setDraftSaving(false);
    setDraft(null);
    setMessage(`已自动排版并追加到《${result.note.title}》，下一轮会生成闭卷回忆题。`);
    await refreshBootstrap();
  };

  const submitSection = async () => {
    if (!section) return;
    setSubmitting(true);
    try {
      const result = await api<{ report: { correct: number; total: number; accuracy: number }; session: StudySession }>(`/api/sections/${section.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ elapsedSeconds: elapsedRef.current }),
      });
      setSession(result.session);
      setReport(result.report);
      await refreshBootstrap();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "暂时无法完成小节");
    } finally {
      setSubmitting(false);
    }
  };

  const continueToNextSection = async () => {
    if (!section) return;
    setContinuing(true);
    try {
      const result = await api<{ session: StudySession }>("/api/session/next", { method: "POST", body: JSON.stringify({ sectionId: section.id, targetMinutes: session.targetMinutes }) });
      setReport(null);
      setQuestions([]);
      setSection(null);
      setSession(result.session);
      await refreshBootstrap();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "暂时没有可继续的小节");
      setReport(null);
      onBack();
    } finally {
      setContinuing(false);
    }
  };

  const submitIssue = async () => {
    if (!question || !issueDraft) return;
    setIssueSaving(true);
    try {
      const result = await api<{ issue: { id: string } }>(`/api/questions/${question.id}/issue`, { method: "POST", body: JSON.stringify(issueDraft) });
      setIssueDraft(null);
      setMessage(`已记录为 ${result.issue.id}，可在“校验记录”中查看。你的作答证据不会被修改。`);
      await refreshBootstrap();
    } finally {
      setIssueSaving(false);
    }
  };

  const pause = async () => {
    await api("/api/session/pause", { method: "POST", body: JSON.stringify({ currentQuestionIndex: currentIndex, pdfPage: session.pdfPage, elapsedSeconds: elapsedRef.current }) });
    await refreshBootstrap();
    onBack();
  };

  const startResize = (event: React.PointerEvent) => {
    if (!paneRef.current) return;
    const startX = event.clientX;
    const startWidth = pdfWidth;
    const total = paneRef.current.getBoundingClientRect().width;
    const onMove = (moveEvent: PointerEvent) => setPdfWidth(Math.max(32, Math.min(68, startWidth + ((moveEvent.clientX - startX) / total) * 100)));
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (loading || !question || !section) return <div className="session-loading"><span>正在铺开教材和本小节题目…</span></div>;

  return (
    <main className={`session-page ${session.practiceMode} ${session.feedbackTiming}`}>
      <header className="session-header">
        <button className="icon-button" onClick={pause} aria-label="暂停并回到首页">←</button>
        <Brand />
        <button className="session-title" onClick={() => setSectionPickerOpen(true)} title="切换学习小节"><b>{section.fullTitle}</b><span>{currentIndex + 1} / {questions.length} · 已答 {answeredCount} · 换一节</span></button>
        <div className="mode-switch" aria-label="学习模式选择">
          <button className={session.practiceMode === "study" ? "active" : ""} onClick={() => updateMode("study", "immediate")}>学习模式</button>
          <button className={session.practiceMode === "practice" ? "active" : ""} onClick={() => updateMode("practice", session.feedbackTiming)}>刷题模式</button>
        </div>
        {session.practiceMode === "practice" && <div className="timing-switch"><button className={session.feedbackTiming === "immediate" ? "active" : ""} onClick={() => updateMode("practice", "immediate")}>逐题揭晓</button><button className={session.feedbackTiming === "section_end" ? "active" : ""} onClick={() => updateMode("practice", "section_end")}>小节交卷</button></div>}
        <div className={`timer ${timerActive ? "counting" : "idle"}`} title="只统计练习页可见且浏览器获得焦点的时间"><i />{formatTime(elapsed)}<small>{timerActive ? "计时中" : "已暂停计时"}</small></div>
        <button className="pause-button" onClick={pause}>暂停</button>
      </header>

      <div className="session-progress"><i style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
      <div className="mode-explainer">
        <b>{modeLabel}</b>
        <span>{session.practiceMode === "study" ? "教材保持打开；结果记为开卷学习证据" : session.feedbackTiming === "immediate" ? "提交后立即揭晓；答案不可修改" : "交卷前不显示答案；可以返回修改"}</span>
        {session.referenceOpened && session.practiceMode === "practice" && <em>已查看一本通 · 本组不计闭卷证据</em>}
        <nav className="section-quick-nav" aria-label="小节快速跳转">
          <button disabled={!previousSection} onClick={() => previousSection && switchSection(previousSection.id)} title={previousSection?.fullTitle}>← 上一节</button>
          <button onClick={() => setSectionPickerOpen(true)}>章节目录</button>
          <button disabled={!nextSection} onClick={() => nextSection && switchSection(nextSection.id)} title={nextSection?.fullTitle}>下一节 →</button>
        </nav>
      </div>
      {session.practiceMode === "study" && <div className="mobile-tabs" aria-label="学习区域">
        <button className={mobilePane === "textbook" ? "active" : ""} onClick={() => setMobilePane("textbook")}>教材</button>
        <button className={mobilePane === "question" ? "active" : ""} onClick={() => setMobilePane("question")}>题目</button>
        <button className={mobilePane === "notes" ? "active" : ""} onClick={() => { setNoteOpen(true); setMobilePane("notes"); }}>笔记</button>
      </div>}

      <div className={`learning-workspace ${referenceVisible ? "with-reference" : "question-only"}`} ref={paneRef}>
        {referenceVisible && <section className={`pdf-pane ${mobilePane === "textbook" ? "mobile-active" : ""}`} style={{ width: session.practiceMode === "study" ? `${pdfWidth}%` : "42%" }}>
          <TextbookPageViewer
            page={session.pdfPage}
            physicalPageStart={section.physicalPageStart}
            physicalPageEnd={section.physicalPageEnd}
            printedPageStart={section.sourcePageStart}
            onPageChange={(pdfPage) => setSession({ ...session, pdfPage })}
            onCollapse={session.practiceMode === "practice" ? () => setReferenceVisible(false) : undefined}
          />
        </section>}
        {referenceVisible && session.practiceMode === "study" && <button className="resize-handle" onPointerDown={startResize} aria-label="拖动调整教材宽度" />}
        <section className={`question-pane ${mobilePane === "question" ? "mobile-active" : ""}`} style={referenceVisible && session.practiceMode === "study" ? { width: `${100 - pdfWidth}%` } : undefined}>
          {!referenceVisible && session.practiceMode === "practice" && <button className="reference-peek" onClick={openReference}>查看一本通 <small>会标记为参考辅助</small></button>}
          <article className="question-paper">
            <div className="question-meta"><span>第 {question.number} 题</span><em>{question.source}</em><button onClick={() => setIssueDraft({ type: "answer", note: "" })}>题目有问题？</button><button onClick={() => setIssueQueueOpen(true)}>校验记录 {bootstrap.state.questionIssues.length}</button><button onClick={() => setNoteOpen((value) => !value)}>{noteOpen ? "收起笔记" : "打开笔记"}</button></div>
            <h2>{question.stem}</h2>
            <div className="option-list">
              {Object.entries(question.options).map(([key, value]) => {
                const selected = currentAnswer?.answer === key;
                const revealed = currentAnswer?.revealed;
                const correct = revealed && key === question.answer;
                const wrong = revealed && selected && key !== question.answer;
                return <button key={key} className={`${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} disabled={Boolean(currentAnswer?.submitted)} onClick={() => answerQuestion(key)}><b>{key}</b><span>{value}</span>{correct && <em>正确答案</em>}{wrong && <em>你的选择</em>}</button>;
              })}
            </div>
            {session.feedbackTiming === "section_end" && session.practiceMode === "practice" && currentAnswer?.answer && <p className="hidden-answer-note">答案已暂存。整组交卷前，你可以返回修改。</p>}
            {currentAnswer?.revealed && <div className={`answer-sheet ${currentAnswer.correct ? "right" : "needs-work"}`}>
              <div className="answer-heading"><b>{currentAnswer.correct ? "这一步答稳了" : `正确答案是 ${question.answer}`}</b><span>{currentAnswer.referenceAssisted ? "open_book · 参考辅助" : currentAnswer.evidenceType}</span></div>
              <p>{question.explanation || "解析暂缺，这道题已进入人工校对队列。"}</p>
              <button onClick={openReference}>回到一本通 P{question.sourceAnchor?.printedPage || section.sourcePageStart} 对照</button>
            </div>}
            {message && <div className="inline-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
            {session.practiceMode === "study" && currentAnswer?.revealed && <div className="memory-actions"><button onClick={() => setMessage("很好。下一次会用闭卷题验证，不会因为这次开卷答对就直接标成掌握。")}>我记住了</button><button className="warn" onClick={createDraft}>这里没记住</button><button onClick={createDraft}>＋ 加入笔记</button></div>}
            {session.practiceMode === "practice" && currentAnswer?.revealed && !currentAnswer.correct && <div className="memory-actions"><button className="warn" onClick={createDraft}>生成补充笔记</button><button onClick={() => setMessage("已安排两天后以逐题揭晓方式重做。")}>安排近期重做</button></div>}
            <div className="question-navigation">
              <button disabled={currentIndex === 0} onClick={() => move(currentIndex - 1)}>← 上一题</button>
              <div>{questions.slice(Math.max(0, currentIndex - 3), Math.min(questions.length, currentIndex + 4)).map((item) => { const index = questions.indexOf(item); return <button key={item.id} className={`${index === currentIndex ? "active" : ""} ${session.answers[item.id]?.answer ? "answered" : ""}`} onClick={() => move(index)}>{index + 1}</button>; })}</div>
              {currentIndex < questions.length - 1 ? <button disabled={session.feedbackTiming === "immediate" && !currentAnswer?.revealed} onClick={() => move(currentIndex + 1)}>下一题 →</button> : <button className="finish-button" disabled={answeredCount < questions.length || submitting} onClick={submitSection}>{submitting ? "正在交卷…" : session.practiceMode === "study" ? "完成小节" : "交卷"}</button>}
            </div>
            {session.practiceMode === "practice" && session.feedbackTiming === "section_end" && currentIndex < questions.length - 1 && <button className="section-submit" disabled={answeredCount < questions.length || submitting} onClick={submitSection}>小节交卷 · 已答 {answeredCount}/{questions.length}</button>}
          </article>
        </section>
        {noteOpen && <aside className={`notes-drawer ${mobilePane === "notes" ? "mobile-active" : ""}`}>
          <div className="drawer-heading"><div><span className="eyebrow">本章唯一笔记</span><b>{relatedNote?.title || `第 ${section.chapterId} 章笔记`}</b></div><button onClick={() => setNoteOpen(false)}>×</button></div>
          {relatedNote ? <MarkdownView content={relatedNote.content} /> : <div className="drawer-empty"><b>这一章还没有正式笔记</b><p>答错或点“这里没记住”时，会先生成草稿；确认后自动排版并持续追加到本章同一份笔记。</p></div>}
        </aside>}
      </div>

      {draft && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="笔记草稿">
        <div className="note-modal">
          <div className="modal-heading"><div><span className="hand-note">先确认，再保存</span><h2>{draft.title}</h2></div><button onClick={() => setDraft(null)}>×</button></div>
          <p className="draft-disclaimer">这是根据教材位置、题目解析和已有笔记生成的草稿。确认后会自动排版并追加到{relatedNote ? `《${relatedNote.title}》` : "本章唯一笔记"}，不会再为每道题新建文件。</p>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="笔记标题" />
          <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} aria-label="笔记内容" />
          <div className="modal-actions"><button onClick={() => setDraft(null)}>暂不保存</button><button className="primary-pill" disabled={draftSaving} onClick={saveDraft}>{draftSaving ? "保存中…" : "确认并保存"}</button></div>
        </div>
      </div>}

      {issueDraft && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="提交题目问题">
        <div className="small-modal issue-modal">
          <div className="modal-heading"><div><span className="hand-note">帮助题库越用越准</span><h2>这道题哪里有问题？</h2></div><button onClick={() => setIssueDraft(null)}>×</button></div>
          <p>会保存当前题目的快照并进入校验队列，不会改动你已经产生的作答证据。</p>
          <label>问题类型<select value={issueDraft.type} onChange={(event) => setIssueDraft({ ...issueDraft, type: event.target.value as QuestionIssueType })}><option value="stem">题干错误</option><option value="options">选项错误</option><option value="answer">答案错误</option><option value="explanation">解析错误</option><option value="source">教材定位错误</option></select></label>
          <label>补充说明<textarea value={issueDraft.note} onChange={(event) => setIssueDraft({ ...issueDraft, note: event.target.value })} placeholder="例如：D 选项混入了页脚，或正确答案应为……" /></label>
          <button className="primary-pill" disabled={issueSaving} onClick={submitIssue}>{issueSaving ? "提交中…" : "加入校验队列"}</button>
        </div>
      </div>}

      {issueQueueOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="题目校验记录">
        <div className="issue-queue-modal">
          <div className="modal-heading"><div><span className="hand-note">每一条都有记录</span><h2>题目校验记录</h2></div><button onClick={() => setIssueQueueOpen(false)}>×</button></div>
          <p>记录保存在本机学习状态中。修题前保留当时的题目快照，不会静默改动已有作答。</p>
          <div className="issue-queue-list">
            {[...bootstrap.state.questionIssues].reverse().map((issue) => <article key={issue.id}>
              <header><b>{issue.sectionId} · 题目 {issue.questionId}</b><span className={issue.status}>{issue.status === "open" ? "待校验" : "已处理"}</span></header>
              <p>{issue.questionSnapshot.stem}</p>
              <footer><span>{({ stem: "题干", options: "选项", answer: "答案", explanation: "解析", source: "教材定位" } as Record<QuestionIssueType, string>)[issue.type]}问题</span><span>{issue.note || "未补充说明"}</span><time>{new Date(issue.createdAt).toLocaleString("zh-CN")}</time></footer>
              <small>{issue.id}</small>
            </article>)}
            {!bootstrap.state.questionIssues.length && <div className="drawer-empty"><b>还没有校验记录</b><p>遇到题目、选项、答案、解析或教材定位问题时，可以从题目右上角提交。</p></div>}
          </div>
        </div>
      </div>}

      {report && <div className="modal-backdrop report-backdrop" role="dialog" aria-modal="true">
        <div className="completion-card">
          <span className="feedback-mark">done!</span>
          <p className="eyebrow">{section.fullTitle} · 已完成</p>
          <h2>{session.practiceMode === "study" ? "这一小节，已经认真碰过一遍" : report.accuracy >= 80 ? "闭卷证据不错，间隔可以拉长了" : "薄弱点已经被找出来了"}</h2>
          <div className="report-number"><b>{report.accuracy}%</b><span>{report.correct} / {report.total} 题正确</span></div>
          <div className="report-evidence"><div><b>{session.practiceMode === "study" ? "open_book" : session.referenceOpened ? "reference_assisted" : session.feedbackTiming === "section_end" ? "closed_book_section" : "closed_book_immediate"}</b><span>本次掌握证据</span></div><div><b>{bootstrap.state.notes.filter((note) => note.sectionId?.split(".")[0] === section.chapterId).length}</b><span>本章正式笔记</span></div><div><b>{report.total - report.correct}</b><span>需要再稳一稳</span></div></div>
          <p className="report-copy">{session.practiceMode === "study" ? "学习模式只记录接触和理解，不会直接标为已掌握。系统会在两天后安排一次闭卷逐题复习。" : "掌握状态会结合跨日期闭卷结果更新；查看过教材的题不会混进闭卷证据。"}</p>
          <div className="completion-actions"><button className="primary-pill" disabled={continuing} onClick={continueToNextSection}>{continuing ? "正在准备下一节…" : "继续"} <span>→</span></button><button onClick={() => { setReport(null); onBack(); }}>回看笔记</button><button onClick={() => { setReport(null); onBack(); }}>结束本次</button></div>
        </div>
      </div>}
      {sectionPickerOpen && <SectionPicker data={bootstrap} currentId={section.id} onClose={() => setSectionPickerOpen(false)} onSelect={switchSection} />}
    </main>
  );
}

function PlanView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const [scope, setScope] = useState<"week" | "list">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTargetDate, setDragTargetDate] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<PlanTask | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [planMessage, setPlanMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", date: new Date().toISOString().slice(0, 10), minutes: 30, kind: "综合" });
  const tasks = data.state.planTasks;
  const start = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7) + weekOffset * 7);
    return value;
  }, [weekOffset]);
  const days = Array.from({ length: 7 }, (_, index) => { const value = new Date(start); value.setDate(start.getDate() + index); return value.toISOString().slice(0, 10); });
  const weekRange = `${dateLabel(days[0])}—${dateLabel(days[6])}`;

  const updateTask = async (task: PlanTask, change: Partial<PlanTask>) => {
    await api(`/api/plans/${task.id}`, { method: "PUT", body: JSON.stringify(change) });
    await refresh();
  };
  const beginDrag = (event: DragEvent<HTMLElement>, task: PlanTask) => {
    if (task.locked) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDragging(task.id);
    setPlanMessage(`正在移动“${task.title}”`);
  };
  const endDrag = () => {
    setDragging(null);
    setDragTargetDate(null);
  };
  const drop = async (event: DragEvent<HTMLElement>, date: string) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || dragging;
    const task = tasks.find((item) => item.id === taskId);
    endDrag();
    if (!task || task.locked) {
      setPlanMessage("没有移动任务；锁定的任务需要先解锁。");
      return;
    }
    if (task.date === date) {
      setPlanMessage(`“${task.title}”仍在${weekday(date)}，没有改动。`);
      return;
    }
    await updateTask(task, { date });
    setPlanMessage(`已把“${task.title}”移动到${weekday(date)} ${dateLabel(date)}。`);
  };
  const moveWithPicker = async () => {
    if (!rescheduling || !rescheduleDate) return;
    const task = rescheduling;
    await updateTask(task, { date: rescheduleDate });
    setPlanMessage(`已把“${task.title}”移动到 ${dateLabel(rescheduleDate)}。`);
    setRescheduling(null);
  };
  const split = async (task: PlanTask) => {
    const half = Math.max(10, Math.ceil(task.minutes / 2));
    await updateTask(task, { minutes: half });
    const nextDate = new Date(`${task.date}T12:00:00`); nextDate.setDate(nextDate.getDate() + 1);
    await api(`/api/plans/${task.id}-split-${Date.now()}`, { method: "PUT", body: JSON.stringify({ ...task, id: undefined, title: `${task.title}（续）`, minutes: task.minutes - half || half, date: nextDate.toISOString().slice(0, 10), userOverride: true }) });
    await refresh();
  };
  const remove = async (task: PlanTask) => { await api(`/api/plans/${task.id}`, { method: "DELETE" }); await refresh(); };
  const add = async () => { await api(`/api/plans/plan-${Date.now()}`, { method: "PUT", body: JSON.stringify({ ...draft, status: "todo", locked: false }) }); setAdding(false); setDraft({ ...draft, title: "" }); await refresh(); };
  return (
    <main className="page-shell inner-page plan-page">
      <section className="inner-hero"><div><span className="eyebrow">可编辑，但不拦住你</span><h1>把计划当路线，<br />不是门槛。</h1><p>拖动、拆分、锁定都可以。落后时先继续学，系统只给重排预案，不会偷偷改你的安排。</p></div><div className="plan-summary-card"><span className="hand-note">this week</span><b>{tasks.filter((task) => days.includes(task.date) && task.status === "todo").reduce((sum, task) => sum + task.minutes, 0)}</b><em>分钟待完成</em><p>{tasks.filter((task) => task.userOverride).length} 个任务由你手动调整，自动重排会尊重它们。</p></div></section>
      <div className="view-toolbar">
        <div className="segmented">{(["week", "list"] as const).map((item) => <button key={item} className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{item === "week" ? "周视图" : "任务列表"}</button>)}</div>
        {scope === "week" && <nav className="week-navigation" aria-label="切换计划周"><button onClick={() => setWeekOffset((value) => value - 1)}>← 上一周</button><button className="week-current" onClick={() => setWeekOffset(0)}>{weekOffset === 0 ? "本周" : weekRange}</button><button onClick={() => setWeekOffset((value) => value + 1)}>下一周 →</button></nav>}
        <div><button className="primary-pill small" onClick={() => setAdding(true)}>＋ 添加任务</button></div>
      </div>
      <p className="plan-drag-hint">抓住任务左上角的 <b>⠿</b>，拖到另一天下方即可改期；锁定任务不会被移动。</p>
      {planMessage && <p className="plan-live-message" role="status">{planMessage}</p>}
      {scope === "week" && <div className="week-board">
        {days.map((date) => <section key={date} className={`${date === new Date().toISOString().slice(0, 10) ? "today" : ""} ${dragTargetDate === date ? "drop-target" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (dragging) setDragTargetDate(date); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dragging && dragTargetDate !== date) setDragTargetDate(date); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTargetDate((current) => current === date ? null : current); }} onDrop={(event) => void drop(event, date)}><header><span>{weekday(date)}</span><b>{dateLabel(date)}</b>{date === new Date().toISOString().slice(0, 10) && <em>今天</em>}</header><div className="day-capacity">{tasks.filter((task) => task.date === date).reduce((sum, task) => sum + task.minutes, 0)} 分钟</div>{dragTargetDate === date && <div className="drop-guide">放到这里</div>}{tasks.filter((task) => task.date === date).map((task) => <PlanCard key={task.id} task={task} dragging={dragging === task.id} onDragStart={(event) => beginDrag(event, task)} onDragEnd={endDrag} onMove={() => { setRescheduling(task); setRescheduleDate(task.date); }} onUpdate={updateTask} onSplit={split} onRemove={remove} />)}<button className="day-add" onClick={() => { setDraft({ ...draft, date }); setAdding(true); }}>＋</button></section>)}
      </div>}
      {scope === "list" && <div className="plan-list">{[...tasks].sort((a, b) => a.date.localeCompare(b.date)).map((task) => <PlanCard key={task.id} task={task} onMove={() => { setRescheduling(task); setRescheduleDate(task.date); }} onUpdate={updateTask} onSplit={split} onRemove={remove} />)}</div>}
      {adding && <div className="modal-backdrop"><div className="small-modal"><div className="modal-heading"><h2>添加学习任务</h2><button onClick={() => setAdding(false)}>×</button></div><label>做什么<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：1.1 小节学习" /></label><label>日期<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label>预计分钟<input type="number" min="10" step="5" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: Number(event.target.value) })} /></label><label>类型<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}><option>综合</option><option>复习</option></select></label><button className="primary-pill" disabled={!draft.title} onClick={add}>添加到计划</button></div></div>}
      {rescheduling && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="移动计划任务"><div className="small-modal"><div className="modal-heading"><div><span className="hand-note">换一天继续</span><h2>移动任务</h2></div><button onClick={() => setRescheduling(null)}>×</button></div><p>“{rescheduling.title}”</p><label>移动到<input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label><div className="modal-actions"><button onClick={() => setRescheduling(null)}>取消</button><button className="primary-pill" disabled={!rescheduleDate || rescheduleDate === rescheduling.date} onClick={moveWithPicker}>确认移动</button></div></div></div>}
    </main>
  );
}

function PlanCard({ task, dragging = false, onDragStart, onDragEnd, onMove, onUpdate, onSplit, onRemove }: { task: PlanTask; dragging?: boolean; onDragStart?: (event: DragEvent<HTMLElement>) => void; onDragEnd?: () => void; onMove: () => void; onUpdate: (task: PlanTask, change: Partial<PlanTask>) => void; onSplit: (task: PlanTask) => void; onRemove: (task: PlanTask) => void }) {
  return <article className={`plan-card kind-${task.kind} ${task.status === "done" ? "done" : ""} ${dragging ? "dragging" : ""}`}><div className="plan-card-top">{onDragStart && <span className={`drag-handle ${task.locked ? "locked" : ""}`} draggable={!task.locked} onDragStart={onDragStart} onDragEnd={onDragEnd} title={task.locked ? "解锁后才能拖动" : "拖到其他日期"} aria-label={task.locked ? "任务已锁定" : "拖动任务改期"}>⠿</span>}<span>{task.kind}</span>{task.userOverride && <em>手动</em>}<button title={task.locked ? "解锁" : "锁定"} onClick={() => onUpdate(task, { locked: !task.locked })}>{task.locked ? "●" : "○"}</button></div><b contentEditable suppressContentEditableWarning onBlur={(event) => event.currentTarget.textContent !== task.title && onUpdate(task, { title: event.currentTarget.textContent || task.title })}>{task.title}</b><div className="plan-card-bottom"><span>{task.minutes} 分钟</span><div><button onClick={onMove}>改期</button><button onClick={() => onSplit(task)}>拆分</button><button onClick={() => onRemove(task)}>删除</button></div></div></article>;
}

function NotesView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(data.state.notes[0]?.id || "");
  const selected = data.state.notes.find((note) => note.id === selectedId);
  const [editing, setEditing] = useState<NoteRecord | null>(selected ? { ...selected } : null);
  const [preview, setPreview] = useState(true);
  const [saved, setSaved] = useState(false);
  const save = async () => { if (!editing) return; await api(`/api/notes/${editing.id}`, { method: "PUT", body: JSON.stringify(editing) }); setSaved(true); window.setTimeout(() => setSaved(false), 1600); await refresh(); };

  return (
    <main className="page-shell inner-page notes-page">
      <section className="inner-hero notes-hero"><div><span className="eyebrow">从“没记住”长出来</span><h1>你的知识，<br />应该越学越完整。</h1><p>初始笔记为空。学习中可以根据题目解析生成草稿，确认、修改并沉淀为自己的笔记，随时可以导出为 Markdown。</p></div><div className="note-stack"><i /><i /><article><span className="hand-note">my notes</span><b>{data.state.notes.length}</b><em>篇正式笔记</em><small>内容只保存在你的数据目录</small></article></div></section>
      <div className="notes-workspace">
        <aside className="note-list-panel"><div className="note-list-heading"><b>全部笔记</b><Link href="/api/notes/export" prefetch={false}>导出 Markdown ↗</Link></div><div className="note-search">⌕ <input placeholder="搜索标题或小节" /></div>{data.state.notes.map((note) => <button key={note.id} className={note.id === selectedId ? "active" : ""} onClick={() => { setSelectedId(note.id); setEditing({ ...note }); }}><span>{note.sectionId || "未分组"}</span><b>{note.title}</b><small>个人学习笔记</small></button>)}</aside>
        <section className="note-editor-panel">
          {editing ? <><div className="editor-toolbar"><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /><div className="segmented"><button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>编辑</button><button className={preview ? "active" : ""} onClick={() => setPreview(true)}>预览</button></div><button onClick={save}>{saved ? "已保存 ✓" : "保存"}</button></div>{preview ? <div className="note-preview"><MarkdownView content={editing.content} /></div> : <textarea className="markdown-editor" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} />}</> : <div className="empty-notes">还没有正式笔记。学习时答错或点“这里没记住”，确认后的草稿会出现在这里。</div>}
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [session, setSession] = useState<StudySession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>("/api/bootstrap");
      setData(result);
      if (result.state.activeSession) setSession(result.state.activeSession);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "应用数据加载失败");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const start = async (minutes?: number, sectionId?: string) => {
    setStarting(true);
    try {
      const result = await api<{ session: StudySession }>("/api/session/start", { method: "POST", body: JSON.stringify({ targetMinutes: minutes, sectionId }) });
      setSession(result.session);
      setView("session");
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法开始");
      return false;
    } finally { setStarting(false); }
  };
  const navigate = (next: View) => {
    if (next === "session") {
      if (session && session.status !== "completed") setView("session");
      else start();
      return;
    }
    setView(next);
  };
  if (!data) return <><Loading />{error && <div className="global-error">{error}</div>}</>;
  const active = Boolean(data.state.activeSession && data.state.activeSession.status !== "completed");
  return <div className="app-root">{view !== "session" && <Header view={view} onNavigate={navigate} active={active} />}{error && <div className="global-error">{error}<button onClick={() => setError("")}>×</button></div>}{view === "home" && <Home data={data} onStart={start} onNavigate={navigate} starting={starting} />}{view === "session" && session && <SessionView key={session.id} bootstrap={data} session={session} setSession={setSession} onBack={() => setView("home")} onStartSection={(sectionId) => start(undefined, sectionId)} refreshBootstrap={refresh} />}{view === "plan" && <PlanView data={data} refresh={refresh} />}{view === "notes" && <NotesView data={data} refresh={refresh} />}</div>;
}
