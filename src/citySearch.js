'use strict';

const alertZones = require('./data/alert_zones.json');

/**
 * Flat search index built once at startup.
 * Each entry caches lower-cased versions of all three language labels so
 * the hot search path does zero per-query allocations.
 *
 * @type {Array<{hebrew: string, en: string, ru: string, he: string, en_lc: string, ru_lc: string, he_lc: string}>}
 */
/** Normalises a string for fuzzy matching: lowercase + collapse hyphens/dashes to spaces. */
function normalise(s) {
  return s.toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

const INDEX = Object.entries(alertZones).map(([hebrew, t]) => ({
  hebrew,
  en:    t.en || hebrew,
  ru:    t.ru || hebrew,
  he:    hebrew,
  en_lc: normalise(t.en || hebrew),
  ru_lc: normalise(t.ru || hebrew),
  he_lc: normalise(hebrew),
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

  const q = normalise(query);

  // Display field (original case) for the label.
  const dispKey = lang === 'ru' ? 'ru' : lang === 'he' ? 'he' : 'en';

  const results = [];

  for (const entry of INDEX) {
    // Search across ALL language indices so the user can type in any language
    // regardless of their UI language setting (e.g. type Russian while lang=en).
    const matched =
      entry.en_lc.includes(q) ||
      entry.ru_lc.includes(q) ||
      entry.he_lc.includes(q);

    if (matched) {
      results.push({ hebrew: entry.hebrew, label: entry[dispKey] });
      if (results.length >= limit) break;
    }
  }

  return results;
}

module.exports = { searchZones };