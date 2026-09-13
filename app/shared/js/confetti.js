/**
 * confetti.js — hand-written confetti burst (no external library): a
 * scattering of absolutely-positioned pieces that fall and fade via a CSS
 * animation. Extracted from fast-calc so any game's win screen can reuse it.
 *
 * The caller's own game.css must define `.confetti` / `.confetti__piece`
 * (position, sizing) and a `@keyframes confetti-fall` animation — this
 * module only creates and times the DOM, it owns no styling of its own.
 */

import { randomInt, sample } from "./util.js";

/** How long the confetti burst stays on screen, in milliseconds. */
const DEFAULT_DURATION_MS = 3200;

/** How many confetti pieces to scatter. */
const DEFAULT_PIECE_COUNT = 60;

/** Default piece color palette. */
const DEFAULT_COLORS = ["#c43d0a", "#2b5fd9", "#23803a", "#f2b705", "#8e44ad"];

/**
 * Launches a confetti burst inside `container`, auto-removing itself after
 * `durationMs`.
 * @param {HTMLElement} container - View element to render the burst into.
 * @param {Object} [options]
 * @param {number} [options.pieceCount] - Number of pieces (default 60).
 * @param {number} [options.durationMs] - Total time before cleanup (default 3200).
 * @param {string[]} [options.colors] - Piece color palette.
 * @returns {void}
 */
export function launchConfetti(container, options = {}) {
  const {
    pieceCount = DEFAULT_PIECE_COUNT,
    durationMs = DEFAULT_DURATION_MS,
    colors = DEFAULT_COLORS,
  } = options;

  const confetti = document.createElement("div");
  confetti.className = "confetti";
  confetti.setAttribute("aria-hidden", "true");

  for (let i = 0; i < pieceCount; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti__piece";
    piece.style.insetInlineStart = `${randomInt(0, 100)}%`;
    piece.style.backgroundColor = sample(colors);
    piece.style.animationDelay = `${randomInt(0, 400)}ms`;
    piece.style.animationDuration = `${randomInt(1800, 2800)}ms`;
    confetti.append(piece);
  }

  container.append(confetti);
  window.setTimeout(() => confetti.remove(), durationMs);
}
