'use strict';

const bot            = require('./bot');
const { CHANNEL_ID, SEND_MAX_RETRIES } = require('./config');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends `message` to CHANNEL_ID with retry on failure.
 * Uses linear back-off (1 s, 2 s, … per attempt).
 * Logs a final error if all attempts are exhausted (message is dropped).
 *
 * @returns {Promise<boolean>} true if sent, false if permanently dropped.
 */
async function sendNotification(message, label) {
  for (let attempt = 1; attempt <= SEND_MAX_RETRIES; attempt++) {
    try {
      await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
      console.log(`[INFO] Notification sent: ${label}`);
      return true;
    } catch (err) {
      console.error(
        `[ERROR] Failed to send message (attempt ${attempt}/${SEND_MAX_RETRIES}): ${err.message}`
      );
      if (attempt < SEND_MAX_RETRIES) await sleep(attempt * 1000);
    }
  }

  console.error(`[ERROR] Notification permanently dropped after ${SEND_MAX_RETRIES} attempts: ${label}`);
  return false;
}

/**
 * Fire-and-forget channel message. Failure is non-fatal and only logged.
 * Do not rely on this for delivery guarantees.
 */
function notifyChannel(text) {
  bot.telegram
    .sendMessage(CHANNEL_ID, text, { parse_mode: 'Markdown' })
    .catch((e) => console.error(`[ERROR] Failed to notify channel: ${e.message}`));
}

module.exports = { sendNotification, notifyChannel };
