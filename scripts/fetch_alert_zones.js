#!/usr/bin/env node
'use strict';

/**
 * fetch_alert_zones.js
 *
 * Fetches the official Pikud HaOref city/zone list in Hebrew, English, and
 * Russian, then merges them by the shared numeric key `value` into a single
 * mapping keyed by Hebrew label.
 *
 * Output: src/data/alert_zones.json
 * Schema: { "<Hebrew label>": { "en": "...", "ru": "..." }, … }
 *
 * Usage:
 *   node scripts/fetch_alert_zones.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'alert_zones.json');
const BASE_URL    = 'https://alerts-history.oref.org.il/Shared/Ajax/GetCities.aspx';

// Browser-like headers to pass the Oref WAF.
const REQUEST_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer':         'https://www.oref.org.il/',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7,ru;q=0.6',
};

/**
 * Fetches and parses the city list for one language code.
 * API response schema: Array<{ label: string, value: string, id: string, areaid: number, ... }>
 * The `value` field is the shared numeric ID (as a string) used for cross-language matching.
 *
 * @param {'he'|'en'|'ru'} lang
 * @returns {Promise<Array<{label: string, value: string}>>}
 */
function fetchLang(lang) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}?lang=${lang}`;
    console.log(`[INFO] Fetching ${lang.toUpperCase()} city list…`);

    const req = https.get(url, { headers: REQUEST_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for lang=${lang}`));
      }

      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          // Strip BOM (\uFEFF) that some responses include.
          const clean = raw.replace(/^\uFEFF/, '').trim();
          const data  = JSON.parse(clean);

          if (!Array.isArray(data)) {
            return reject(new Error(`Unexpected response shape for lang=${lang}: ${clean.slice(0, 120)}`));
          }

          console.log(`[INFO] ${lang.toUpperCase()}: received ${data.length} entries.`);
          resolve(data);
        } catch (e) {
          reject(new Error(`JSON parse error (lang=${lang}): ${e.message} — raw: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.setTimeout(15_000, () => {
      req.destroy(new Error(`Request timed out for lang=${lang}`));
    });

    req.on('error', reject);
  });
}

async function main() {
  // ── Fetch all three languages in parallel (EN/RU failure is non-fatal) ──────
  const [heResult, enResult, ruResult] = await Promise.allSettled([
    fetchLang('he'),
    fetchLang('en'),
    fetchLang('ru'),
  ]);

  if (heResult.status === 'rejected') {
    console.error(`[ERROR] Failed to fetch Hebrew list (required): ${heResult.reason.message}`);
    process.exit(1);
  }

  const heData = heResult.value;
  const enData = enResult.status === 'fulfilled' ? enResult.value : null;
  const ruData = ruResult.status === 'fulfilled' ? ruResult.value : null;

  if (!enData) console.warn(`[WARN] EN list unavailable (${enResult.reason.message}) — falling back to Hebrew.`);
  if (!ruData) console.warn(`[WARN] RU list unavailable (${ruResult.reason.message}) — falling back to Hebrew.`);

  // ── Build id → label maps for EN and RU ───────────────────────────────────
  // `value` is the shared numeric ID (stored as string in the API response).
  const enById = enData ? new Map(enData.map((item) => [item.value, item.label])) : new Map();
  const ruById = ruData ? new Map(ruData.map((item) => [item.value, item.label])) : new Map();

  // ── Merge using Hebrew list as the canonical source ────────────────────────
  const alertZones = {};
  let   missingEn  = 0;
  let   missingRu  = 0;

  for (const heItem of heData) {
    const { value: id, label: hebrewName } = heItem;

    if (!hebrewName || typeof hebrewName !== 'string') continue;

    const en = enById.get(id);
    const ru = ruById.get(id);

    if (!en) missingEn++;
    if (!ru) missingRu++;

    // Fall back to Hebrew if a localised form is missing for a given language.
    alertZones[hebrewName] = {
      en: en || hebrewName,
      ru: ru || hebrewName,
    };
  }

  // ── Write output ───────────────────────────────────────────────────────────
  const json = JSON.stringify(alertZones, null, 2);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, json, 'utf8');

  console.log(`\n[INFO] Done.`);
  console.log(`[INFO] Total zones written : ${Object.keys(alertZones).length}`);
  if (missingEn) console.warn(`[WARN] Zones without English name : ${missingEn} (fell back to Hebrew)`);
  if (missingRu) console.warn(`[WARN] Zones without Russian name : ${missingRu} (fell back to Hebrew)`);
  console.log(`[INFO] Output written to   : ${OUTPUT_PATH}`);
}

main();