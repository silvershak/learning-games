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

    "numbersMaze.title": "מבוך המספרים",
    "numbersMaze.start.prompt": "כמה מספרים לשחק?",
    "numbersMaze.start.count": "{count} מספרים",
    "numbersMaze.start.completed": "הושלם בעבר",
    "numbersMaze.play.instruction": "להתחיל מהמספר 1 ולהחליק עד {total}",
    "numbersMaze.play.next": "המספר הבא: {next}",
    "numbersMaze.play.progress": "הגעת עד {current} מתוך {total}",
    "numbersMaze.cell.label": "מספר {value}",
    "numbersMaze.a11y.reached": "הגעת ל-{value}",
    "numbersMaze.win.title": "כל הכבוד!",
    "numbersMaze.win.body": "סיימת את המבוך!",
    "numbersMaze.win.playAgain": "עוד פעם",
    "numbersMaze.win.changeCount": "לבחור מספר אחר",

    "memoryMatch.title": "משחק הזיכרון",
    "memoryMatch.setup.size": "גודל הלוח",
    "memoryMatch.setup.size.small": "קטן",
    "memoryMatch.setup.size.medium": "בינוני",
    "memoryMatch.setup.size.large": "גדול",
    "memoryMatch.setup.type": "סוג הקלפים",
    "memoryMatch.setup.type.emoji": "ציורים מעורבים",
    "memoryMatch.setup.type.colors": "צבעים וצורות",
    "memoryMatch.setup.type.animals": "חיות",
    "memoryMatch.setup.type.sea": "ציפורים וים",
    "memoryMatch.setup.type.garden": "חרקים וגינה",
    "memoryMatch.setup.type.produce": "פירות וירקות",
    "memoryMatch.setup.type.food": "אוכל",
    "memoryMatch.setup.type.vehicles": "כלי תחבורה",
    "memoryMatch.setup.type.sky": "שמיים וטבע",
    "memoryMatch.setup.type.objects": "חפצים ומשחק",
    "memoryMatch.setup.players": "כמה שחקנים",
    "memoryMatch.setup.players.one": "שחקן אחד",
    "memoryMatch.setup.players.two": "שני שחקנים",
    "memoryMatch.setup.start": "התחלה",
    "memoryMatch.setup.noRecord": "עדיין אין שיא בהרכב הזה",
    "memoryMatch.setup.bestMoves": "השיא שלך: {moves} ניסיונות",
    "memoryMatch.setup.playCount": "שיחקת {count} פעמים",
    "memoryMatch.play.score": "{player} — {pairs} זוגות",
    "memoryMatch.play.moves": "נסיונות: {moves}",
    "memoryMatch.play.player1": "🔵 1",
    "memoryMatch.play.player2": "🟢 2",
    "memoryMatch.card.hidden": "קלף סגור",
    "memoryMatch.card.face": "קלף {name}",
    "memoryMatch.card.matched": "זוג של {name}",
    "memoryMatch.face.color": "{shape} {hue} {fill}",
    "memoryMatch.shape.circle": "עיגול",
    "memoryMatch.shape.square": "ריבוע",
    "memoryMatch.shape.triangle": "משולש",
    "memoryMatch.shape.diamond": "מעוין",
    "memoryMatch.shape.star": "כוכב",
    "memoryMatch.shape.heart": "לב",
    "memoryMatch.shape.plus": "פלוס",
    "memoryMatch.shape.moon": "סהר",
    "memoryMatch.hue.red": "אדום",
    "memoryMatch.hue.orange": "כתום",
    "memoryMatch.hue.yellow": "צהוב",
    "memoryMatch.hue.green": "ירוק",
    "memoryMatch.hue.teal": "טורקיז",
    "memoryMatch.hue.blue": "כחול",
    "memoryMatch.hue.purple": "סגול",
    "memoryMatch.hue.pink": "ורוד",
    "memoryMatch.fill.solid": "מלא",
    "memoryMatch.fill.outline": "בקו",
    "memoryMatch.a11y.revealed": "נחשף {name}",
    "memoryMatch.a11y.match": "זוג!",
    "memoryMatch.a11y.noMatch": "לא זוג",
    "memoryMatch.a11y.turn": "התור של {player}",
    "memoryMatch.win.title": "כל הכבוד!",
    "memoryMatch.win.solo": "מצאת את כל {pairs} הזוגות!",
    "memoryMatch.win.moves": "מספר ניסיונות: {moves}",
    "memoryMatch.win.newRecord": "שיא חדש! 🎉",
    "memoryMatch.win.fewerMovesBy": "פחות ב-{count} ניסיונות מהשיא הקודם!",
    "memoryMatch.win.moreMovesBy": "יותר ב-{count} ניסיונות מהשיא. אפשר לנסות שוב!",
    "memoryMatch.win.best": "הכי הרבה זוגות: {player} עם {pairs} זוגות",
    "memoryMatch.win.tie": "תיקו — {pairs} זוגות לכל אחד",
    "memoryMatch.win.playAgain": "עוד פעם",
    "memoryMatch.win.changeSetup": "לשנות את המשחק",
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

    "numbersMaze.title": "Numbers Maze",
    "numbersMaze.start.prompt": "How many numbers to play with?",
    "numbersMaze.start.count": "{count} numbers",
    "numbersMaze.start.completed": "Completed before",
    "numbersMaze.play.instruction": "Start at 1 and slide to {total}",
    "numbersMaze.play.next": "Next number: {next}",
    "numbersMaze.play.progress": "You've reached {current} of {total}",
    "numbersMaze.cell.label": "Number {value}",
    "numbersMaze.a11y.reached": "Reached {value}",
    "numbersMaze.win.title": "Well done!",
    "numbersMaze.win.body": "You finished the maze!",
    "numbersMaze.win.playAgain": "Play again",
    "numbersMaze.win.changeCount": "Choose another count",

    "memoryMatch.title": "Memory Match",
    "memoryMatch.setup.size": "Board size",
    "memoryMatch.setup.size.small": "Small",
    "memoryMatch.setup.size.medium": "Medium",
    "memoryMatch.setup.size.large": "Large",
    "memoryMatch.setup.type": "Card type",
    "memoryMatch.setup.type.emoji": "Mixed pictures",
    "memoryMatch.setup.type.colors": "Colors and shapes",
    "memoryMatch.setup.type.animals": "Animals",
    "memoryMatch.setup.type.sea": "Birds & Sea",
    "memoryMatch.setup.type.garden": "Garden Bugs",
    "memoryMatch.setup.type.produce": "Fruits & Veggies",
    "memoryMatch.setup.type.food": "Food",
    "memoryMatch.setup.type.vehicles": "Vehicles",
    "memoryMatch.setup.type.sky": "Sky & Nature",
    "memoryMatch.setup.type.objects": "Toys & Objects",
    "memoryMatch.setup.players": "Number of players",
    "memoryMatch.setup.players.one": "One player",
    "memoryMatch.setup.players.two": "Two players",
    "memoryMatch.setup.start": "Start",
    "memoryMatch.setup.noRecord": "No record yet for this combination",
    "memoryMatch.setup.bestMoves": "Your record: {moves} tries",
    "memoryMatch.setup.playCount": "Played {count} times",
    "memoryMatch.play.score": "{player} — {pairs} pairs",
    "memoryMatch.play.moves": "Tries: {moves}",
    "memoryMatch.play.player1": "🔵 1",
    "memoryMatch.play.player2": "🟢 2",
    "memoryMatch.card.hidden": "Face-down card",
    "memoryMatch.card.face": "Card: {name}",
    "memoryMatch.card.matched": "Matched pair: {name}",
    "memoryMatch.face.color": "{shape} {hue} {fill}",
    "memoryMatch.shape.circle": "circle",
    "memoryMatch.shape.square": "square",
    "memoryMatch.shape.triangle": "triangle",
    "memoryMatch.shape.diamond": "diamond",
    "memoryMatch.shape.star": "star",
    "memoryMatch.shape.heart": "heart",
    "memoryMatch.shape.plus": "plus",
    "memoryMatch.shape.moon": "moon",
    "memoryMatch.hue.red": "red",
    "memoryMatch.hue.orange": "orange",
    "memoryMatch.hue.yellow": "yellow",
    "memoryMatch.hue.green": "green",
    "memoryMatch.hue.teal": "teal",
    "memoryMatch.hue.blue": "blue",
    "memoryMatch.hue.purple": "purple",
    "memoryMatch.hue.pink": "pink",
    "memoryMatch.fill.solid": "solid",
    "memoryMatch.fill.outline": "outline",
    "memoryMatch.a11y.revealed": "Revealed {name}",
    "memoryMatch.a11y.match": "Match!",
    "memoryMatch.a11y.noMatch": "Not a match",
    "memoryMatch.a11y.turn": "{player}'s turn",
    "memoryMatch.win.title": "Well done!",
    "memoryMatch.win.solo": "You found all {pairs} pairs!",
    "memoryMatch.win.moves": "Number of tries: {moves}",
    "memoryMatch.win.newRecord": "New record! 🎉",
    "memoryMatch.win.fewerMovesBy": "Fewer by {count} tries than your previous record!",
    "memoryMatch.win.moreMovesBy": "More by {count} tries than your record. Try again!",
    "memoryMatch.win.best": "Most pairs: {player} with {pairs} pairs",
    "memoryMatch.win.tie": "Tie — {pairs} pairs each",
    "memoryMatch.win.playAgain": "Play again",
    "memoryMatch.win.changeSetup": "Change setup",
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
