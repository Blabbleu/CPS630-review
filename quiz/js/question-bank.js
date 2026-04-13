/**
 * Loads CPS630_PractiseQuestionBank.json and exposes helpers to build quiz state.
 * Expects the JSON file one level up from this script's page (served from /quiz/).
 */

const BANK_URL = new URL("../../CPS630_PractiseQuestionBank.json", import.meta.url);

/**
 * @returns {Promise<{ title: string, source: string, questionCount: number, questions: Array }>}
 */
export async function loadQuestionBank() {
  const res = await fetch(BANK_URL);
  if (!res.ok) {
    throw new Error(`Could not load question bank (${res.status}). Serve the Review folder over HTTP.`);
  }
  const data = await res.json();
  if (!data.questions || !Array.isArray(data.questions)) {
    throw new Error("Invalid question bank: missing questions array.");
  }
  return data;
}

/**
 * Public shape for UI: no `correct` flags on choices until check time (we keep full q in closure).
 * @param {object} raw - single question from JSON
 */
export function normalizeQuestion(raw) {
  return {
    order: raw.order,
    number: raw.number,
    section: raw.section || "",
    question: raw.question,
    choices: raw.choices.map((c) => ({
      id: c.id,
      text: c.text,
      correct: c.correct,
    })),
    correctIndex: raw.correctIndex,
    correctLabel: raw.correctLabel,
  };
}

/**
 * @param {object[]} questions
 * @param {{ section?: string }} filter - if section is set, substring match on section field
 */
export function filterQuestions(questions, filter = {}) {
  if (!filter.section) return questions.slice();
  const needle = filter.section.trim().toLowerCase();
  return questions.filter((q) => (q.section || "").toLowerCase().includes(needle));
}
