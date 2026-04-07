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

// ── Prefix index: simple Hebrew city name → first matching full key ───────────
// Handles the case where alerts/cities.json use a short name ("אשדוד") but
// alert_zones.json keys use the full label ("אשדוד | אזור לכיש").
// Maps the part before " | " or " - " to the first matching full key.
const prefixIndex = new Map();
for (const hebrewKey of Object.keys(alertZones)) {
  const prefix = hebrewKey.split(/\s*[|–-]\s*/)[0].trim();
  if (prefix && prefix !== hebrewKey && !prefixIndex.has(prefix)) {
    prefixIndex.set(prefix, hebrewKey);
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

  // 1. Exact match (full key like "אשדוד | אזור לכיש")
  const entry = alertZones[hebrewName];
  if (entry && SUPPORTED_LANGS.has(lang) && entry[lang]) return entry[lang];

  // 2. Prefix match (short name like "אשדוד" → first zone that starts with it)
  const fullKey = prefixIndex.get(hebrewName);
  if (fullKey) {
    const prefixEntry = alertZones[fullKey];
    if (prefixEntry && SUPPORTED_LANGS.has(lang) && prefixEntry[lang]) return prefixEntry[lang];
  }

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

/**
 * Returns true if `alertCity` (as received from Pikud HaOref) should trigger
 * a notification given the current set of monitored cities.
 *
 * Matching rules:
 *   1. Exact:          "תל אביב - מרכז" === "תל אביב - מרכז"
 *   2. Alert is sub-zone of monitored:
 *                      "תל אביב - מרכז".startsWith("תל אביב") → true
 *   3. Monitored is sub-zone of alert (less common, but handles reverse):
 *                      "תל אביב".startsWith("תל אביב - מרכז") → false, but
 *                      "תל אביב - מרכז".startsWith("תל אביב") → true (covered above)
 *
 * The separator check (space after prefix) prevents "בת ים" from matching
 * "בת ים וסביבה" AND "בית שמש" from accidentally matching "בית".
 *
 * @param {string}      alertCity
 * @param {Set<string>} monitored
 * @returns {boolean}
 */
/**
 * Returns the matched monitored city key if `alertCity` should trigger a
 * notification, or `null` if it should not.
 *
 * Returning the *stored* key (rather than a plain boolean) lets callers use
 * it as the canonical deduplication key so that multiple API sub-areas of the
 * same city (e.g. "רמת גן - מזרח" and "רמת גן - מערב") are collapsed into a
 * single notification keyed on "רמת גן | אזור דן".
 */
function isMonitored(alertCity, monitored) {
  if (monitored.has(alertCity)) return alertCity;
  for (const m of monitored) {
    // alertCity is a sub-zone of a monitored city prefix
    if (alertCity.startsWith(m + ' ') || alertCity.startsWith(m + '-') || alertCity.startsWith(m + '–')) return m;
    // monitored city is a sub-zone of the alert city
    if (m.startsWith(alertCity + ' ') || m.startsWith(alertCity + '-') || m.startsWith(alertCity + '–')) return m;

    // Handle zone keys stored by /addcity (format: "רמת גן | אזור דן").
    // The Oref API sends bare city names or hyphen-suffixed sub-areas
    // ("רמת גן - מזרח"), so strip " | <region>" and re-check.
    const pipeIdx = m.indexOf(' | ');
    if (pipeIdx !== -1) {
      const cityPrefix = m.slice(0, pipeIdx);
      if (alertCity === cityPrefix ||
          alertCity.startsWith(cityPrefix + ' ') ||
          alertCity.startsWith(cityPrefix + '-') ||
          alertCity.startsWith(cityPrefix + '–')) return m;
    }
  }
  return null;
}

module.exports = { getLocalizedName, translateCity, resolveToHebrew, isMonitored };
