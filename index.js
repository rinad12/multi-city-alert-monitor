'use strict';

require('dotenv').config();

// Suppress verbose debug logs emitted by pikud-haoref-api internals
const _origLog = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Pikud Haoref API]')) return;
  _origLog(...args);
};

const fs = require('fs');
const path = require('path');
const pikudHaoref = require('pikud-haoref-api');
const { Telegraf } = require('telegraf');
const { translate, TARGET_LANG } = require('./translate');

// ── Environment validation ────────────────────────────────────────────────────

const { BOT_TOKEN, CHANNEL_ID, TARGET_CITIES_HEBREW } = process.env;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('[FATAL] Missing required environment variables: BOT_TOKEN, CHANNEL_ID');
  process.exit(1);
}

// ── Persistent city list ──────────────────────────────────────────────────────

const CITIES_FILE = path.join(__dirname, 'cities.json');

function loadCities() {
  if (fs.existsSync(CITIES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return new Set(data);
    } catch {
      console.warn('[WARN] Failed to parse cities.json — falling back to .env');
    }
  }
  const fromEnv = (TARGET_CITIES_HEBREW || '')
    .split(',').map((c) => c.trim()).filter(Boolean);
  if (fromEnv.length === 0) {
    console.error('[FATAL] No cities configured. Set TARGET_CITIES_HEBREW in .env or use /addcity.');
    process.exit(1);
  }
  return new Set(fromEnv);
}

function saveCities() {
  fs.writeFileSync(CITIES_FILE, JSON.stringify([...TARGET_CITIES], null, 2), 'utf8');
}

const TARGET_CITIES = loadCities();
saveCities();

// ── Telegram bot ──────────────────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);

// ── City name helpers ─────────────────────────────────────────────────────────

// City names from the API are always Hebrew. Translate he → TARGET_LANG for display.
function translateCity(hebrewCity) {
  return translate(hebrewCity, 'he');
}

// Hebrew Unicode block detection
function isHebrew(text) {
  return /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(text);
}

// Accept city input in any language; resolve to the Hebrew form used by the API.
function resolveToHebrew(input) {
  if (isHebrew(input) || TARGET_LANG === 'he') return Promise.resolve(input);
  return translate(input, TARGET_LANG, 'he');
}

// ── Pre-translated strings ────────────────────────────────────────────────────
//
// All static bot strings are translated once at startup.
// Alert templates use %CITY% as a placeholder for the runtime city name.

const T = {};

