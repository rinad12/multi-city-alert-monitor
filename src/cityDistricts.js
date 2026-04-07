'use strict';

// Load the Pikud HaOref API cities list — the source of truth for what names
// the alert API actually sends (e.g. "חיפה - כרמל, הדר ועיר תחתית").
// Grouped by city prefix (part before " - ").
const orefCities = require('./data/oref_cities.json');

function normalise(s) {
  return s.toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Build grouped index ───────────────────────────────────────────────────────

// groups: Map<hebrewPrefix, GroupEntry>
// GroupEntry = { he, en, ru, en_lc, ru_lc, he_lc, members: MemberEntry[] }
// MemberEntry = { name(he), en, ru, en_lc, ru_lc, he_lc }
const groups = new Map();

// Flat lookup: hebrewName → { en, ru }  (both prefixes AND full district names)
const nameLookup = new Map();

for (const city of orefCities) {
  const name = city.name;
  if (!name || name === 'בחר הכל') continue;   // skip "Select all" sentinel

  const en = city.en || name;
  const ru = city.ru || name;

  nameLookup.set(name, { en, ru });

  const sepIdx   = name.indexOf(' - ');
  const prefix   = sepIdx !== -1 ? name.slice(0, sepIdx) : name;

  // Derive a clean city-level label by stripping the district suffix from the
  // first localized name seen for this prefix.
  const prefixEn = en.includes(' - ') ? en.slice(0, en.indexOf(' - ')) : en;
  const prefixRu = ru.includes(' - ') ? ru.slice(0, ru.indexOf(' - ')) : ru;

  if (!groups.has(prefix)) {
    groups.set(prefix, {
      he:    prefix,
      en:    prefixEn,
      ru:    prefixRu,
      en_lc: normalise(prefixEn),
      ru_lc: normalise(prefixRu),
      he_lc: normalise(prefix),
      members: [],
    });
    // Register the bare prefix in the name lookup so getLocalizedName can
    // resolve it (e.g. when the user stored "חיפה" as "All of Haifa").
    nameLookup.set(prefix, { en: prefixEn, ru: prefixRu });
  }

  // Only add as a distinct member when the city really has a district suffix.
  if (sepIdx !== -1) {
    groups.get(prefix).members.push({
      name,
      en,
      ru,
      en_lc: normalise(en),
      ru_lc: normalise(ru),
      he_lc: normalise(name),
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Searches for city/district groups matching `query`.
 *
 * Each result:
 *   { prefix: string, label: string, districts: Array<{hebrew, label}> }
 *
 * `districts` is empty  → single city, no sub-areas (add directly).
 * `districts` is non-empty → offer "All of <city>" + each individual district.
 */
function searchCities(query, lang, limit = 10) {
  if (!query || !query.trim()) return [];

  const q       = normalise(query);
  const dispKey = lang === 'ru' ? 'ru' : lang === 'he' ? 'he' : 'en';
  const results = [];

  for (const [, g] of groups) {
    const matched =
      g.en_lc.includes(q) ||
      g.ru_lc.includes(q) ||
      g.he_lc.includes(q) ||
      g.members.some((m) => m.en_lc.includes(q) || m.ru_lc.includes(q) || m.he_lc.includes(q));

    if (!matched) continue;

    results.push({
      prefix:    g.he,
      label:     dispKey === 'he' ? g.he : g[dispKey],
      districts: g.members.map((m) => ({
        hebrew: m.name,
        label:  dispKey === 'he' ? m.name : m[dispKey],
      })),
    });

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Returns the localised display name for a Hebrew city or district name as
 * stored by /addcity.  Returns `null` if the name is not in this module's
 * lookup — callers should then fall back to alert_zones.json.
 */
function getLocalisedCityName(hebrewName, lang) {
  const entry = nameLookup.get(hebrewName);
  if (!entry) return null;
  if (lang === 'he') return hebrewName;
  return lang === 'ru' ? entry.ru : entry.en;
}

module.exports = { searchCities, getLocalisedCityName };
