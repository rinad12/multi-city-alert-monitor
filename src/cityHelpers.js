'use strict';

const { translate } = require('../translate');
const { TARGET_LANG } = require('./config');

// Detects Hebrew Unicode characters (main block + presentation forms).
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Translates a Hebrew city name (as returned by the Pikud HaOref API) to
 * TARGET_LANG for display.
 */
function translateCity(hebrewCity) {
  return translate(hebrewCity, 'he');
}

/**
 * Accepts a city name in any language and returns the Hebrew form expected by
 * the Pikud HaOref API:
 *   - Already Hebrew text → returned as-is.
 *   - TARGET_LANG is 'he' → returned as-is (user is already typing Hebrew).
 *   - Otherwise → translated from TARGET_LANG to Hebrew via LibreTranslate.
 */
function resolveToHebrew(input) {
  if (HEBREW_RE.test(input) || TARGET_LANG === 'he') return Promise.resolve(input);
  return translate(input, TARGET_LANG, 'he');
}

module.exports = { translateCity, resolveToHebrew };
