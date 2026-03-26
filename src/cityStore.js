'use strict';

const fs   = require('fs');
const path = require('path');
const config = require('./config');

const CITIES_FILE = config.CITIES_FILE_PATH
  ? path.resolve(config.CITIES_FILE_PATH)
  : path.join(__dirname, '..', 'cities.json');

const cities = new Set();

// ── Persistence ───────────────────────────────────────────────────────────────

function save() {
  try {
    fs.writeFileSync(CITIES_FILE, JSON.stringify([...cities], null, 2), 'utf8');
  } catch (err) {
    console.error(`[ERROR] Failed to write cities.json: ${err.message}`);
  }
}

function load() {
  if (fs.existsSync(CITIES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        for (const c of data) cities.add(c);
        return;
      }
    } catch {
      console.warn('[WARN] Failed to parse cities.json — falling back to .env');
    }
  }

  const fromEnv = config.TARGET_CITIES_HEBREW
    .split(',').map((c) => c.trim()).filter(Boolean);

  if (fromEnv.length === 0) {
    console.error('[FATAL] No cities configured. Set TARGET_CITIES_HEBREW in .env or use /addcity.');
    process.exit(1);
  }

  for (const c of fromEnv) cities.add(c);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the live Set of Hebrew city names (read-only by convention). */
function getAll() { return cities; }

/** Number of currently monitored cities. */
function size() { return cities.size; }

/** Adds one or more cities and persists. */
function add(citiesToAdd) {
  const arr = Array.isArray(citiesToAdd) ? citiesToAdd : [citiesToAdd];
  for (const c of arr) cities.add(c);
  save();
}

/**
 * Removes `citiesToRemove` and persists.
 * Returns `false` (without any change) if the removal would empty the list.
 */
function remove(citiesToRemove) {
  const arr = Array.isArray(citiesToRemove) ? citiesToRemove : [citiesToRemove];
  const next = new Set([...cities].filter((c) => !arr.includes(c)));
  if (next.size === 0) return false;
  cities.clear();
  for (const c of next) cities.add(c);
  save();
  return true;
}

/** Replaces the entire list and persists. */
function replace(newCities) {
  cities.clear();
  for (const c of newCities) cities.add(c);
  save();
}

// Initialise on first require and ensure cities.json exists.
load();
save();

module.exports = { getAll, size, add, remove, replace };
