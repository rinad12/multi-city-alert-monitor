'use strict';

// Suppress verbose debug logs emitted by pikud-haoref-api internals.
// Applied here (before the library is first required) as a side-effect of loading config.
const _origLog = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Pikud Haoref API]')) return;
  _origLog(...args);
};

const {
  BOT_TOKEN,
  CHANNEL_ID,
  TARGET_CITIES_HEBREW = '',
  // LibreTranslate
  TARGET_LANG          = 'en',
  LIBRE_TRANSLATE_URL  = 'http://localhost:5000',
  LIBRE_TRANSLATE_KEY  = '',
  // Paths
  CITIES_FILE_PATH,
  // Tunable constants (all have sensible defaults)
  POLL_INTERVAL_MS:    _POLL      = '2000',
  BACKOFF_INTERVAL_MS: _BACKOFF   = '5000',
  BACKOFF_THRESHOLD:   _THRESHOLD = '3',
  DEDUP_TTL_MS:        _TTL       = '600000',
  SEND_MAX_RETRIES:    _RETRIES   = '3',
  DEBUG:               _DEBUG     = 'false',
} = process.env;

if (!BOT_TOKEN) {
  console.error('[FATAL] Missing required environment variable: BOT_TOKEN');
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error('[FATAL] Missing required environment variable: CHANNEL_ID');
  process.exit(1);
}

module.exports = Object.freeze({
  BOT_TOKEN,
  CHANNEL_ID,
  TARGET_CITIES_HEBREW,
  TARGET_LANG:         TARGET_LANG.toLowerCase(),
  LIBRE_TRANSLATE_URL,
  LIBRE_TRANSLATE_KEY,
  CITIES_FILE_PATH,
  POLL_INTERVAL_MS:    parseInt(_POLL,      10),
  BACKOFF_INTERVAL_MS: parseInt(_BACKOFF,   10),
  BACKOFF_THRESHOLD:   parseInt(_THRESHOLD, 10),
  DEDUP_TTL_MS:        parseInt(_TTL,       10),
  SEND_MAX_RETRIES:    parseInt(_RETRIES,   10),
  DEBUG:               _DEBUG === 'true',
});
