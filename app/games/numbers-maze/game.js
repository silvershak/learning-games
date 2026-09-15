/**
 * game.js — view switching, pointer-drag controller, storage, and win flow
 * for the numbers-maze counting game.
 *
 * Flow: start screen (pick a count: 10/25/50) -> play (drag/tap along the
 * hidden 1..N route on a generated board) -> win (victory trace, confetti,
 * play-again / change-count). Board and mid-round progress live only in
 * memory (a reload always starts a fresh board); only the last-played count
 * and per-count completion tallies are persisted, via storage.js under the
 * game's own scope.
 */

import { applyDir, t } from "../../shared/js/i18n.js";
import { renderHeader, setBackHandler } from "../../shared/js/nav.js";
import * as storage from "../../shared/js/storage.js";
import { preload, play as playSound } from "../../shared/js/audio.js";
import { launchConfetti } from "../../shared/js/confetti.js";
import { buildBoard } from "./maze.js";

/** Storage scope for this game (see storage.js's `scoped()`). */
const STORAGE_SCOPE = "numbers-maze";
const store = storage.scoped(STORAGE_SCOPE);

/** The only counts this version supports — see tinyspec req. 2 (amended). */
const COUNT_OPTIONS = [10, 15, 20];

/** How long a wrong cell stays flashed red, in milliseconds (spec caps this at 400ms). */
const RED_FLASH_MS = 400;

/** Total duration of the post-win victory trace, in milliseconds (spread across all N cells). */
const VICTORY_TRACE_TOTAL_MS = 1200;
const VICTORY_TRACE_MIN_STEP_MS = 15;

preload("correct", "../../assets/sounds/correct.mp3");
preload("bump", "../../assets/sounds/wrong.mp3");
preload("celebrate", "../../assets/sounds/celebrate.mp3");

/**
 * In-memory round state — the board and progress are never persisted. Per
 * the tinyspec, the whole interaction model rides on the single integer
 * `progress`; a cell's own "is-green" class (checked directly on its
 * button) is what tells visit() whether that specific cell was already
 * accepted, so no parallel set of visited indices is kept here.
 */
const state = {
  count: COUNT_OPTIONS[0],
  board: null,
  progress: 0,
};

/** DOM refs for the current play view, set by renderPlay(). */
let playRefs = null;

/** Cell button elements for the current board, indexed by cell index. */
let cellButtons = [];

/** The pointerId currently driving the drag gesture, or null. */
let activePointerId = null;

/** Latest pointermove event awaiting its throttled requestAnimationFrame resolve. */
let pendingPointerEvent = null;
let rafScheduled = false;

const appEl = document.getElementById("app");

/**
 * Reads the last-played count, validated against COUNT_OPTIONS.
 * @returns {number|null}
 */
function loadLastCount() {
  const value = store.get("last-count", null);
  return COUNT_OPTIONS.includes(value) ? value : null;
}

/**
 * Persists the last-played count.
 * @param {number} count
 * @returns {void}
 */
function saveLastCount(count) {
  store.set("last-count", count);
}

/**
 * Reads per-count completion tallies, coercing anything untrusted/corrupt
 * (non-numeric or negative) to 0 rather than throwing.
 * @returns {Object<string, number>}
 */
