/**
 * Theme: Auto (system) / Light / Dark — persisted as cps630-theme.
 * Pair with html.theme-dark in atelier.css (DESIGN-DARK.md tokens).
 */
const STORAGE_KEY = "cps630-theme";

/** @returns {"light" | "dark" | null} */
export function getThemePreference() {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return null;
}

export function resolvedIsDark() {
  const p = getThemePreference();
  if (p === "dark") return true;
  if (p === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme() {
  const dark = resolvedIsDark();
  document.documentElement.classList.toggle("theme-dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Cycles: Auto → Light → Dark → Auto */
export function cycleTheme() {
  const p = getThemePreference();
  if (p === null) {
    localStorage.setItem(STORAGE_KEY, "light");
  } else if (p === "light") {
    localStorage.setItem(STORAGE_KEY, "dark");
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  applyTheme();
  updateThemeButtons();
}

function themeButtonLabel() {
  const p = getThemePreference();
  if (p === null) return "Theme: Auto";
  if (p === "light") return "Theme: Light";
  return "Theme: Dark";
}

function updateThemeButtons() {
  const label = themeButtonLabel();
  const mode = getThemePreference() ?? "auto";
  document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
    btn.textContent = label;
    btn.setAttribute(
      "aria-label",
      `Color theme ${mode}. Current appearance is ${resolvedIsDark() ? "dark" : "light"}. Press to cycle auto, light, dark.`
    );
  });
}

export function initTheme() {
  applyTheme();
  updateThemeButtons();
  document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => cycleTheme());
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePreference() === null) {
      applyTheme();
      updateThemeButtons();
    }
  });
}
