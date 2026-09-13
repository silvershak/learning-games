/**
 * portal.js — renders the game grid and genre/age filters on the home page.
 *
 * Kept out of index.html per project convention (no large inline logic).
 */

import { t } from "./i18n.js";

/** Coarse age bands used by the age filter (kept small for a button/select UI). */
const AGE_RANGES = [
  { id: "all", label: t("filters.age.all"), min: 0, max: 200 },
  { id: "3-5", label: "3–5", min: 3, max: 5 },
  { id: "6-8", label: "6–8", min: 6, max: 8 },
  { id: "9-12", label: "9–12", min: 9, max: 12 },
];

/**
 * @param {import("../../games/manifest.js").GameEntry} game
 * @param {{ genre: string, ageId: string }} state
 * @returns {boolean}
 */
function matchesFilters(game, state) {
  const genreOk = state.genre === "all" || game.genre === state.genre;
  if (!genreOk) {
    return false;
  }
  const range = AGE_RANGES.find((r) => r.id === state.ageId) ?? AGE_RANGES[0];
  // A game shows for a band whenever its [minAge, maxAge] overlaps the band
  // at all (not only when it fully covers it); "all" shows everything. So a
  // 5–9 game appears under both 6–8 and 9–12 (per AGENTS.md's documented
  // overlap-based matching).
  const ageOk = range.id === "all" || (game.minAge <= range.max && game.maxAge >= range.min);
  return ageOk;
}

/**
 * Builds one game card (locked games render as a non-navigable group).
 * @param {import("../../games/manifest.js").GameEntry} game
 * @returns {HTMLElement}
 */
function renderCard(game) {
  const metaText = `${game.genre} · ${game.minAge}-${game.maxAge}`;

  if (game.locked) {
    const wrapper = document.createElement("div");
    wrapper.className = "card card--locked";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", `${game.title} (${t("game.locked")})`);
    wrapper.innerHTML = `
      <span class="card__icon" aria-hidden="true">${game.icon}</span>
      <p class="card__title">${game.title}</p>
      <p class="card__meta">${metaText}</p>
      <span class="card__lock-badge">🔒 ${t("game.locked")}</span>
    `;
    return wrapper;
  }

  const link = document.createElement("a");
  link.className = "portal-grid__link";
  link.href = game.path;
  link.innerHTML = `
    <span class="card card__icon-wrap">
      <span class="card__icon" aria-hidden="true">${game.icon}</span>
      <p class="card__title">${game.title}</p>
      <p class="card__meta">${metaText}</p>
    </span>
  `;
  return link;
}

/**
 * Renders the empty state shown when there are no games to display.
 * @returns {HTMLElement}
 */
function renderEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <span class="empty-state__icon" aria-hidden="true">🧩</span>
    <p>${t("portal.empty")}</p>
  `;
  return empty;
}

/**
 * Renders the grid of game cards, applying the current filter state.
 * @param {HTMLElement} gridEl - Container to render cards into.
 * @param {import("../../games/manifest.js").GameEntry[]} games
 * @param {{ genre: string, ageId: string }} state
 * @returns {void}
 */
function renderGrid(gridEl, games, state) {
  gridEl.replaceChildren();

  if (games.length === 0) {
    gridEl.append(renderEmptyState());
    return;
  }

  const visible = games.filter((game) => matchesFilters(game, state));
  if (visible.length === 0) {
    gridEl.append(renderEmptyState());
    return;
  }

  for (const game of visible) {
    gridEl.append(renderCard(game));
  }
}

/**
 * Renders the genre + age filter controls and wires them to re-render the grid.
 * @param {HTMLElement} filtersEl - Container to render filters into.
 * @param {HTMLElement} gridEl - Grid container, re-rendered on filter change.
 * @param {import("../../games/manifest.js").GameEntry[]} games
 * @param {string[]} genres
 * @param {{ genre: string, ageId: string }} state
 * @returns {void}
 */
function renderFilters(filtersEl, gridEl, games, genres, state) {
  filtersEl.replaceChildren();

  const genreGroup = document.createElement("div");
  genreGroup.className = "filters__group";
  genreGroup.setAttribute("role", "group");
  genreGroup.setAttribute("aria-label", t("filters.genre"));

  const genreTitle = document.createElement("p");
  genreTitle.className = "filters__title";
  genreTitle.textContent = t("filters.genre");
  genreGroup.append(genreTitle);

  const genreOptions = [
    { id: "all", label: t("filters.genre.all") },
    ...genres.map((g) => ({ id: g, label: g })),
  ];
  for (const option of genreOptions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = option.label;
    chip.setAttribute("aria-pressed", String(state.genre === option.id));
    chip.addEventListener("click", () => {
      state.genre = option.id;
      renderFilters(filtersEl, gridEl, games, genres, state);
      renderGrid(gridEl, games, state);
    });
    genreGroup.append(chip);
  }

  const ageGroup = document.createElement("div");
  ageGroup.className = "filters__group";
  ageGroup.setAttribute("role", "group");
  ageGroup.setAttribute("aria-label", t("filters.age"));

  const ageTitle = document.createElement("p");
  ageTitle.className = "filters__title";
  ageTitle.textContent = t("filters.age");
  ageGroup.append(ageTitle);

  for (const range of AGE_RANGES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = range.label;
    chip.setAttribute("aria-pressed", String(state.ageId === range.id));
    chip.addEventListener("click", () => {
      state.ageId = range.id;
      renderFilters(filtersEl, gridEl, games, genres, state);
      renderGrid(gridEl, games, state);
    });
    ageGroup.append(chip);
  }

  filtersEl.append(genreGroup, ageGroup);
}

/**
 * Initializes the portal: filters + game grid.
 * @param {Object} refs
 * @param {HTMLElement} refs.filtersEl - Container for filter chips.
 * @param {HTMLElement} refs.gridEl - Container for the game card grid.
 * @param {import("../../games/manifest.js").GameEntry[]} games
 * @param {string[]} genres
 * @returns {void}
 */
export function initPortal({ filtersEl, gridEl }, games, genres) {
  const state = { genre: "all", ageId: "all" };
  if (games.length > 0) {
    renderFilters(filtersEl, gridEl, games, genres, state);
  }
  renderGrid(gridEl, games, state);
}
