import { loadQuestionBank, normalizeQuestion, filterQuestions } from "./question-bank.js";
import { initTheme } from "./theme.js";

const els = {
  section: document.getElementById("flash-section"),
  card: document.getElementById("flash-card"),
  cardInner: document.getElementById("flash-card-inner"),
  sectionLabel: document.getElementById("flash-section-label"),
  question: document.getElementById("flash-question"),
  answerText: document.getElementById("flash-answer-text"),
  progress: document.getElementById("flash-progress"),
  btnPrev: document.getElementById("btn-prev-card"),
  btnFlip: document.getElementById("btn-flip-card"),
  btnNext: document.getElementById("btn-next-card"),
  btnShuffle: document.getElementById("btn-shuffle-cards"),
  empty: document.getElementById("flash-empty"),
};

initTheme();

/** @type {ReturnType<normalizeQuestion>[]} */
let allQuestions = [];
/** @type {ReturnType<normalizeQuestion>[]} */
let deck = [];
let cardIndex = 0;
let revealed = false;

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function getCorrectChoiceText(question) {
  const choice = question.choices.find((c) => c.correct);
  if (!choice) return "No answer available.";
  return `${choice.id}. ${choice.text}`;
}

function renderCard() {
  const q = deck[cardIndex];
  if (!q) {
    els.empty.textContent = "No cards in this section. Pick another filter.";
    els.empty.classList.remove("hidden");
    els.card.classList.add("hidden");
    els.progress.textContent = "";
    return;
  }

  els.empty.classList.add("hidden");
  els.card.classList.remove("hidden");
  els.sectionLabel.textContent = q.section || "General";
  els.question.textContent = q.question;
  els.answerText.textContent = getCorrectChoiceText(q);
  els.card.classList.toggle("is-flipped", revealed);
  els.progress.textContent = `Card ${cardIndex + 1} of ${deck.length}`;
  els.btnFlip.textContent = revealed ? "Hide answer" : "Flip card";
}

function nextCard() {
  if (!deck.length) return;
  cardIndex = (cardIndex + 1) % deck.length;
  revealed = false;
  renderCard();
}

function prevCard() {
  if (!deck.length) return;
  cardIndex = (cardIndex - 1 + deck.length) % deck.length;
  revealed = false;
  renderCard();
}

function toggleReveal() {
  if (!deck.length) return;
  revealed = !revealed;
  renderCard();
}

function applyFilter() {
  const section = els.section.value;
  const filtered = filterQuestions(allQuestions, { section: section || undefined });
  deck = filtered.length ? filtered : allQuestions.slice();
  cardIndex = 0;
  revealed = false;
  renderCard();
}

async function init() {
  try {
    const bank = await loadQuestionBank();
    allQuestions = bank.questions.map(normalizeQuestion);

    const sections = new Set();
    allQuestions.forEach((q) => {
      const s = (q.section || "").replace(/^Section\s*\d*:\s*/i, "").trim();
      if (s) sections.add(s.split(",")[0].trim());
    });
    [...sections]
      .sort()
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        els.section.appendChild(option);
      });

    deck = allQuestions.slice();
    renderCard();

    els.section.addEventListener("change", applyFilter);
    els.btnNext.addEventListener("click", nextCard);
    els.btnPrev.addEventListener("click", prevCard);
    els.btnFlip.addEventListener("click", toggleReveal);
    els.btnShuffle.addEventListener("click", () => {
      shuffleInPlace(deck);
      cardIndex = 0;
      revealed = false;
      renderCard();
    });
    els.card.addEventListener("click", toggleReveal);
    els.card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleReveal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") nextCard();
      if (e.key === "ArrowLeft") prevCard();
    });
  } catch (err) {
    console.error(err);
    els.empty.textContent = err instanceof Error ? err.message : "Failed to load flash cards.";
    els.empty.classList.remove("hidden");
    els.card.classList.add("hidden");
    els.progress.textContent = "";
  }
}

init();
