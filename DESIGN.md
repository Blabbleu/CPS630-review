# Design System Specification: The Academic Atelier

## 1. Overview & Creative North Star
**Creative North Star: "The Cognitive Sanctuary"**

To design for education is to design for focus. This design system rejects the cluttered, "gamified" aesthetic of typical quiz apps in favor of a **High-End Editorial** approach. We treat the interface not as a software tool, but as a premium study environment—a digital sanctuary that reduces cognitive load through intentional asymmetry, sophisticated layering, and a "quiet" UI.

We break the standard grid-bound template by using **dynamic whitespace** and **overlapping surfaces**. By treating the screen as a series of physical layers (fine paper and frosted glass), we guide the student’s eye toward what matters most: the content.

---

## 2. Color & Tonal Depth
Our palette moves beyond "blue and white" into a spectrum of atmospheric tones that provide a sense of authority and calm.

### The "No-Line" Rule
**Strict Mandate:** Traditional 1px solid borders for sectioning are prohibited. Boundaries are defined exclusively through background shifts. 
*   **The Depth Stack:** Use `surface-container-low` for the base background, and nest `surface-container-lowest` for the primary content area. This creates a soft, "lifted" effect without the visual noise of a line.

### Surface Hierarchy & Nesting
*   **Primary Background:** `surface` (#f8f9fa)
*   **Secondary Context (Sidebar/Header):** `surface-container-low` (#f3f4f5)
*   **Actionable Containers (Cards):** `surface-container-lowest` (#ffffff)
*   **Interactive Overlays:** Use `surface-bright` (#f8f9fa) with a 24px backdrop-blur to create a "glass" effect for floating headers or navigation bars.

### Signature Textures
Main CTAs and high-level progress indicators should utilize a subtle **linear gradient** (top-left to bottom-right) from `primary` (#004493) to `primary_container` (#005bc0). This adds "soul" and depth, preventing the UI from feeling flat or "default."

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance character with extreme readability.

*   **The Display Face (Manrope):** Used for `display`, `headline`, and `title` scales. Manrope’s geometric structure feels modern and authoritative. Use generous letter-spacing (-0.02em) for larger headlines to create an "Editorial" look.
*   **The Workhorse (Inter):** Used for all `body` and `label` scales. Inter is optimized for the screen and provides maximum legibility during long study sessions.

**Hierarchy as Brand:** 
*   Use `display-lg` (3.5rem) sparingly for section intros to create a sense of scale.
*   Use `label-md` in all-caps with 0.05em tracking for category tags to provide a premium, "curated" feel.

---

## 4. Elevation & Depth
Traditional drop shadows are replaced with **Tonal Layering** and **Ambient Light.**

*   **The Layering Principle:** To elevate a question card, don't reach for a shadow first. Place the `surface-container-lowest` card on a `surface-container-low` background. 
*   **Ambient Shadows:** For floating elements (like a "Finish Exam" button), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(25, 28, 29, 0.06);`. The shadow color is derived from `on_surface` to look natural, never muddy.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` (#c3c6d6) at **15% opacity**. It should be felt, not seen.
*   **Glassmorphism:** Use for persistent progress bars at the top of the viewport. Apply `surface_container_lowest` at 80% opacity with a `blur(12px)` to allow content to bleed through softly as the user scrolls.

---

## 5. Component Language

### Question Cards
*   **Style:** No borders. Use `md` (0.75rem) rounded corners.
*   **Separation:** Forbid the use of divider lines between question options. Instead, use a 4px vertical gap and a subtle background shift (`surface-container-high`) on hover.

### Progress Indicators
*   **Implementation:** Eschew the thin 2px line. Use a substantial 8px track using `secondary_container`. The active state should be the signature `primary` to `primary_container` gradient.

### Buttons
*   **Primary:** High-contrast `primary` background with `on_primary` text. No border. `full` (9999px) roundedness for a friendly, approachable feel.
*   **Secondary:** `surface-container-high` background with `on_secondary_container` text. This blends into the interface until needed.
*   **State Change:** On hover, apply a `surface-tint` overlay at 8% opacity rather than shifting the base color.

### Input Fields
*   **Visuals:** Use the "Ghost Border" approach. On focus, the border opacity increases to 100% using the `primary` token, and the background shifts to `surface-container-lowest`.

### Featured: The "Confidence Chip"
*   A specialized component for exam review allowing students to mark questions as "Confident," "Unsure," or "Review." These use the `tertiary` (warm) and `error` (warning) tokens at 10% container opacity to ensure they highlight without distracting.

---

## 6. Do's and Don'ts

### Do:
*   **DO** use intentional asymmetry. Align a headline to the left but center the quiz content to create a dynamic, modern layout.
*   **DO** prioritize whitespace. If you think there is enough padding, add 16px more.
*   **DO** use `title-lg` for question stems to ensure they carry enough visual weight compared to the answers.

### Don't:
*   **DON'T** use pure black (#000). Use `on_surface` (#191c1d) for all primary text to maintain a high-end, soft-contrast feel.
*   **DON'T** use 1px dividers to separate list items. Use `1.5rem` of vertical whitespace instead.
*   **DON'T** use "Standard" blue. Always reference the `primary` (#004493) token, which has a deep, oceanic tone that conveys trust and professional maturity.