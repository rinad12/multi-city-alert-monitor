'use strict';

const path = require('path');
const { TARGET_LANG } = require('./config');

// ── Static zone map (populated by scripts/fetch_alert_zones.js) ──────────────
// Schema: { "<Hebrew name>": { "en": "...", "ru": "..." }, … }
const alertZones = require('./data/alert_zones.json');

// Detects Hebrew Unicode characters (main block + presentation forms).
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

// Supported non-Hebrew language codes present in alert_zones.json.
const SUPPORTED_LANGS = new Set(['en', 'ru']);

// ── Reverse index: localised name (lower-cased) → Hebrew key ─────────────────
// Built once at startup so /addcity lookups are O(1).
const reverseIndex = new Map();
for (const [hebrewName, translations] of Object.entries(alertZones)) {
  for (const localised of Object.values(translations)) {
    if (localised && localised !== hebrewName) {
      reverseIndex.set(localised.toLowerCase(), hebrewName);
    }
  }
}

/**
 * Returns the localised display name for a Hebrew zone name.
 * Falls back to the Hebrew original if the zone is not in the static map
 * or the requested language is not available (e.g. a brand-new zone added
 * by Pikud HaOref after the last scraper run).
 *
 * @param {string} hebrewName
 * @param {string} [lang]      Defaults to TARGET_LANG.
 * @returns {string}
 */
function getLocalizedName(hebrewName, lang = TARGET_LANG) {
  if (lang === 'he') return hebrewName;
  const entry = alertZones[hebrewName];
  if (entry && SUPPORTED_LANGS.has(lang) && entry[lang]) return entry[lang];
  return hebrewName; // graceful fallback to Hebrew
}

/**
 * Returns the display name for a Hebrew city/zone in TARGET_LANG.
 * Kept as an async function to preserve the existing call-site API.
 *
 * @param {string} hebrewCity
 * @returns {Promise<string>}
 */
function translateCity(hebrewCity) {
  return Promise.resolve(getLocalizedName(hebrewCity));
}

/**
 * Accepts a city name in any language and returns the Hebrew form expected by
 * the Pikud HaOref API:
 *   - Already Hebrew text    → returned as-is.
 *   - TARGET_LANG is 'he'    → returned as-is.
 *   - Localised name found   → mapped back to Hebrew via reverse index.
 *   - Not found              → returned as-is (user may have typed Hebrew or
 *                              a name that is not yet in the static map).
 *
 * @param {string} input
 * @returns {Promise<string>}
 */
function resolveToHebrew(input) {
  if (HEBREW_RE.test(input) || TARGET_LANG === 'he') return Promise.resolve(input);
  const hebrew = reverseIndex.get(input.toLowerCase());
  return Promise.resolve(hebrew || input);
}

module.exports = { getLocalizedName, translateCity, resolveToHebrew };
