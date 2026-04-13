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
} from "./quiz-storage.js";
import { initTheme } from "./theme.js";

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
};

initTheme();

/** @type {ReturnType<normalizeQuestion>[]} */
let queue = [];
let index = 0;
/** @type {Record<number, { choiceIndex: number, correct: boolean }>} */
let answers = {};

/** @type {string} Section filter label for the current run (for attempt history) */
let currentSectionFilter = "";

/** @type {number} */
let bankQuestionCount = 0;

function setProgress() {
  const total = queue.length;
  const pct = total ? ((index + 1) / total) * 100 : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressMeta.textContent = total ? `Question ${index + 1} of ${total}` : "";
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

  q.choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.index = String(i);
    const key = document.createElement("span");
    key.className = "option-key";
    key.textContent = `${choice.id}.`;
    btn.appendChild(key);
    btn.appendChild(document.createTextNode(choice.text));

    if (answered) {
      btn.disabled = true;
      if (choice.correct) btn.classList.add("correct-reveal");
      if (answered.choiceIndex === i && !choice.correct) btn.classList.add("incorrect-reveal");
      if (answered.choiceIndex === i && choice.correct) btn.classList.add("selected");
    } else {
      btn.addEventListener("click", () => selectOption(i));
    }
    els.options.appendChild(btn);
  });

  if (answered) {
    showFeedback(answered.correct);
  }

  const stat = getQuestionStat(q.order);
  if (stat && stat.seen > 0) {
    const acc = Math.round((stat.correctCount / stat.seen) * 100);
    els.questionHistory.textContent = `Answered ${stat.seen} time${stat.seen === 1 ? "" : "s"} · ${acc}% correct`;
    els.questionHistory.classList.remove("hidden");
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

  const buttons = els.options.querySelectorAll(".option-btn");
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    const c = q.choices[i];
    if (c.correct) btn.classList.add("correct-reveal");
    if (i === choiceIndex) {
      btn.classList.add("selected");
      if (!c.correct) btn.classList.add("incorrect-reveal");
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
}

function goPrev() {
  if (!queue.length) return;
  index = (index - 1 + queue.length) % queue.length;
  renderQuestion();
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
    btn.classList.toggle("jump-btn--correct", !!a?.correct);
    btn.classList.toggle("jump-btn--wrong", !!a && !a.correct);
  });
  const currentBtn = buttons[index];
  if (currentBtn) {
    currentBtn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function showResults() {
  els.viewQuiz.classList.add("hidden");
  els.viewResults.classList.remove("hidden");

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
  els.scoreValue.textContent = `${pct}%`;
  let summary = `${correctN} of ${total} correct`;
  if (skipped > 0) summary += ` · ${skipped} not answered`;
  summary += ".";
  els.scoreSummary.textContent = summary;

  els.reviewList.innerHTML = "";
  queue.forEach((q) => {
    const a = answers[q.order];
    if (a?.correct) return;
    const item = document.createElement("div");
    item.className = "review-item card";
    const stem = document.createElement("p");
    stem.className = "title-lg";
    stem.style.marginBottom = "0.75rem";
    stem.textContent = q.question;
    const detail = document.createElement("p");
    detail.style.fontSize = "0.9375rem";
    detail.style.color = "color-mix(in srgb, var(--on_surface) 70%, transparent)";
    const right = q.choices.find((c) => c.correct);
    const yours = a ? q.choices[a.choiceIndex] : null;
    detail.innerHTML = yours
      ? `Your answer: <strong>${yours.id}</strong>. Correct: <strong>${right?.id}</strong>.`
      : `Correct: <strong>${right?.id}</strong>.`;
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

  els.progressFill.style.width = "100%";
  els.progressMeta.textContent = "Complete";

  recordAttempt({
    sectionFilter: currentSectionFilter,
    total,
    correct: correctN,
    pct,
  });
}

function restart() {
  index = 0;
  answers = {};
  els.viewResults.classList.add("hidden");
  els.viewQuiz.classList.remove("hidden");
  buildJumpNav();
  renderQuestion();
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

function goHome() {
  els.viewResults.classList.add("hidden");
  els.viewStart.classList.remove("hidden");
  renderProgressPanel();
}

async function init() {
  try {
    const bank = await loadQuestionBank();
    bankQuestionCount = bank.questionCount ?? bank.questions?.length ?? 0;
    ensureBankContext(bank);

    els.bankTitle.textContent = bank.title || "Practice Quiz";
    els.bankCount.textContent = `${bank.questionCount} questions`;
    renderProgressPanel();

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

    els.btnStart.addEventListener("click", () => {
      const section = els.sectionFilter.value;
      currentSectionFilter = section;
      const filtered = filterQuestions(bank.questions.map(normalizeQuestion), {
        section: section || undefined,
      });
      queue = filtered.length ? filtered : bank.questions.map(normalizeQuestion);
      index = 0;
      answers = {};
      els.viewStart.classList.add("hidden");
      els.viewQuiz.classList.remove("hidden");
      buildJumpNav();
      renderQuestion();
    });

    els.btnPrev.addEventListener("click", goPrev);
    els.btnNext.addEventListener("click", goNext);
    els.btnFinish.addEventListener("click", () => {
      if (!queue.length) return;
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
          "Clear all saved quiz progress and attempt history in this browser?"
        )
      ) {
        return;
      }
      clearAll();
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
        if (!q || answers[q.order]) return;
        const map = { "1": 0, "2": 1, "3": 2, "4": 3 };
        if (e.key in map) selectOption(map[e.key]);
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
