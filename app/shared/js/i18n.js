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
    "filters.age": "גילאים",
    "filters.age.all": "כל הגילאים",
    "portal.games": "משחקים",
    "portal.empty": "עדיין אין כאן משחקים. בקרוב!",
    "offline.title": "אופס, אין חיבור",
    "offline.body": "הדף הזה עדיין לא נשמר במכשיר. כשהחיבור יחזור, אפשר לנסות שוב.",
    "game.locked": "נעול",

    "fastCalc.title": "חשבון מהיר",
    "fastCalc.op.add": "חיבור",
    "fastCalc.op.sub": "חיסור",
    "fastCalc.op.mul": "כפל",
    "fastCalc.op.div": "חילוק",
    "fastCalc.start.operation": "פעולה חשבונית",
    "fastCalc.start.maxResult": "עד כמה",
    "fastCalc.start.questionCount": "מספר שאלות",
    "fastCalc.start.showClock": "הצגת שעון",
    "fastCalc.start.noRecord": "עדיין אין לך שיא בכללי המשחק הזה",
    "fastCalc.start.bestTime": "השיא שלך בכללי המשחק הזה הוא {time} שניות",
    "fastCalc.start.play": "התחלה",
    "fastCalc.play.progress": "שאלה {current} מתוך {total}",
    "fastCalc.play.timer": "⏱ {time} שניות",
    "fastCalc.play.record": "🏆 השיא: {time} שניות",
    "fastCalc.play.cooldown": "רגע... {seconds} שניות",
    "fastCalc.finish.title": "סיימת!",
    "fastCalc.finish.time": "הזמן שלך: {time} שניות",
    "fastCalc.finish.fasterBy": "מהר יותר ב-{seconds} שניות מהשיא הקודם! 🎉",
    "fastCalc.finish.slowerBy": "לאט יותר ב-{seconds} שניות מהשיא. אפשר לנסות שוב!",
    "fastCalc.finish.newRecord": "שיא חדש! 🎉",
    "fastCalc.finish.playAgain": "עוד פעם",
    "fastCalc.finish.backToStart": "חזרה להתחלה",
  },
  en: {
    "app.title": "Learning Games",
    "nav.back": "Back",
    "nav.home": "Home",
    "filters.genre": "Genre",
    "filters.genre.all": "All",
    "filters.age": "Ages",
    "filters.age.all": "All ages",
    "portal.games": "Games",
    "portal.empty": "No games here yet. Coming soon!",
    "offline.title": "Oops, no connection",
    "offline.body": "This page isn't saved on your device yet. Try again once you're back online.",
    "game.locked": "Locked",

    "fastCalc.title": "Fast Calculation",
    "fastCalc.op.add": "Addition",
    "fastCalc.op.sub": "Subtraction",
    "fastCalc.op.mul": "Multiplication",
    "fastCalc.op.div": "Division",
    "fastCalc.start.operation": "Operation",
    "fastCalc.start.maxResult": "Up to how much",
    "fastCalc.start.questionCount": "Number of questions",
    "fastCalc.start.showClock": "Show clock",
    "fastCalc.start.noRecord": "No record yet for these game rules",
    "fastCalc.start.bestTime": "Your record for these game rules is {time}s",
    "fastCalc.start.play": "Start",
    "fastCalc.play.progress": "Question {current} of {total}",
    "fastCalc.play.timer": "⏱ {time}s",
    "fastCalc.play.record": "🏆 Record: {time}s",
    "fastCalc.play.cooldown": "Wait... {seconds}s",
    "fastCalc.finish.title": "Done!",
    "fastCalc.finish.time": "Your time: {time}s",
    "fastCalc.finish.fasterBy": "Faster by {seconds}s than your record! 🎉",
    "fastCalc.finish.slowerBy": "Slower by {seconds}s than your record. Try again!",
    "fastCalc.finish.newRecord": "New record! 🎉",
    "fastCalc.finish.playAgain": "Play again",
    "fastCalc.finish.backToStart": "Back to start",
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
