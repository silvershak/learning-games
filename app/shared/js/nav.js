/**
 * nav.js — subpath-safe navigation helpers.
 *
 * The site can be hosted at any subpath (e.g. GitHub Pages'
 * `/learning-games/`), so this module never hardcodes a root-absolute path.
 * Instead it resolves the portal root relative to *this module's own file
 * location* (`shared/js/nav.js`) using `import.meta.url`, which the browser
 * always resolves correctly regardless of which page imported the module or
 * what subpath the site is served from.
 */

import { t } from "./i18n.js";

/**
 * Absolute URL of the portal root (the folder containing this repo's
 * `index.html`), derived from this module's own location two levels up
 * (`shared/js/` -> repo root).
 * @returns {URL}
 */
function getPortalRootUrl() {
  return new URL("../../", import.meta.url);
}

/**
 * Navigates to the portal home page.
 * @returns {void}
 */
export function goHome() {
  window.location.href = new URL("index.html", getPortalRootUrl()).href;
}

/**
 * Whether the page was reached from another page within this site (same
 * origin), as opposed to an external site (a search engine, a shared link,
 * a bookmark) or typed directly into the address bar.
 * @returns {boolean}
 */
function hasInternalReferrer() {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Navigates back to the previous page if it was part of this site, otherwise
 * falls back to the portal home. `history.length` alone isn't a safe signal:
 * it also counts external pages (e.g. a search result the game was opened
 * from), which would send `history.back()` off-site instead of to the
 * portal.
 * @returns {void}
 */
export function goBack() {
  if (hasInternalReferrer() && window.history.length > 1) {
    window.history.back();
  } else {
    goHome();
  }
}

/**
 * Renders a shared header (back button + title) into a container element.
 * @param {HTMLElement} target - Element to render the header into (replaces its content).
 * @param {Object} [options]
 * @param {string} [options.title] - Header title text; defaults to the app title.
 * @param {boolean} [options.showBack] - Whether to show the back button. Default true.
 * @returns {void}
 */
export function renderHeader(target, options = {}) {
  const { title = t("app.title"), showBack = true } = options;

  target.replaceChildren();
  target.classList.add("page__header");

  if (showBack) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "back-button";
    backButton.textContent = `← ${t("nav.back")}`;
    backButton.addEventListener("click", goBack);
    target.append(backButton);
  }

  const heading = document.createElement("h1");
  heading.className = "page__title";
  heading.textContent = title;
  target.append(heading);
}
