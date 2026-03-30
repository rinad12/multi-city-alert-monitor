'use strict';

const { TARGET_LANG } = require('./config');

// All bot UI strings and alert templates in every supported language.
// Schema: { "<key>": { "en": "...", "he": "...", "ru": "..." }, … }
const TRANSLATIONS = require('./data/translations.json');

// Supported language codes. Falls back to 'en' for any unknown value.
const SUPPORTED_LANGS = new Set(['en', 'he', 'ru']);

// Resolved language for this runtime.
const LANG = SUPPORTED_LANGS.has(TARGET_LANG) ? TARGET_LANG : 'en';

// Populated once by initTranslations(). All values are strings in LANG.
// Alert templates contain the %CITY% placeholder substituted at send time.
const T = {};

/**
 * Loads the correct language slice from translations.json into the shared T
 * object. Synchronous — no network I/O required.
 * Returns a resolved Promise so existing call sites that await it still work.
 */
function initTranslations() {
  console.log(`[INFO] Loading bot strings for language "${LANG}"…`);

  for (const [key, variants] of Object.entries(TRANSLATIONS)) {
    // Use the requested lang, fall back to English if the key is missing.
    T[key] = variants[LANG] || variants['en'] || '';
  }

  console.log('[INFO] Bot strings ready.');
  return Promise.resolve();
}

/**
 * Returns a bullet-list of all monitored cities translated to TARGET_LANG.
 *
 * @param {Set<string>} citySet
 * @param {Function}    translateCity - translateCity(hebrewCity) from cityHelpers.js
 */
async function citiesList(citySet, translateCity) {
  const names = await Promise.all([...citySet].map((c) => translateCity(c)));
  return names.map((n) => `• ${n}`).join('\n');
}

module.exports = { T, initTranslations, citiesList };