function loadCompletions() {
  const raw = store.get("completions", {});
  const completions = {};
  for (const count of COUNT_OPTIONS) {
    const value = raw && typeof raw === "object" ? raw[String(count)] : undefined;
    completions[String(count)] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return completions;
}

/**
 * Increments and persists the completion tally for a count.
 * @param {number} count
 * @returns {void}
 */
function incrementCompletion(count) {
  const completions = loadCompletions();
  completions[String(count)] += 1;
  store.set("completions", completions);
}

/**
 * Replaces the page's view container with a single root element.
 * @param {HTMLElement} viewEl
 * @returns {void}
 */
function setView(viewEl) {
  appEl.replaceChildren(viewEl);
}

/**
 * Renders one count-picker card: the numeral itself is the main affordance,
 * with a ⭐ badge (accessible label) when the count has been completed before
 * and a highlight when it's the last-played count.
 * @param {number} count
 * @param {Object<string, number>} completions
 * @param {number|null} lastCount
 * @returns {HTMLElement}
 */
function buildCountCard(count, completions, lastCount) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "maze-count-card";
  if (count === lastCount) {
    button.classList.add("is-last");
  }

  const numeral = document.createElement("span");
  numeral.className = "maze-count-card__numeral";
  numeral.textContent = String(count);
  numeral.setAttribute("aria-hidden", "true");
  button.append(numeral);

  const isCompleted = completions[String(count)] > 0;
  let ariaLabel = t("numbersMaze.start.count", { count });
  if (isCompleted) {
    const badge = document.createElement("span");
    badge.className = "maze-count-card__badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "⭐";
    button.append(badge);
    ariaLabel = `${ariaLabel}, ${t("numbersMaze.start.completed")}`;
  }
  button.setAttribute("aria-label", ariaLabel);

  button.addEventListener("click", () => startRound(count));
  return button;
}

/**
 * Renders the start screen: a prompt plus one big tappable card per count.
 * @returns {void}
 */
function renderStart() {
  setBackHandler(null);

  const container = document.createElement("div");
  container.className = "maze-start";

  const heading = document.createElement("h2");
  heading.className = "maze-heading";
  heading.textContent = t("numbersMaze.title");
  container.append(heading);

  const prompt = document.createElement("p");
  prompt.className = "maze-start__prompt";
  prompt.textContent = t("numbersMaze.start.prompt");
  container.append(prompt);

  const cardsRow = document.createElement("div");
  cardsRow.className = "maze-start__cards";
  cardsRow.setAttribute("role", "group");
  cardsRow.setAttribute("aria-label", t("numbersMaze.start.prompt"));

  const completions = loadCompletions();
  const lastCount = loadLastCount();
  for (const count of COUNT_OPTIONS) {
    cardsRow.append(buildCountCard(count, completions, lastCount));
  }
  container.append(cardsRow);

  setView(container);
}

/**
 * Starts a new round for a count: builds a fresh board, resets progress, and
 * switches to the play view.
 * @param {number} count
 * @returns {void}
 */
function startRound(count) {
  state.count = count;
  state.board = buildBoard(count);
  state.progress = 0;
  saveLastCount(count);
  renderPlay();
}

/**
 * Renders the play view: instruction, next-number hint chip, progress line,
 * the board grid, and a live region for reached-number announcements. Wires
 * up the single pointer-events drag controller on the board itself.
 * @returns {void}
 */
function renderPlay() {
  setBackHandler(renderStart);

  const container = document.createElement("div");
  container.className = "maze-play";

  const instruction = document.createElement("p");
  instruction.className = "maze-instruction";
  instruction.textContent = t("numbersMaze.play.instruction", { total: state.count });
  container.append(instruction);

  const hud = document.createElement("div");
  hud.className = "maze-hud";

  const hint = document.createElement("p");
  hint.className = "maze-hud__hint";

  const progressLine = document.createElement("p");
  progressLine.className = "maze-hud__progress";

  hud.append(hint, progressLine);
  container.append(hud);

  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("aria-live", "polite");
  container.append(status);

  const board = document.createElement("div");
  board.className = "maze__board";
  board.setAttribute("role", "grid");
  board.setAttribute("aria-label", t("numbersMaze.title"));
  board.dataset.count = String(state.count);
  board.style.setProperty("--maze-cols", String(state.board.cols));
  board.style.setProperty("--maze-rows", String(state.board.rows));
  container.append(board);

  playRefs = { hint, progressLine, status, board };
  cellButtons = new Array(state.board.cells.length).fill(null);

  state.board.cells.forEach((cell, index) => {
    const cellButton = document.createElement("button");
    cellButton.type = "button";
    cellButton.className = "maze__cell";
    cellButton.dataset.index = String(index);
    cellButton.setAttribute("role", "gridcell");
    cellButton.setAttribute("aria-rowindex", String(cell.row + 1));
    cellButton.setAttribute("aria-colindex", String(cell.col + 1));
    cellButton.setAttribute("aria-label", t("numbersMaze.cell.label", { value: cell.value }));
    cellButton.textContent = String(cell.value);
    cellButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        visit(index);
      }
    });
    board.append(cellButton);
    cellButtons[index] = cellButton;
  });

  board.style.touchAction = "none";
  board.addEventListener("pointerdown", onPointerDown);
  board.addEventListener("pointermove", onPointerMove);
  board.addEventListener("pointerup", onPointerEnd);
  board.addEventListener("pointercancel", onPointerEnd);

  updateHint();
  updateProgressLine();
  setView(container);
}

