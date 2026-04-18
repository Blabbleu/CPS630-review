# CPS630 Review Quiz

A lightweight browser-based review app for practicing CPS630 questions.

It uses a local JSON question bank, supports section filtering, tracks progress in local storage, and separates the experience into dedicated pages for Home, Quiz, and Review.

## Features

- Practice mode with immediate feedback
- Exam mode with up to 100 random questions and delayed scoring
- Section filtering from the question bank
- Resume in-progress quiz sessions
- Persistent local progress/attempt history
- Review page showing missed questions with full correct answer text
- Light/dark theme support

## Project Structure

- `index.html` - root redirect to the quiz app
- `quiz/home.html` - start page (bank info, filter, resume, stats)
- `quiz/quiz.html` - active quiz session
- `quiz/review.html` - results and missed-question review
- `quiz/flashcards.html` - concept review via flip cards
- `quiz/js/app.js` - main app logic and page routing
- `quiz/js/flashcards.js` - flash card mode logic
- `quiz/js/question-bank.js` - question bank loading/filtering helpers
- `quiz/js/quiz-storage.js` - localStorage persistence
- `quiz/js/theme.js` - theme handling
- `quiz/css/atelier.css` - design system and component styles
- `CPS630_PractiseQuestionBank.json` - quiz content source

## Run Locally

Because the app fetches JSON, serve the project over HTTP (do not open files directly with `file://`).

### Option 1 (PowerShell script)

```powershell
./start-quiz-server.ps1
```

### Option 2 (Python)

```powershell
python -m http.server 8765
```

Then open:

- [http://localhost:8765/](http://localhost:8765/) (redirects to Home), or
- [http://localhost:8765/quiz/home.html](http://localhost:8765/quiz/home.html)

## Live Demo (GitHub Pages)

- [CPS630 Review Quiz](https://blabbleu.github.io/CPS630-review/quiz/home.html)

## Data & Persistence

- Per-question stats, attempts, active session, and last review result are saved in browser `localStorage`.
- Data is browser-local and not synced to any backend.

## Notes

- If question bank fetch fails, make sure you are running a local server from the repo root.
- Use **Clear saved progress** in the app to reset local stats/session data.