async function initTranslations() {
  console.log(`[INFO] Translating bot strings to "${TARGET_LANG}"…`);

  const strings = [
    // Alert message templates — %CITY% replaced at runtime
    /* 0  missiles             */ '🚀 *MISSILE ALERT: %CITY%* 🚨\n\nPlease don\'t worry — the siren has gone off and I am already in a safe place. I won\'t be able to answer calls until the incident is over. Everything is under control — I\'ll write as soon as I\'m out!',
    /* 1  hostileAircraft      */ '✈️ *AIR THREAT: %CITY%* 🚨\n\nA suspicious object has been detected in the sky. I am already in a protected space — it\'s safe here. I won\'t be able to answer calls until the incident is over. Just following safety protocol and waiting for the all-clear.',
    /* 2  earthQuake           */ '🫨 *EARTHQUAKE: %CITY%* 🚨\n\nGround tremors have been detected. I have moved to open ground as instructed. I\'m fine — don\'t worry!',
    /* 3  terroristInfiltration*/ '🪖 *SECURITY ALERT: %CITY%* 🚨\n\nSuspected infiltration in the area. I\'m at home with the doors locked — everything is fine. I am in a protected room and following instructions.',
    /* 4  tsunami              */ '🌊 *TSUNAMI WARNING: %CITY%* 🚨\n\nA tsunami warning has been issued. I have moved to a safe distance from the coastline. Everything is under control.',
    /* 5  hazmat               */ '⚠️ *HAZMAT ALERT: %CITY%* 🚨\n\nA hazardous-materials leak has been reported. I have sealed the windows and am staying indoors. I\'m fine — just a precaution.',
    /* 6  allClear             */ '✅ *ALL CLEAR: %CITY%* ✅\n\nThe Home Front Command has confirmed the end of the incident. You may leave the shelter. 😊',
    /* 7  newsFlashShelter     */ '🔔 *NOTICE: %CITY%* 🔔\n\nInstructions have been given to stay near a protected space. I\'m already nearby — everything is fine, just a precaution.',
    /* 8  defaultAlert         */ '🚨 *ALERT: %CITY%* 🚨\n\nThis message was sent automatically — a siren has gone off in the area. I am following safety instructions and am in a protected space.',
    // Command responses
    /* 9  citiesHeader         */ '📍 *Monitored cities:*',
    /* 10 addcityUsage         */ 'ℹ️ Usage: /addcity בת ים,תל אביב',
    /* 11 addcityAlready       */ 'ℹ️ All specified cities are already being monitored.',
    /* 12 removecityUsage      */ 'ℹ️ Usage: /removecity בת ים,תל אביב',
    /* 13 removecityNotFound   */ 'ℹ️ None of the specified cities were found in the list.',
    /* 14 removecityCannotEmpty*/ '⚠️ Cannot remove all cities — the list must contain at least one.',
    /* 15 setcitiesUsage       */ 'ℹ️ Usage: /setcities בת ים,תל אביב',
    /* 16 setcitiesEmpty       */ '⚠️ The city list cannot be empty.',
    /* 17 statusAllClear       */ '✅ All clear — no active alerts.',
    /* 18 statusActiveHeader   */ '🚨 *Active alerts:*',
    // Section labels
    /* 19 labelAdded           */ '➕ *Added:*',
    /* 20 labelRemoved         */ '➖ *No longer monitoring:*',
    /* 21 labelNotFound        */ '❓ *Not found in list:*',
    /* 22 labelNowMonitoring   */ '📍 *Now monitoring:*',
    // Lifecycle
    /* 23 startupPrefix        */ '✅ *Bot started and running*\n\nMonitoring cities:',
    /* 24 stopped              */ '🔴 *Bot stopped*',
  ];

  const translated = await Promise.all(strings.map((s) => translate(s)));

  [
    T.missiles,
    T.hostileAircraft,
    T.earthquake,
    T.terroristInfiltration,
    T.tsunami,
    T.hazmat,
    T.allClear,
    T.newsFlashShelter,
    T.defaultAlert,
    T.citiesHeader,
    T.addcityUsage,
    T.addcityAlready,
    T.removecityUsage,
    T.removecityNotFound,
    T.removecityCannotEmpty,
    T.setcitiesUsage,
    T.setcitiesEmpty,
    T.statusAllClear,
    T.statusActiveHeader,
    T.labelAdded,
    T.labelRemoved,
    T.labelNotFound,
    T.labelNowMonitoring,
    T.startupPrefix,
    T.stopped,
  ] = translated;

  console.log('[INFO] Bot strings ready.');
}

// ── Alert messages ────────────────────────────────────────────────────────────

const DRILL_SUFFIX = 'Drill';
const INSTRUCTIONS_ALL_CLEAR = ['ניתן לצאת', 'הסתיים'];

function containsAny(text, keywords) {
  if (!text) return false;
  return keywords.some((kw) => text.includes(kw));
}

