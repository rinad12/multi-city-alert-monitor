'use strict';

const pikudHaoref = require('pikud-haoref-api');
const { POLL_INTERVAL_MS, BACKOFF_INTERVAL_MS, BACKOFF_THRESHOLD } = require('./config');

/**
 * Starts the Pikud HaOref alert polling loop.
 *
 * `onAlerts` is called only when the API returns a non-empty alert array.
 * It must return a Promise; errors from it are caught and logged here.
 *
 * @param {(alerts: object[]) => Promise<void>} onAlerts
 */
function start(onAlerts) {
  let consecutiveErrors = 0;
  let nextPollAt        = 0;

  function poll() {
    if (Date.now() < nextPollAt) return;

    pikudHaoref.getActiveAlerts((err, alerts) => {
      if (err) {
        const msg             = err.message || String(err);
        const isMalformedJson = msg.includes('JSON') || msg.includes('SyntaxError');
        consecutiveErrors++;

        if (isMalformedJson) {
          if (consecutiveErrors >= BACKOFF_THRESHOLD) {
            console.warn(
              `[WARN] HFC API returned malformed JSON ${consecutiveErrors}× in a row` +
              ` — backing off for ${BACKOFF_INTERVAL_MS}ms`
            );
            nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
          }
        } else {
          console.error(`[ERROR] Failed to fetch alerts: ${msg}`);
          if (consecutiveErrors >= BACKOFF_THRESHOLD) {
            console.warn(
              `[WARN] ${consecutiveErrors} consecutive errors` +
              ` — backing off for ${BACKOFF_INTERVAL_MS}ms`
            );
            nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
          }
        }
        return;
      }

      consecutiveErrors = 0;
      if (!Array.isArray(alerts) || alerts.length === 0) return;

      onAlerts(alerts).catch((e) =>
        console.error(`[ERROR] Unhandled error in alert handler: ${e.message}`)
      );
    });
  }

  setInterval(poll, POLL_INTERVAL_MS);
  console.log(`[INFO] Alert poller started (interval: ${POLL_INTERVAL_MS}ms)`);
}

module.exports = { start };
