/**
 * audio.js — lightweight sound-effect helper.
 *
 * Wraps HTMLAudioElement so games can `preload()` a short sound once and
 * `play()` it by name. Respects the global mute flag from storage.js and
 * never throws — missing sound files, autoplay restrictions, or unsupported
 * formats all degrade to a silent no-op so gameplay never breaks over audio.
 */

import { isMuted } from "./storage.js";

/** @type {Map<string, HTMLAudioElement>} */
const sounds = new Map();

/**
 * Preloads a sound so it can be played instantly later. Safe to call even if
 * `url` 404s — the element is still created, and `play()` will just no-op.
 * @param {string} name - Short id to reference the sound by, e.g. "correct".
 * @param {string} url - Relative path to the audio file.
 * @returns {void}
 */
export function preload(name, url) {
  try {
    const audio = new Audio(url);
    audio.preload = "auto";
    sounds.set(name, audio);
  } catch {
    // Audio unsupported in this environment — play() will just be a no-op.
  }
}

/**
 * Plays a previously preloaded sound, unless muted. Never throws.
 * @param {string} name - The id passed to `preload()` earlier.
 * @returns {void}
 */
export function play(name) {
  if (isMuted()) {
    return;
  }
  const audio = sounds.get(name);
  if (!audio) {
    return;
  }
  try {
    // Allow rapid repeated triggers by restarting from the beginning.
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Autoplay blocked or file missing — ignore, gameplay continues.
      });
    }
  } catch {
    // Ignore — a sound failing to play must never break the game.
  }
}
