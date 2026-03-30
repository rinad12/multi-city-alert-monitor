'use strict';

const alertZones = require('./data/alert_zones.json');

/**
 * Flat search index built once at startup.
 * Each entry caches lower-cased versions of all three language labels so
 * the hot search path does zero per-query allocations.
 *
 * @type {Array<{hebrew: string, en: string, ru: string, he: string, en_lc: string, ru_lc: string, he_lc: string}>}
 */
const INDEX = Object.entries(alertZones).map(([hebrew, t]) => ({
  hebrew,
  en:    t.en || hebrew,
  ru:    t.ru || hebrew,
  he:    hebrew,
  en_lc: (t.en || hebrew).toLowerCase(),
  ru_lc: (t.ru || hebrew).toLowerCase(),
  he_lc: hebrew.toLowerCase(),
}));

/**
 * Searches alert zones for a given query string.
 *
 * Matching strategy: case-insensitive substring match tested against both the
 * localized label in the user's language AND the raw Hebrew name. This means
 * a user can type Hebrew even when their UI language is set to English/Russian.
 *
 * Performance: single O(n) pass over ~1200 entries, exits early once `limit`
 * results are collected. No external dependencies required.
 *
 * @param {string}          query  User-supplied search term (any language).
 * @param {'en'|'he'|'ru'}  lang   User's UI language — determines display label.
 * @param {number}          [limit=10]
 * @returns {Array<{hebrew: string, label: string}>}
 *   `hebrew` is the canonical key used by the Pikud HaOref API and cityStore.
 *   `label`  is the display name in `lang` (falls back to Hebrew if unavailable).
 */
function searchZones(query, lang, limit = 10) {
  if (!query || !query.trim()) return [];

  const q = query.trim().toLowerCase();

  // Pick which pre-computed lowercase field to match against for this language.
  const langKey = lang === 'ru' ? 'ru_lc' : lang === 'he' ? 'he_lc' : 'en_lc';
  // Display field (original case) for the label.
  const dispKey = lang === 'ru' ? 'ru'    : lang === 'he' ? 'he'    : 'en';

  const results = [];

  for (const entry of INDEX) {
    if (entry[langKey].includes(q) || entry.he_lc.includes(q)) {
      results.push({ hebrew: entry.hebrew, label: entry[dispKey] });
      if (results.length >= limit) break;
    }
  }

  return results;
}

module.exports = { searchZones };