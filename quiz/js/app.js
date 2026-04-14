/**
 * Quiz app: loads bank via question-bank.js, renders questions, scores, review.
 */
import { loadQuestionBank, filterQuestions, normalizeQuestion } from "./question-bank.js";
import {
  bankFingerprint,
  ensureBankContext,
  recordQuestionAnswer,
  recordAttempt,
  getQuestionStat,
  getAggregateStats,
  getRecentAttempts,
  clearAll,
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  saveLastResults,
  loadLastResults,
} from "./quiz-storage.js";
import { initTheme } from "./theme.js";

const PAGE_HOME = "home";
const PAGE_QUIZ = "quiz";
const PAGE_REVIEW = "review";

function getPageKind() {
  const path = window.location.pathname.toLowerCase();
  if (path.endsWith("/quiz.html")) return PAGE_QUIZ;
  if (path.endsWith("/review.html")) return PAGE_REVIEW;
  return PAGE_HOME;
}

const currentPage = getPageKind();

/** @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic permutation of choice indices for display (same order every time for this question).
 * @param {number} choiceCount
 * @param {number | string} orderSeed
 */
function getShuffledChoiceIndices(choiceCount, orderSeed) {
  const indices = Array.from({ length: choiceCount }, (_, i) => i);
  const seed =
    (typeof orderSeed === "string"
      ? [...orderSeed].reduce((acc, ch) => (Math.imul(acc, 31) + ch.charCodeAt(0)) | 0, 0)
      : Number(orderSeed)) >>> 0;
  const rng = mulberry32(seed || 1);
  for (let i = choiceCount - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}

const els = {
  progressFill: document.getElementById("progress-fill"),
  progressMeta: document.getElementById("progress-meta"),
  viewStart: document.getElementById("view-start"),
  viewQuiz: document.getElementById("view-quiz"),
  viewResults: document.getElementById("view-results"),
  bankTitle: document.getElementById("bank-title"),
  bankCount: document.getElementById("bank-count"),
  sectionFilter: document.getElementById("section-filter"),
  btnStart: document.getElementById("btn-start"),
  questionTag: document.getElementById("question-tag"),
  questionHistory: document.getElementById("question-history"),
  questionStem: document.getElementById("question-stem"),
  options: document.getElementById("options"),
  feedback: document.getElementById("feedback"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnFinish: document.getElementById("btn-finish"),
  questionJump: document.getElementById("question-jump"),
  scoreValue: document.getElementById("score-value"),
  scoreSummary: document.getElementById("score-summary"),
  reviewList: document.getElementById("review-list"),
  loadError: document.getElementById("load-error"),
  statsPanel: document.getElementById("stats-panel"),
  statsSummary: document.getElementById("stats-summary"),
  statsAttemptsWrap: document.getElementById("stats-attempts-wrap"),
  statsAttempts: document.getElementById("stats-attempts"),
  btnClearStorage: document.getElementById("btn-clear-storage"),
  resumePanel: document.getElementById("resume-panel"),
  resumeSummary: document.getElementById("resume-summary"),
  btnResume: document.getElementById("btn-resume"),
  btnDiscardSession: document.getElementById("btn-discard-session"),
  btnQuizHome: document.getElementById("btn-quiz-home"),
  btnStartExam: document.getElementById("btn-start-exam"),
  quizTimer: document.getElementById("quiz-timer"),
};

initTheme();

/** @type {ReturnType<normalizeQuestion>[]} */
let queue = [];
let index = 0;
/** @type {Record<number, { choiceIndex: number, correct: boolean }>} */
let answers = {};

/** @type {string} Section dropdown value (empty = all sections); used for resume + attempt labels */
let sectionFilterValue = "";

/** @type {number} */
let bankQuestionCount = 0;

/** @type {{ title?: string, questionCount?: number, questions: object[] } | null} */
let bankData = null;

/** Practice vs exam (no per-question feedback until submit). */
let examMode = false;

/** @type {number | null} ms since epoch; session timer start */
let quizTimerStartedAt = null;

/** @type {ReturnType<typeof setInterval> | null} */
let quizTimerIntervalId = null;

const EXAM_QUESTION_TARGET = 100;

function formatElapsedSeconds(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function updateQuizTimerDisplay() {
  if (!els.quizTimer || quizTimerStartedAt == null) return;
  els.quizTimer.textContent = formatElapsedSeconds((Date.now() - quizTimerStartedAt) / 1000);
}

function stopQuizTimerInterval() {
  if (quizTimerIntervalId != null) {
    clearInterval(quizTimerIntervalId);
    quizTimerIntervalId = null;
  }
}

/** Start or resume the stopwatch (interval updates every second). */
function startQuizTimer(fromTimestamp = null) {
  stopQuizTimerInterval();
  quizTimerStartedAt = fromTimestamp ?? Date.now();
  updateQuizTimerDisplay();
  quizTimerIntervalId = setInterval(updateQuizTimerDisplay, 1000);
}

/** Clear interval only (keep start time for persistence). */
function pauseQuizTimerInterval() {
  stopQuizTimerInterval();
}

/** Stop interval and reset display/state. */
function resetQuizTimer() {
  stopQuizTimerInterval();
  quizTimerStartedAt = null;
  if (els.quizTimer) els.quizTimer.textContent = "0:00";
}

/**
 * @param {ReturnType<normalizeQuestion>[]} questions
 * @param {number} count
 */
function pickRandomQuestions(questions, count) {
  const n = Math.min(count, questions.length);
  const copy = questions.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = copy[i];
    copy[i] = copy[j];
    copy[j] = t;
  }
  return copy.slice(0, n);
}

function setFinishButtonLabel() {
  els.btnFinish.textContent = examMode ? "Submit exam" : "Finish session";
}

function navigateTo(page) {
  const target = page === PAGE_QUIZ ? "quiz.html" : page === PAGE_REVIEW ? "review.html" : "home.html";
  const here = window.location.pathname.toLowerCase();
  if (here.endsWith(`/${target}`)) return;
  window.location.assign(target);
}

function persistSession() {
  if (!bankData || !queue.length) return;
  saveActiveSession({
    bankFingerprint: bankFingerprint(bankData),
    sectionFilter: sectionFilterValue,
    questionOrders: queue.map((q) => q.order),
    index,
    answers,
    examMode,
    ...(quizTimerStartedAt != null ? { timerStartedAt: quizTimerStartedAt } : {}),
  });
}

function updateResumePanel() {
  const s = loadActiveSession();
  if (!s || !bankData || s.bankFingerprint !== bankFingerprint(bankData) || !s.questionOrders.length) {
    els.resumePanel.classList.add("hidden");
    return;
  }
  const n = s.questionOrders.length;
  const answered = Object.keys(s.answers).length;
  const sectionLabel = s.examMode
    ? `Exam (${s.questionOrders.length} questions)`
    : s.sectionFilter
      ? s.sectionFilter
      : "All sections";
  const at = Math.min(s.index + 1, n);
  els.resumeSummary.textContent = `${sectionLabel} · ${answered} of ${n} answered · question ${at} of ${n}`;
  els.resumePanel.classList.remove("hidden");
}

/**
 * @param {{ questions: object[] }} bank
 * @param {number[]} orders
 */
function rebuildQueueFromOrders(bank, orders) {
  const map = new Map(bank.questions.map((q) => [q.order, normalizeQuestion(q)]));
  const out = [];
  for (const o of orders) {
    const n = map.get(o);
    if (!n) return [];
    out.push(n);
  }
  return out;
}

function setProgress() {
  const total = queue.length;
  const pct = total ? ((index + 1) / total) * 100 : 0;
  els.progressFill.style.width = `${pct}%`;
  const prefix = examMode ? "Exam · " : "";
  els.progressMeta.textContent = total ? `${prefix}Question ${index + 1} of ${total}` : "";
  const bar = els.progressFill.closest('[role="progressbar"]');
  if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function renderQuestion() {
  const q = queue[index];
  if (!q) return;

  const shortSection = q.section.replace(/^Section\s*\d*:\s*/i, "").trim() || "Quiz";
  els.questionTag.textContent = shortSection.slice(0, 72) + (shortSection.length > 72 ? "…" : "");
  els.questionStem.textContent = q.question;
  els.options.innerHTML = "";
  els.feedback.classList.add("hidden");
  els.feedback.textContent = "";

  const answered = answers[q.order];
  const perm = getShuffledChoiceIndices(q.choices.length, q.order);

  els.options.className = "options options--radio";

  perm.forEach((originalIndex) => {
    const choice = q.choices[originalIndex];
    const label = document.createElement("label");
    label.className = "option-radio option-btn";
    label.dataset.originalIndex = String(originalIndex);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `q-${q.order}`;
    input.value = String(originalIndex);
    input.className = "option-radio-input";

    const text = document.createElement("span");
    text.className = "option-radio-text";
    text.textContent = choice.text;

    label.appendChild(input);
    label.appendChild(text);

    if (examMode) {
      if (answered && answered.choiceIndex === originalIndex) {
        input.checked = true;
        label.classList.add("exam-selected");
      }
      input.addEventListener("change", () => {
        if (input.checked) selectOption(originalIndex);
      });
    } else if (answered) {
      input.disabled = true;
      input.checked = answered.choiceIndex === originalIndex;
      if (choice.correct) label.classList.add("correct-reveal");
      if (answered.choiceIndex === originalIndex && !choice.correct) label.classList.add("incorrect-reveal");
      if (answered.choiceIndex === originalIndex && choice.correct) label.classList.add("selected");
    } else {
      input.addEventListener("change", () => {
        if (input.checked) selectOption(originalIndex);
      });
    }

    els.options.appendChild(label);
  });

  if (!examMode && answered) {
    showFeedback(answered.correct);
  }

  if (!examMode) {
    const stat = getQuestionStat(q.order);
    if (stat && stat.seen > 0) {
      const acc = Math.round((stat.correctCount / stat.seen) * 100);
      els.questionHistory.textContent = `Answered ${stat.seen} time${stat.seen === 1 ? "" : "s"} · ${acc}% correct`;
      els.questionHistory.classList.remove("hidden");
    } else {
      els.questionHistory.textContent = "";
      els.questionHistory.classList.add("hidden");
    }
  } else {
    els.questionHistory.textContent = "";
    els.questionHistory.classList.add("hidden");
  }

  updateJumpHighlight();
  setProgress();
}

function selectOption(choiceIndex) {
  const q = queue[index];
  const choice = q.choices[choiceIndex];
  const correct = !!choice.correct;
  answers[q.order] = { choiceIndex, correct };

  if (examMode) {
    renderQuestion();
    updateJumpHighlight();
    persistSession();
    return;
  }

  els.options.querySelectorAll(".option-radio.option-btn").forEach((label) => {
    const oi = Number(label.dataset.originalIndex);
    const c = q.choices[oi];
    const input = label.querySelector("input");
    if (input) input.disabled = true;
    if (c.correct) label.classList.add("correct-reveal");
    if (oi === choiceIndex) {
      label.classList.add("selected");
      if (!c.correct) label.classList.add("incorrect-reveal");
    }
  });

  recordQuestionAnswer(q.order, correct);

  const st = getQuestionStat(q.order);
  if (st && st.seen > 0) {
    const acc = Math.round((st.correctCount / st.seen) * 100);
    els.questionHistory.textContent = `Answered ${st.seen} time${st.seen === 1 ? "" : "s"} · ${acc}% correct`;
    els.questionHistory.classList.remove("hidden");
  }

  showFeedback(correct);
  updateJumpHighlight();
  persistSession();
}

function showFeedback(ok) {
  els.feedback.classList.remove("hidden", "ok", "bad");
  els.feedback.classList.add(ok ? "ok" : "bad");
  els.feedback.textContent = ok ? "Correct." : "Not quite — the highlighted answer is correct.";
}

function goNext() {
  if (!queue.length) return;
  index = (index + 1) % queue.length;
  renderQuestion();
  persistSession();
}

function goPrev() {
  if (!queue.length) return;
  index = (index - 1 + queue.length) % queue.length;
  renderQuestion();
  persistSession();
}

function buildJumpNav() {
  els.questionJump.innerHTML = "";
  queue.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "jump-btn";
    b.textContent = String(i + 1);
    b.setAttribute("aria-label", `Question ${i + 1} of ${queue.length}`);
    b.addEventListener("click", () => {
      index = i;
      renderQuestion();
      persistSession();
    });
    els.questionJump.appendChild(b);
  });
}

function updateJumpHighlight() {
  const buttons = els.questionJump.querySelectorAll(".jump-btn");
  buttons.forEach((btn, i) => {
    const q = queue[i];
    const a = q ? answers[q.order] : null;
    btn.classList.toggle("jump-btn--current", i === index);
    if (examMode) {
      btn.classList.toggle("jump-btn--answered", !!a);
      btn.classList.remove("jump-btn--correct", "jump-btn--wrong");
    } else {
      btn.classList.remove("jump-btn--answered");
      btn.classList.toggle("jump-btn--correct", !!a?.correct);
      btn.classList.toggle("jump-btn--wrong", !!a && !a.correct);
    }
  });
  const currentBtn = buttons[index];
  if (currentBtn) {
    currentBtn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function showResults() {
  const elapsedSec =
    quizTimerStartedAt != null ? Math.floor((Date.now() - quizTimerStartedAt) / 1000) : 0;
  resetQuizTimer();

  clearActiveSession();

  if (examMode) {
    queue.forEach((q) => {
      const a = answers[q.order];
      if (a) recordQuestionAnswer(q.order, a.correct);
    });
  }

  let correctN = 0;
  let answeredCount = 0;
  queue.forEach((q) => {
    const a = answers[q.order];
    if (a) answeredCount += 1;
    if (a?.correct) correctN += 1;
  });
  const total = queue.length;
  const pct = total ? Math.round((correctN / total) * 100) : 0;
  const skipped = total - answeredCount;
  els.progressFill.style.width = "100%";
  els.progressMeta.textContent = "Complete";

  const attemptSectionLabel = examMode
    ? `Exam · ${sectionFilterValue || "All sections"} · ${queue.length} random`
    : sectionFilterValue || "All sections";

  recordAttempt({
    sectionFilter: attemptSectionLabel,
    total,
    correct: correctN,
    pct,
  });

  const misses = queue
    .map((q) => {
      const a = answers[q.order];
      if (a?.correct) return null;
      const right = q.choices.find((c) => c.correct);
      const yours = a ? q.choices[a.choiceIndex] : null;
      return {
        question: q.question,
        yourChoiceId: yours?.id || null,
        yourChoiceText: yours?.text || null,
        correctChoiceId: right?.id || null,
        correctChoiceText: right?.text || null,
      };
    })
    .filter(Boolean);

  saveLastResults({
    examMode,
    scorePct: pct,
    correct: correctN,
    total,
    skipped,
    elapsedSec,
    misses,
  });
  navigateTo(PAGE_REVIEW);
}

function restart() {
  if (examMode && bankData) {
    const section = els.sectionFilter.value;
    const filtered = filterQuestions(bankData.questions.map(normalizeQuestion), {
      section: section || undefined,
    });
    const pool = filtered.length ? filtered : bankData.questions.map(normalizeQuestion);
    queue = pickRandomQuestions(pool, EXAM_QUESTION_TARGET);
    sectionFilterValue = section;
  }
  index = 0;
  answers = {};
  if (currentPage !== PAGE_QUIZ) {
    persistSession();
    navigateTo(PAGE_QUIZ);
    return;
  }
  els.viewResults.classList.add("hidden");
  els.viewQuiz.classList.remove("hidden");
  startQuizTimer();
  buildJumpNav();
  renderQuestion();
  persistSession();
}

function renderProgressPanel() {
  const agg = getAggregateStats(bankQuestionCount);
  const lines = [
    `<strong>${agg.attemptsCompleted}</strong> completed quiz run${agg.attemptsCompleted === 1 ? "" : "s"}`,
    `<strong>${agg.questionsTouched}</strong> / ${agg.bankSize} questions answered at least once`,
  ];
  if (agg.totalAnswerEvents > 0 && agg.accuracyPct !== null) {
    lines.push(
      `<strong>${agg.accuracyPct}%</strong> overall accuracy across ${agg.totalAnswerEvents} answer${agg.totalAnswerEvents === 1 ? "" : "s"}`
    );
  }
  els.statsSummary.innerHTML = lines.join("<br />");

  const recent = getRecentAttempts(8);
  if (recent.length) {
    els.statsAttemptsWrap.classList.remove("hidden");
    els.statsAttempts.innerHTML = "";
    recent.forEach((a) => {
      const li = document.createElement("li");
      const when = new Date(a.at);
      const timeEl = document.createElement("time");
      timeEl.dateTime = a.at;
      timeEl.textContent = when.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const filter = a.sectionFilter ? ` · ${escapeHtml(a.sectionFilter)}` : " · All sections";
      li.appendChild(timeEl);
      const detail = document.createElement("span");
      detail.innerHTML = `${a.pct}% (${a.correct}/${a.total})${filter}`;
      li.appendChild(detail);
      els.statsAttempts.appendChild(li);
    });
  } else {
    els.statsAttemptsWrap.classList.add("hidden");
    els.statsAttempts.innerHTML = "";
  }

  els.statsPanel.classList.remove("hidden");
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderSavedResults() {
  const saved = loadLastResults();
  if (!saved || !els.viewResults) {
    navigateTo(PAGE_HOME);
    return;
  }
  examMode = !!saved.examMode;

  const restartBtn = els.viewResults.querySelector('[data-results-action="restart"]');
  if (restartBtn) restartBtn.textContent = saved.examMode ? "New exam" : "Practice again";

  els.scoreValue.textContent = `${saved.scorePct}%`;
  let summary = `${saved.correct} of ${saved.total} correct`;
  if (saved.skipped > 0) summary += ` · ${saved.skipped} not answered`;
  summary += ` · Time ${formatElapsedSeconds(saved.elapsedSec || 0)}.`;
  els.scoreSummary.textContent = summary;

  els.reviewList.innerHTML = "";
  (saved.misses || []).forEach((m) => {
    const item = document.createElement("div");
    item.className = "review-item card";
    const stem = document.createElement("p");
    stem.className = "title-lg";
    stem.style.marginBottom = "0.75rem";
    stem.textContent = m.question;
    const detail = document.createElement("p");
    detail.style.fontSize = "0.9375rem";
    detail.style.color = "color-mix(in srgb, var(--on_surface) 70%, transparent)";
    const yourLabel = m.yourChoiceId
      ? `<strong>${m.yourChoiceId}.</strong> ${escapeHtml(m.yourChoiceText || "")}`
      : null;
    const correctLabel = `<strong>${m.correctChoiceId}.</strong> ${escapeHtml(m.correctChoiceText || "")}`;
    detail.innerHTML = yourLabel
      ? `Your answer: ${yourLabel}<br />Correct answer: ${correctLabel}`
      : `Correct answer: ${correctLabel}`;
    item.appendChild(stem);
    item.appendChild(detail);
    els.reviewList.appendChild(item);
  });

  if (!els.reviewList.children.length) {
    const p = document.createElement("p");
    p.className = "lede";
    p.style.marginBottom = 0;
    p.textContent = "No misses — strong work.";
    els.reviewList.appendChild(p);
  }
}

function goHome() {
  examMode = false;
  setFinishButtonLabel();
  navigateTo(PAGE_HOME);
}

function goHomeFromQuiz() {
  pauseQuizTimerInterval();
  persistSession();
  navigateTo(PAGE_HOME);
}

async function init() {
  try {
    const bank = await loadQuestionBank();
    bankData = bank;
    bankQuestionCount = bank.questionCount ?? bank.questions?.length ?? 0;
    ensureBankContext(bank);

    els.bankTitle.textContent = bank.title || "Practice Quiz";
    els.bankCount.textContent = `${bank.questionCount} questions`;
    renderProgressPanel();
    updateResumePanel();

    const sections = new Set();
    bank.questions.forEach((q) => {
      const s = (q.section || "").replace(/^Section\s*\d*:\s*/i, "").trim();
      if (s) sections.add(s.split(",")[0].trim());
    });
    const sorted = [...sections].sort();
    sorted.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.sectionFilter.appendChild(opt);
    });

    if (currentPage === PAGE_HOME) {
      els.viewStart.classList.remove("hidden");
      els.viewQuiz.classList.add("hidden");
      els.viewResults.classList.add("hidden");
    } else if (currentPage === PAGE_QUIZ) {
      const s = loadActiveSession();
      if (!s || s.bankFingerprint !== bankFingerprint(bankData)) {
        navigateTo(PAGE_HOME);
        return;
      }
      const rebuilt = rebuildQueueFromOrders(bankData, s.questionOrders);
      if (!rebuilt.length) {
        resetQuizTimer();
        clearActiveSession();
        navigateTo(PAGE_HOME);
        return;
      }
      queue = rebuilt;
      index = Math.min(s.index, queue.length - 1);
      answers = { ...s.answers };
      sectionFilterValue = s.sectionFilter || "";
      examMode = !!s.examMode;
      setFinishButtonLabel();
      els.sectionFilter.value = sectionFilterValue;
      els.viewStart.classList.add("hidden");
      els.viewQuiz.classList.remove("hidden");
      els.viewResults.classList.add("hidden");
      buildJumpNav();
      renderQuestion();
      startQuizTimer(s.timerStartedAt ?? Date.now());
      persistSession();
    } else if (currentPage === PAGE_REVIEW) {
      els.viewStart.classList.add("hidden");
      els.viewQuiz.classList.add("hidden");
      els.viewResults.classList.remove("hidden");
      renderSavedResults();
      els.progressFill.style.width = "100%";
      els.progressMeta.textContent = "Complete";
      resetQuizTimer();
    }

    els.btnStart.addEventListener("click", () => {
      const section = els.sectionFilter.value;
      sectionFilterValue = section;
      examMode = false;
      setFinishButtonLabel();
      const filtered = filterQuestions(bank.questions.map(normalizeQuestion), {
        section: section || undefined,
      });
      queue = filtered.length ? filtered : bank.questions.map(normalizeQuestion);
      index = 0;
      answers = {};
      startQuizTimer();
      persistSession();
      navigateTo(PAGE_QUIZ);
    });

    els.btnStartExam.addEventListener("click", () => {
      const section = els.sectionFilter.value;
      sectionFilterValue = section;
      const filtered = filterQuestions(bank.questions.map(normalizeQuestion), {
        section: section || undefined,
      });
      const pool = filtered.length ? filtered : bank.questions.map(normalizeQuestion);
      examMode = true;
      queue = pickRandomQuestions(pool, EXAM_QUESTION_TARGET);
      index = 0;
      answers = {};
      setFinishButtonLabel();
      startQuizTimer();
      persistSession();
      navigateTo(PAGE_QUIZ);
    });

    els.btnResume.addEventListener("click", () => {
      const s = loadActiveSession();
      if (!s || !bankData || s.bankFingerprint !== bankFingerprint(bankData)) {
        updateResumePanel();
        return;
      }
      navigateTo(PAGE_QUIZ);
    });

    els.btnDiscardSession.addEventListener("click", () => {
      resetQuizTimer();
      clearActiveSession();
      updateResumePanel();
    });

    els.btnQuizHome.addEventListener("click", () => {
      goHomeFromQuiz();
    });

    els.btnPrev.addEventListener("click", goPrev);
    els.btnNext.addEventListener("click", goNext);
    els.btnFinish.addEventListener("click", () => {
      if (!queue.length) return;
      if (examMode) {
        const n = queue.length;
        const answered = Object.keys(answers).length;
        if (answered < n) {
          const ok = window.confirm(
            `Submit exam? ${n - answered} question${n - answered === 1 ? "" : "s"} still unanswered.`
          );
          if (!ok) return;
        }
      }
      showResults();
    });
    els.viewResults.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-results-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-results-action");
      if (action === "home") goHome();
      if (action === "restart") restart();
    });

    els.btnClearStorage.addEventListener("click", () => {
      if (
        !window.confirm(
          "Clear all saved quiz progress, in-progress session, and attempt history in this browser?"
        )
      ) {
        return;
      }
      clearAll();
      resetQuizTimer();
      ensureBankContext(bank);
      renderProgressPanel();
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (els.viewQuiz.classList.contains("hidden")) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.target instanceof HTMLSelectElement) return;

        const goNextKey = e.key === "ArrowRight" || e.code === "ArrowRight";
        const goPrevKey = e.key === "ArrowLeft" || e.code === "ArrowLeft";
        if (goNextKey) {
          e.preventDefault();
          e.stopPropagation();
          goNext();
          return;
        }
        if (goPrevKey) {
          e.preventDefault();
          e.stopPropagation();
          goPrev();
          return;
        }

        const q = queue[index];
        if (!q) return;
        if (!examMode && answers[q.order]) return;
        const perm = getShuffledChoiceIndices(q.choices.length, q.order);
        const map = { "1": 0, "2": 1, "3": 2, "4": 3 };
        if (e.key in map) {
          const displayIdx = map[e.key];
          if (displayIdx < perm.length) selectOption(perm[displayIdx]);
        }
      },
      true
    );
  } catch (err) {
    console.error(err);
    els.loadError.classList.remove("hidden");
    els.loadError.textContent =
      err instanceof Error ? err.message : "Failed to load question bank.";
  }
}

init();
