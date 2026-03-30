'use strict';

require('dotenv').config();

// config.js must be the first project module required — it patches console.log
// to suppress pikud-haoref-api noise and validates required env variables.
const config = require('./src/config');

const bot            = require('./src/bot');
const cityStore      = require('./src/cityStore');
const poller         = require('./src/alertPoller');
const { buildMessage, DRILL_SUFFIX } = require('./src/alertMessages');
const { dedupKey, isDuplicate, markSent } = require('./src/dedup');
const { sendNotification }           = require('./src/notifier');
const { T, initTranslations }        = require('./src/strings');
const { registerCommands }           = require('./src/commands');
const { getLocalizedName, translateCity } = require('./src/cityHelpers');

// ── Global error handlers ─────────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

bot.catch((err, ctx) => {
  console.error(`[ERROR] Unhandled bot error (${ctx.updateType}): ${err.message}`);
});

// ── Alert handler ─────────────────────────────────────────────────────────────

async function onAlerts(alerts) {
  for (const alert of alerts) {
    if (!Array.isArray(alert.cities)) continue;

    for (const city of alert.cities) {
      if (!cityStore.getAll().has(city)) continue;
      if ((alert.type || '').endsWith(DRILL_SUFFIX)) continue;

      if (config.DEBUG) {
        console.log('[DEBUG] Alert:', JSON.stringify(alert, null, 2));
      }

      const key = dedupKey(alert, city);
      if (isDuplicate(key)) continue;

      // getLocalizedName is synchronous — no await needed.
      const cityName = getLocalizedName(city);
      const message  = buildMessage(cityName, alert, T);
      if (!message) continue;

      markSent(key);
      sendNotification(message, `${alert.type} / ${city}`);
    }
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[INFO] ${signal} received, shutting down.`);
  try {
    await bot.telegram.sendMessage(config.CHANNEL_ID, T.stopped, { parse_mode: 'Markdown' });
    console.log('[INFO] Shutdown notification sent.');
  } catch (err) {
    console.error(`[ERROR] Failed to send shutdown notification: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Startup ───────────────────────────────────────────────────────────────────

console.log('[INFO] Starting custom-israel-alerts-notifier…');
console.log(`[INFO] Monitoring cities: ${[...cityStore.getAll()].join(', ')}`);

registerCommands();

// initTranslations() is synchronous but returns a Promise for API consistency.
initTranslations()
  .then(() => {
    const cityNames = [...cityStore.getAll()].map((c) => getLocalizedName(c)).join(', ');

    bot.launch();
    poller.start(onAlerts);

    return bot.telegram.sendMessage(
      config.CHANNEL_ID,
      `${T.startupPrefix} ${cityNames}`,
      { parse_mode: 'Markdown' }
    );
  })
  .then(() => console.log('[INFO] Startup notification sent.'))
  .catch((err) => console.error(`[ERROR] Startup failed: ${err.message}`));
