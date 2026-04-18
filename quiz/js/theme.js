/**
 * Theme switch: Light / Dark, persisted as cps630-theme.
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

/** @param {boolean} dark */
export function setThemeDark(dark) {
  localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  applyTheme();
  updateThemeControls();
}

function updateThemeControls() {
  const isDark = resolvedIsDark();

  document.querySelectorAll(".js-theme-switch").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.checked = isDark;
    input.setAttribute("aria-label", `Theme switch. ${isDark ? "Dark" : "Light"} mode active.`);
  });

  // Backward compatibility if any legacy theme buttons remain.
  document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
    btn.textContent = isDark ? "Theme: Dark" : "Theme: Light";
    btn.setAttribute("aria-label", `Color theme ${isDark ? "dark" : "light"}.`);
  });
}


export function initTheme() {
  applyTheme();
  updateThemeControls();
  document.querySelectorAll(".js-theme-switch").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("change", () => setThemeDark(input.checked));
  });

  // Backward compatibility if any legacy theme buttons remain.
  document.querySelectorAll(".js-theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => setThemeDark(!resolvedIsDark()));
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePreference() !== null) return;
    applyTheme();
    updateThemeControls();
  });
}