// `cityName` is already translated to TARGET_LANG.
// Alert body templates are pre-translated; only %CITY% is substituted at runtime.
function buildMessage(cityName, alert) {
  const type = alert.type || 'unknown';
  const instructions = alert.instructions || '';

  if (type.endsWith(DRILL_SUFFIX)) return null;

  const city = (t) => t.replace('%CITY%', cityName);

  switch (type) {
    case 'missiles':              return city(T.missiles);
    case 'hostileAircraftIntrusion': return city(T.hostileAircraft);
    case 'earthQuake':            return city(T.earthquake);
    case 'terroristInfiltration': return city(T.terroristInfiltration);
    case 'tsunami':               return city(T.tsunami);
    case 'hazardousMaterials':
    case 'radiologicalEvent':     return city(T.hazmat);
    case 'newsFlash':
      return containsAny(instructions, INSTRUCTIONS_ALL_CLEAR)
        ? city(T.allClear)
        : city(T.newsFlashShelter);
    default:                      return city(T.defaultAlert);
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

const DEDUP_TTL_MS = 10 * 60 * 1000;
const sentAlerts = new Map();

function dedupKey(alert, zone) {
  return `${alert.type || ''}_${alert.instructions || ''}_${zone}`;
}

function isDuplicate(key) {
  const ts = sentAlerts.get(key);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    sentAlerts.delete(key);
    return false;
  }
  return true;
}

function markSent(key) {
  sentAlerts.set(key, Date.now());
}

// ── Telegram send with retry ──────────────────────────────────────────────────

async function sendNotification(message, label) {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
      console.log(`[INFO] Notification sent: ${label}`);
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(`[ERROR] Failed to send Telegram message (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
      if (!isLast) await sleep(attempt * 1000);
    }
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const BACKOFF_INTERVAL_MS = 5000;
const BACKOFF_THRESHOLD = 3;

let consecutiveErrors = 0;
let nextPollAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poll() {
  if (Date.now() < nextPollAt) return;

  pikudHaoref.getActiveAlerts((err, alerts) => {
    if (err) {
      const msg = err.message || String(err);
      const isMalformedJson = msg.includes('JSON') || msg.includes('SyntaxError');
      consecutiveErrors++;
      if (isMalformedJson) {
        if (consecutiveErrors >= BACKOFF_THRESHOLD) {
          console.warn(`[WARN] HFC API returned malformed JSON ${consecutiveErrors} times in a row — backing off for 5s`);
          nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
        }
      } else {
        console.error(`[ERROR] Failed to fetch alerts: ${msg}`);
        if (consecutiveErrors >= BACKOFF_THRESHOLD) {
          console.warn(`[WARN] ${consecutiveErrors} consecutive errors — backing off for 5s`);
          nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
        }
      }
      return;
    }

    consecutiveErrors = 0;
    if (!Array.isArray(alerts) || alerts.length === 0) return;

    (async () => {
      for (const alert of alerts) {
        if (!Array.isArray(alert.cities)) continue;
        for (const city of alert.cities) {
          if (!TARGET_CITIES.has(city)) continue;

          console.log('[DEBUG] Full Alert Object:', JSON.stringify(alert, null, 2));

          if ((alert.type || '').endsWith(DRILL_SUFFIX)) continue;

          const key = dedupKey(alert, city);
          if (isDuplicate(key)) continue;

          const cityName = await translateCity(city);
          const message = buildMessage(cityName, alert);
          if (!message) continue;

          markSent(key);
          sendNotification(message, `${alert.type} / ${city}`).catch((e) =>
            console.error(`[ERROR] Unexpected error in sendNotification: ${e.message}`)
          );
        }
      }
    })();
  });
}

// ── Bot commands ──────────────────────────────────────────────────────────────

async function citiesList() {
  const names = await Promise.all([...TARGET_CITIES].map((c) => translateCity(c)));
  return names.map((n) => `• ${n}`).join('\n');
}

function notifyChannel(text) {
  bot.telegram.sendMessage(CHANNEL_ID, text, { parse_mode: 'Markdown' }).catch((e) =>
    console.error(`[ERROR] Failed to notify channel: ${e.message}`)
  );
}

bot.command('cities', async (ctx) => {
  const list = await citiesList();
  ctx.reply(`${T.citiesHeader}\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.command('addcity', async (ctx) => {
  const args = ctx.message.text.replace('/addcity', '').trim();
  if (!args) return ctx.reply(T.addcityUsage);

  const incoming = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
  const added = incoming.filter((c) => !TARGET_CITIES.has(c));

  if (added.length === 0) return ctx.reply(T.addcityAlready);

  for (const city of added) TARGET_CITIES.add(city);
  saveCities();
  console.log(`[INFO] Cities added: ${added.join(', ')}`);

  const addedNames = await Promise.all(added.map((c) => translateCity(c)));
  const list = await citiesList();
  const msg = `${T.labelAdded}\n${addedNames.map((n) => `• ${n}`).join('\n')}\n\n${T.labelNowMonitoring}\n${list}`;
  ctx.reply(msg, { parse_mode: 'Markdown' });
  notifyChannel(msg);
});

bot.command('removecity', async (ctx) => {
  const args = ctx.message.text.replace('/removecity', '').trim();
  if (!args) return ctx.reply(T.removecityUsage);

  const incoming = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
  const removed = incoming.filter((c) => TARGET_CITIES.has(c));
  const notFound = incoming.filter((c) => !TARGET_CITIES.has(c));

  if (removed.length === 0) return ctx.reply(T.removecityNotFound);

  for (const city of removed) TARGET_CITIES.delete(city);

  if (TARGET_CITIES.size === 0) {
    for (const city of removed) TARGET_CITIES.add(city);
    return ctx.reply(T.removecityCannotEmpty);
  }

  saveCities();
  console.log(`[INFO] Cities removed: ${removed.join(', ')}`);

  const removedNames = await Promise.all(removed.map((c) => translateCity(c)));
  const notFoundNames = await Promise.all(notFound.map((c) => translateCity(c)));
  const list = await citiesList();

  const parts = [`${T.labelRemoved}\n${removedNames.map((n) => `• ${n}`).join('\n')}`];
  if (notFoundNames.length) parts.push(`${T.labelNotFound}\n${notFoundNames.map((n) => `• ${n}`).join('\n')}`);
  parts.push(`${T.labelNowMonitoring}\n${list}`);

  const msg = parts.join('\n\n');
  ctx.reply(msg, { parse_mode: 'Markdown' });
  notifyChannel(msg);
});

bot.command('setcities', async (ctx) => {
  const args = ctx.message.text.replace('/setcities', '').trim();
  if (!args) return ctx.reply(T.setcitiesUsage);

  const newCities = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
  if (newCities.length === 0) return ctx.reply(T.setcitiesEmpty);

  const added   = newCities.filter((c) => !TARGET_CITIES.has(c));
  const removed = [...TARGET_CITIES].filter((c) => !newCities.includes(c));

  TARGET_CITIES.clear();
  for (const city of newCities) TARGET_CITIES.add(city);
  saveCities();
  console.log(`[INFO] Cities replaced: ${[...TARGET_CITIES].join(', ')}`);

  const addedNames   = await Promise.all(added.map((c) => translateCity(c)));
  const removedNames = await Promise.all(removed.map((c) => translateCity(c)));
  const list = await citiesList();

  const parts = [];
  if (addedNames.length)   parts.push(`${T.labelAdded}\n${addedNames.map((n) => `• ${n}`).join('\n')}`);
  if (removedNames.length) parts.push(`${T.labelRemoved}\n${removedNames.map((n) => `• ${n}`).join('\n')}`);
  parts.push(`${T.labelNowMonitoring}\n${list}`);

  const msg = parts.join('\n\n');
  ctx.reply(msg, { parse_mode: 'Markdown' });
  notifyChannel(msg);
});

bot.command('status', (ctx) => {
  pikudHaoref.getActiveAlerts(async (err, alerts) => {
    if (err) {
      // Error message is dynamic — translate on the fly
      return ctx.reply(await translate(`⚠️ Failed to fetch data from Home Front Command: ${err.message}`));
    }

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return ctx.reply(T.statusAllClear);
    }

    const lines = await Promise.all(
      alerts.flatMap((alert) =>
        (alert.cities || []).map(async (city) => `• ${await translateCity(city)} (${alert.type})`)
      )
    );
    ctx.reply(`${T.statusActiveHeader}\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  });
});

// ── Entry point ───────────────────────────────────────────────────────────────

console.log('[INFO] Starting custom-israel-alerts-notifier…');
console.log(`[INFO] Monitoring cities: ${[...TARGET_CITIES].join(', ')}`);

initTranslations()
  .then(() => Promise.all([...TARGET_CITIES].map((c) => translateCity(c))))
  .then((names) => bot.telegram.sendMessage(
    CHANNEL_ID,
    `${T.startupPrefix} ${names.join(', ')}`,
    { parse_mode: 'Markdown' }
  ))
  .then(() => console.log('[INFO] Startup notification sent.'))
  .catch((err) => console.error(`[ERROR] Startup failed: ${err.message}`));

bot.launch();
setInterval(poll, POLL_INTERVAL_MS);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[INFO] ${signal} received, shutting down.`);
  try {
    await bot.telegram.sendMessage(CHANNEL_ID, T.stopped, { parse_mode: 'Markdown' });
    console.log('[INFO] Shutdown notification sent.');
  } catch (err) {
    console.error(`[ERROR] Failed to send shutdown notification: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
