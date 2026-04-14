/**
 * Persists quiz progress in localStorage (per-question stats + completed attempts).
 */

const STORAGE_KEY = "cps630_quiz_progress";
const SESSION_KEY = "cps630_quiz_active_session";
const LAST_RESULTS_KEY = "cps630_quiz_last_results";
const MAX_ATTEMPTS = 40;
const CURRENT_VERSION = 1;
const SESSION_VERSION = 1;

/**
 * @typedef {object} QuestionStat
 * @property {number} seen
 * @property {number} correctCount
 * @property {number} wrongCount
 * @property {boolean | null} lastCorrect
 * @property {string | null} lastAt ISO
 */

/**
 * @typedef {object} AttemptRecord
 * @property {string} id
 * @property {string} at ISO
 * @property {string} sectionFilter
 * @property {number} total
 * @property {number} correct
 * @property {number} pct
 */

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaultState();
  }
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object" || parsed.version !== CURRENT_VERSION) {
    return defaultState();
  }
  return {
    version: CURRENT_VERSION,
    bankFingerprint: typeof parsed.bankFingerprint === "string" ? parsed.bankFingerprint : "",
    questions: typeof parsed.questions === "object" && parsed.questions !== null ? parsed.questions : {},
    attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
  };
}

function defaultState() {
  return {
    version: CURRENT_VERSION,
    bankFingerprint: "",
    questions: {},
    attempts: [],
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("quiz-storage: could not save", e);
  }
}

/** @param {{ questionCount?: number, title?: string }} bank */
export function bankFingerprint(bank) {
  return `${bank.questionCount ?? 0}|${(bank.title || "").slice(0, 80)}`;
}

/** @param {{ questionCount?: number, title?: string }} bank */
export function ensureBankContext(bank) {
  const state = loadState();
  const fp = bankFingerprint(bank);
  if (state.bankFingerprint && state.bankFingerprint !== fp) {
    state.questions = {};
    state.attempts = [];
    clearActiveSession();
  }
  state.bankFingerprint = fp;
  saveState(state);
}

/**
 * @param {number} order
 * @param {boolean} correct
 */
export function recordQuestionAnswer(order, correct) {
  const state = loadState();
  const key = String(order);
  const prev = state.questions[key] || {
    seen: 0,
    correctCount: 0,
    wrongCount: 0,
    lastCorrect: null,
    lastAt: null,
  };
  prev.seen += 1;
  if (correct) prev.correctCount += 1;
  else prev.wrongCount += 1;
  prev.lastCorrect = correct;
  prev.lastAt = new Date().toISOString();
  state.questions[key] = prev;
  saveState(state);
}

/**
 * @param {{ sectionFilter: string, total: number, correct: number, pct: number }} summary
 */
export function recordAttempt(summary) {
  const state = loadState();
  const rec = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    sectionFilter: summary.sectionFilter || "",
    total: summary.total,
    correct: summary.correct,
    pct: summary.pct,
  };
  state.attempts.unshift(rec);
  state.attempts = state.attempts.slice(0, MAX_ATTEMPTS);
  saveState(state);
}

/** @param {number} order */
export function getQuestionStat(order) {
  const state = loadState();
  return state.questions[String(order)] || null;
}

/** @param {number} bankSize */
export function getAggregateStats(bankSize) {
  const state = loadState();
  const keys = Object.keys(state.questions);
  let touched = 0;
  let totalCorrect = 0;
  let totalSeen = 0;
  keys.forEach((k) => {
    const q = state.questions[k];
    if (q && q.seen > 0) {
      touched += 1;
      totalCorrect += q.correctCount;
      totalSeen += q.seen;
    }
  });
  const accuracyPct = totalSeen ? Math.round((totalCorrect / totalSeen) * 100) : null;
  return {
    attemptsCompleted: state.attempts.length,
    questionsTouched: touched,
    bankSize,
    totalAnswerEvents: totalSeen,
    accuracyPct,
  };
}

export function getRecentAttempts(limit = 8) {
  const state = loadState();
  return state.attempts.slice(0, limit);
}

export function clearAll() {
  saveState(defaultState());
  clearActiveSession();
  clearLastResults();
}

/**
 * In-progress session (unfinished run). Separate from per-question stats / attempts.
 * @typedef {object} ActiveSessionV1
 * @property {number} version
 * @property {string} bankFingerprint
 * @property {string} sectionFilter
 * @property {number[]} questionOrders
 * @property {number} index
 * @property {Record<string, { choiceIndex: number, correct: boolean }>} answers
 * @property {boolean} [examMode]
 * @property {number} [timerStartedAt] ms since epoch when this session timer started
 */

/** @returns {ActiveSessionV1 | null} */
export function loadActiveSession() {
  let raw = null;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object" || parsed.version !== SESSION_VERSION) {
    return null;
  }
  if (typeof parsed.bankFingerprint !== "string" || !Array.isArray(parsed.questionOrders)) {
    return null;
  }
  return {
    version: SESSION_VERSION,
    bankFingerprint: parsed.bankFingerprint,
    sectionFilter: typeof parsed.sectionFilter === "string" ? parsed.sectionFilter : "",
    questionOrders: parsed.questionOrders.map((n) => Number(n)).filter((n) => Number.isFinite(n)),
    index: typeof parsed.index === "number" && parsed.index >= 0 ? parsed.index : 0,
    answers:
      typeof parsed.answers === "object" && parsed.answers !== null ? parsed.answers : {},
    examMode: !!parsed.examMode,
    timerStartedAt:
      typeof parsed.timerStartedAt === "number" && Number.isFinite(parsed.timerStartedAt)
        ? parsed.timerStartedAt
        : undefined,
  };
}

/** @param {Omit<ActiveSessionV1, "version"> & { version?: number }} data */
export function saveActiveSession(data) {
  if (!data.questionOrders?.length) {
    clearActiveSession();
    return;
  }
  const payload = {
    version: SESSION_VERSION,
    bankFingerprint: data.bankFingerprint,
    sectionFilter: data.sectionFilter,
    questionOrders: data.questionOrders,
    index: data.index,
    answers: data.answers,
    examMode: !!data.examMode,
    ...(typeof data.timerStartedAt === "number" && Number.isFinite(data.timerStartedAt)
      ? { timerStartedAt: data.timerStartedAt }
      : {}),
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("quiz-storage: could not save active session", e);
  }
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** @param {object} data */
export function saveLastResults(data) {
  try {
    localStorage.setItem(LAST_RESULTS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("quiz-storage: could not save last results", e);
  }
}

/** @returns {any | null} */
export function loadLastResults() {
  let raw = null;
  try {
    raw = localStorage.getItem(LAST_RESULTS_KEY);
  } catch {
    return null;
  }
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

export function clearLastResults() {
  try {
    localStorage.removeItem(LAST_RESULTS_KEY);
  } catch {
    /* ignore */
  }
}