/**
 * Refreshes the next-number hint chip for the current progress.
 * @returns {void}
 */
function updateHint() {
  if (!playRefs) {
    return;
  }
  const next = Math.min(state.progress + 1, state.count);
  playRefs.hint.textContent = t("numbersMaze.play.next", { next });
}

/**
 * Refreshes the "reached X of N" progress line.
 * @returns {void}
 */
function updateProgressLine() {
  if (!playRefs) {
    return;
  }
  playRefs.progressLine.textContent = t("numbersMaze.play.progress", {
    current: state.progress,
    total: state.count,
  });
}

/**
 * Announces text through the aria-live status region.
 * @param {string} text
 * @returns {void}
 */
function announce(text) {
  if (playRefs) {
    playRefs.status.textContent = text;
  }
}

/**
 * The whole interaction model, run identically from pointerdown, throttled
 * pointermove, and keyboard activation:
 * - cell holds progress + 1 -> accept (paint green, advance, maybe win).
 * - cell is already green -> silent no-op (dragging back over your trail
 *   must never punish).
 * - anything else -> flash red, no state change.
 * @param {number} index - Cell index in state.board.cells.
 * @returns {void}
 */
function visit(index) {
  const cell = state.board?.cells[index];
  if (!cell) {
    return;
  }

  if (cell.value === state.progress + 1) {
    acceptCell(index, cell);
  } else if (!cellButtons[index].classList.contains("is-green")) {
    flashRed(index);
  }
}

/**
 * Accepts a correctly-reached cell: paints it green permanently, advances
 * progress, announces it, and checks for a win.
 * @param {number} index
 * @param {import("./maze.js").MazeCell} cell
 * @returns {void}
 */
function acceptCell(index, cell) {
  const buttonEl = cellButtons[index];
  buttonEl.classList.add("is-green");
  buttonEl.setAttribute("aria-pressed", "true");
  state.progress += 1;

  playSound("correct");
  announce(t("numbersMaze.a11y.reached", { value: cell.value }));
  updateHint();
  updateProgressLine();

  if (state.progress === state.count) {
    handleWin();
  }
}

/**
 * Flashes a wrong cell red for RED_FLASH_MS with no state change whatsoever.
 * @param {number} index
 * @returns {void}
 */
function flashRed(index) {
  const buttonEl = cellButtons[index];
  buttonEl.classList.remove("is-red");
  // Force a reflow so retriggering the class restarts the animation even if
  // the same cell is flashed again in quick succession.
  void buttonEl.offsetWidth;
  buttonEl.classList.add("is-red");
  playSound("bump");
  window.setTimeout(() => buttonEl.classList.remove("is-red"), RED_FLASH_MS);
}

/**
 * Resolves the cell under a viewport point via elementFromPoint (pointer
 * capture redirects all events to the board, so per-cell pointerenter can't
 * be used) and runs visit() on it, if any.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {void}
 */
