/**
 * games/manifest.js — the single source of truth for the portal's game list.
 *
 * Adding a game should never require touching portal code — just append one
 * entry here. Each entry has this exact shape:
 *
 *   {
 *     id:     string   // unique, matches the folder name under games/<id>/
 *     title:  string   // Hebrew display title
 *     genre:  string   // one of GENRES below
 *     minAge: number   // inclusive minimum recommended age
 *     maxAge: number   // inclusive maximum recommended age
 *     icon:   string   // a single emoji used as the card icon
 *     path:   string   // relative path from the repo root, e.g. "games/<id>/index.html"
 *     locked: boolean  // true hides gameplay behind a "locked" badge on the card
 *   }
 *
 * @typedef {Object} GameEntry
 * @property {string} id
 * @property {string} title
 * @property {string} genre
 * @property {number} minAge
 * @property {number} maxAge
 * @property {string} icon
 * @property {string} path
 * @property {boolean} locked
 */

/** @type {GameEntry[]} */
export const games = [];

/** Genres used by the portal's filter controls (Hebrew labels). */
export const GENRES = ["שפה", "מתמטיקה", "היגיון", "זיכרון", "יצירתיות"];
