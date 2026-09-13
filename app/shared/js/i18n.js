/**
 * i18n.js — tiny string table + language helpers.
 *
 * Hebrew (`he`) is the default and fully populated language; `en` is kept as
 * a stub for a possible future translation. Display strings should always be
 * looked up through `t()` rather than hardcoded in markup or game code.
 */

import * as storage from "./storage.js";

const SETTINGS_SCOPE = "settings";
const LANG_KEY = "lang";
const DEFAULT_LANG = "he";

/** Languages that read right-to-left. */
const RTL_LANGS = new Set(["he"]);

/** @type {Object<string, Object<string, string>>} */
const strings = {
  he: {
    "app.title": "משחקי למידה",
    "nav.back": "חזרה",
    "nav.home": "בית",
    "filters.genre": "סוג משחק",
    "filters.genre.all": "הכול",
    "filters.age": "גיל",
    "filters.age.all": "כל הגילאים",
    "portal.empty": "אין עדיין משחקים כאן. חזרו בקרוב!",
    "offline.title": "אופס, אין חיבור",
    "offline.body": "הדף הזה עדיין לא נשמר במכשיר. כשהחיבור יחזור, נסו שוב.",
    "game.locked": "נעול",
  },
  en: {
    "app.title": "Learning Games",
    "nav.back": "Back",
    "nav.home": "Home",
    "filters.genre": "Genre",
    "filters.genre.all": "All",
    "filters.age": "Age",
    "filters.age.all": "All ages",
    "portal.empty": "No games here yet. Check back soon!",
    "offline.title": "Oops, no connection",
    "offline.body": "This page isn't saved on your device yet. Try again once you're back online.",
    "game.locked": "Locked",
  },
};

/**
 * Gets the current UI language, falling back to the default.
 * @returns {string} A language code, e.g. "he".
 */
export function getLang() {
  return storage.get(SETTINGS_SCOPE, LANG_KEY, DEFAULT_LANG);
}

/**
 * Persists the UI language for future visits.
 * @param {string} lang - A language code present in the `strings` table.
 * @returns {void}
 */
export function setLang(lang) {
  storage.set(SETTINGS_SCOPE, LANG_KEY, lang);
}

/**
 * Sets `<html lang dir>` to match the current (or given) language.
 * @param {string} [lang] - Defaults to the persisted/current language.
 * @returns {void}
 */
export function applyDir(lang = getLang()) {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
}

/**
 * Looks up a display string, interpolating `{name}` placeholders.
 * @param {string} key - Dotted string key, e.g. "app.title".
 * @param {Object<string, string|number>} [vars] - Values for `{placeholders}`.
 * @returns {string} The resolved string, or the key itself if missing.
 */
export function t(key, vars = {}) {
  const lang = getLang();
  const table = strings[lang] ?? strings[DEFAULT_LANG];
  const template = table[key] ?? strings[DEFAULT_LANG][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match
  );
}