function resolveAndVisit(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cellEl = el?.closest(".maze__cell");
  if (cellEl && playRefs?.board.contains(cellEl)) {
    visit(Number(cellEl.dataset.index));
  }
}

/**
 * pointerdown: captures the pointer on the board (so moves keep arriving even
 * once the finger strays off a cell or the board edge) and runs visit() at
 * the initial contact point.
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerDown(event) {
  playRefs.board.setPointerCapture(event.pointerId);
  activePointerId = event.pointerId;
  resolveAndVisit(event.clientX, event.clientY);
}

/**
 * pointermove: throttled to once per animation frame, resolves the latest
 * position and runs visit() on whatever cell is under it.
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerMove(event) {
  if (event.pointerId !== activePointerId) {
    return;
  }
  pendingPointerEvent = event;
  if (rafScheduled) {
    return;
  }
  rafScheduled = true;
  window.requestAnimationFrame(() => {
    rafScheduled = false;
    if (pendingPointerEvent) {
      resolveAndVisit(pendingPointerEvent.clientX, pendingPointerEvent.clientY);
      pendingPointerEvent = null;
    }
  });
}

/**
 * pointerup / pointercancel: ends the gesture. Progress is never reset here —
 * the next pointerdown simply runs visit() again, so play resumes exactly
 * where it left off (or a fresh tap can advance/no-op/flash as usual).
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerEnd(event) {
  if (event.pointerId === activePointerId) {
    activePointerId = null;
  }
}

/**
 * Plays a quick sequential 1->N pulse over the completed route (the
 * "victory trace"), then calls back.
 * @param {() => void} onDone
 * @returns {void}
 */
function playVictoryTrace(onDone) {
  const pathIndex = state.board.pathIndex;
  const stepMs = Math.max(VICTORY_TRACE_MIN_STEP_MS, VICTORY_TRACE_TOTAL_MS / pathIndex.length);
  let i = 0;
  const intervalId = window.setInterval(() => {
    const buttonEl = cellButtons[pathIndex[i]];
    buttonEl?.classList.add("is-tracing");
    i += 1;
    if (i >= pathIndex.length) {
      window.clearInterval(intervalId);
      window.setTimeout(onDone, stepMs);
    }
  }, stepMs);
}

/**
 * Handles reaching N: records the completion, plays the victory trace, then
 * shows the win view.
 * @returns {void}
 */
function handleWin() {
  incrementCompletion(state.count);
  playVictoryTrace(() => {
    playSound("celebrate");
    renderWin();
  });
}

/**
 * Renders the win view: celebration heading/body, confetti, and two large
 * next actions.
 * @returns {void}
 */
function renderWin() {
  setBackHandler(renderStart);

  const container = document.createElement("div");
  container.className = "maze-win";

  const heading = document.createElement("h2");
  heading.className = "maze-heading";
  heading.textContent = t("numbersMaze.win.title");
  container.append(heading);

  const body = document.createElement("p");
  body.className = "maze-win__body";
  body.textContent = t("numbersMaze.win.body");
  container.append(body);

  const actions = document.createElement("div");
  actions.className = "maze-win__actions";

  const againButton = document.createElement("button");
  againButton.type = "button";
  againButton.className = "btn btn--success";
  againButton.textContent = t("numbersMaze.win.playAgain");
  againButton.addEventListener("click", () => startRound(state.count));
  actions.append(againButton);

  const changeButton = document.createElement("button");
  changeButton.type = "button";
  changeButton.className = "btn btn--outline";
  changeButton.textContent = t("numbersMaze.win.changeCount");
  changeButton.addEventListener("click", renderStart);
  actions.append(changeButton);

  container.append(actions);
  setView(container);

  launchConfetti(container);
}

/**
 * Boots the game: shared header + RTL setup, then the start screen.
 * @returns {void}
 */
function init() {
  applyDir();
  renderHeader(document.getElementById("page-header"), { title: t("numbersMaze.title") });
  renderStart();
}

init();
