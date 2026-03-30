'use strict';

const fs   = require('fs');
const path = require('path');

const { TARGET_LANG } = require('./config');

const PREFS_FILE   = process.env.USER_PREFS_PATH
  || path.join(__dirname, '..', 'user_prefs.json');
const SUPPORTED    = new Set(['en', 'he', 'ru']);
const DEFAULT_LANG = SUPPORTED.has(TARGET_LANG) ? TARGET_LANG : 'en';

// In-memory store: userId (string) → { lang }
const store = new Map();

function load() {
  if (!fs.existsSync(PREFS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    for (const [uid, prefs] of Object.entries(data)) {
      store.set(uid, prefs);
    }
  } catch {
    console.warn('[WARN] Failed to parse user_prefs.json — starting fresh.');
  }
}

function save() {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(Object.fromEntries(store), null, 2), 'utf8');
  } catch (err) {
    console.error(`[ERROR] Failed to write user_prefs.json: ${err.message}`);
  }
}

/**
 * Returns the stored language for a user. Falls back to their Telegram
 * language_code if available, then DEFAULT_LANG.
 *
 * @param {number|string} userId
 * @param {string}        [telegramLang]  ctx.from.language_code
 * @returns {'en'|'he'|'ru'}
 */
function getUserLang(userId) {
  const prefs = store.get(String(userId));
  if (prefs && SUPPORTED.has(prefs.lang)) return prefs.lang;
  return DEFAULT_LANG;
}

/**
 * Persists a language preference for a user.
 *
 * @param {number|string}  userId
 * @param {'en'|'he'|'ru'} lang
 */
function setUserLang(userId, lang) {
  const prefs = store.get(String(userId)) || {};
  prefs.lang  = lang;
  store.set(String(userId), prefs);
  save();
}

load();

module.exports = { getUserLang, setUserLang };