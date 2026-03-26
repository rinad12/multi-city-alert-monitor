'use strict';

const http = require('http');
const https = require('https');

const TARGET_LANG = (process.env.TARGET_LANG || 'ru').toLowerCase();
const LIBRE_TRANSLATE_URL = process.env.LIBRE_TRANSLATE_URL || 'http://localhost:5000';
const LIBRE_TRANSLATE_KEY = process.env.LIBRE_TRANSLATE_KEY || '';

// Messages are authored in English.
const SOURCE_LANG = 'en';

/**
 * Translates `text` from `sourceLang` (default: 'en') to TARGET_LANG via LibreTranslate.
 * Returns the original text unchanged when:
 *   - TARGET_LANG === sourceLang (no-op)
 *   - LibreTranslate is unreachable or returns an error (graceful fallback)
 */
async function translate(text, sourceLang = SOURCE_LANG, targetLang = TARGET_LANG) {
  if (targetLang === sourceLang) return text;

  const body = JSON.stringify({
    q: text,
    source: sourceLang,
    target: targetLang,
    format: 'text',
    ...(LIBRE_TRANSLATE_KEY && { api_key: LIBRE_TRANSLATE_KEY }),
  });

  return new Promise((resolve) => {
    let url;
    try {
      url = new URL('/translate', LIBRE_TRANSLATE_URL);
    } catch (e) {
      console.warn('[WARN] LibreTranslate: invalid LIBRE_TRANSLATE_URL —', e.message);
      return resolve(text);
    }

    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.translatedText) {
            resolve(json.translatedText);
          } else {
            console.warn('[WARN] LibreTranslate: unexpected response:', data.slice(0, 200));
            resolve(text);
          }
        } catch (e) {
          console.warn('[WARN] LibreTranslate: failed to parse response —', e.message);
          resolve(text);
        }
      });
    });

    req.setTimeout(5000, () => {
      console.warn('[WARN] LibreTranslate: request timed out — falling back to Russian');
      req.destroy();
      resolve(text);
    });

    req.on('error', (e) => {
      console.warn('[WARN] LibreTranslate: request error —', e.message);
      resolve(text);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { translate, TARGET_LANG };
