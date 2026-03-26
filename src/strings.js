'use strict';

const { TARGET_LANG } = require('./config');

// Populated by initTranslations(). All values are strings in TARGET_LANG.
// Alert templates contain the %CITY% placeholder substituted at send time.
const T = {};

// English source strings. Keys match T exactly — no positional coupling.
const SOURCE_STRINGS = {
  // ── Alert templates ────────────────────────────────────────────────────────
  missiles:
    '🚀 *MISSILE ALERT: %CITY%* 🚨\n\n' +
    "Please don't worry — the siren has gone off and I am already in a safe place. " +
    "I won't be able to answer calls until the incident is over. " +
    "Everything is under control — I'll write as soon as I'm out!",

  hostileAircraft:
    '✈️ *AIR THREAT: %CITY%* 🚨\n\n' +
    "A suspicious object has been detected in the sky. I am already in a protected space — it's safe here. " +
    "I won't be able to answer calls until the incident is over. " +
    'Just following safety protocol and waiting for the all-clear.',

  earthquake:
    '🫨 *EARTHQUAKE: %CITY%* 🚨\n\n' +
    "Ground tremors have been detected. I have moved to open ground as instructed. I'm fine — don't worry!",

  terroristInfiltration:
    '🪖 *SECURITY ALERT: %CITY%* 🚨\n\n' +
    "Suspected infiltration in the area. I'm at home with the doors locked — everything is fine. " +
    'I am in a protected room and following instructions.',

  tsunami:
    '🌊 *TSUNAMI WARNING: %CITY%* 🚨\n\n' +
    'A tsunami warning has been issued. I have moved to a safe distance from the coastline. ' +
    'Everything is under control.',

  hazmat:
    '⚠️ *HAZMAT ALERT: %CITY%* 🚨\n\n' +
    "A hazardous-materials leak has been reported. I have sealed the windows and am staying indoors. " +
    "I'm fine — just a precaution.",

  allClear:
    '✅ *ALL CLEAR: %CITY%* ✅\n\n' +
    'The Home Front Command has confirmed the end of the incident. You may leave the shelter. 😊',

  newsFlashShelter:
    '🔔 *NOTICE: %CITY%* 🔔\n\n' +
    "Instructions have been given to stay near a protected space. " +
    "I'm already nearby — everything is fine, just a precaution.",

  defaultAlert:
    '🚨 *ALERT: %CITY%* 🚨\n\n' +
    'This message was sent automatically — a siren has gone off in the area. ' +
    'I am following safety instructions and am in a protected space.',

  // ── Command responses ──────────────────────────────────────────────────────
  citiesHeader:          '📍 *Monitored cities:*',
  addcityUsage:          'ℹ️ Usage: /addcity בת ים,תל אביב',
  addcityAlready:        'ℹ️ All specified cities are already being monitored.',
  removecityUsage:       'ℹ️ Usage: /removecity בת ים,תל אביב',
  removecityNotFound:    'ℹ️ None of the specified cities were found in the list.',
  removecityCannotEmpty: '⚠️ Cannot remove all cities — the list must contain at least one.',
  setcitiesUsage:        'ℹ️ Usage: /setcities בת ים,תל אביב',
  setcitiesEmpty:        '⚠️ The city list cannot be empty.',
  statusAllClear:        '✅ All clear — no active alerts.',
  statusActiveHeader:    '🚨 *Active alerts:*',

  // ── Section labels ─────────────────────────────────────────────────────────
  labelAdded:            '➕ *Added:*',
  labelRemoved:          '➖ *No longer monitoring:*',
  labelNotFound:         '❓ *Not found in list:*',
  labelNowMonitoring:    '📍 *Now monitoring:*',

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  startupPrefix: '✅ *Bot started and running*\n\nMonitoring cities:',
  stopped:       '🔴 *Bot stopped*',
};

/**
 * Translates all SOURCE_STRINGS in parallel and populates the shared T object.
 * Must be awaited before the bot handles any messages.
 *
 * @param {Function} translateFn - translate(text, sourceLang?, targetLang?) from translate.js
 */
async function initTranslations(translateFn) {
  console.log(`[INFO] Translating bot strings to "${TARGET_LANG}"…`);

  const keys   = Object.keys(SOURCE_STRINGS);
  const values = await Promise.all(keys.map((k) => translateFn(SOURCE_STRINGS[k])));

  for (let i = 0; i < keys.length; i++) {
    T[keys[i]] = values[i];
  }

  console.log('[INFO] Bot strings ready.');
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
