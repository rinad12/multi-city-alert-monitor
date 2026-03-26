'use strict';

const DRILL_SUFFIX = 'Drill';

// Hebrew keywords in `alert.instructions` that indicate the all-clear phase.
const INSTRUCTIONS_ALL_CLEAR = ['ניתן לצאת', 'הסתיים'];

function containsAny(text, keywords) {
  if (!text) return false;
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Builds the Telegram notification text for an alert.
 *
 * @param {string} cityName  - City name already translated to TARGET_LANG.
 * @param {object} alert     - Raw alert object from pikud-haoref-api.
 * @param {object} T         - Pre-translated strings object from strings.js.
 * @returns {string|null}    - Message text, or null if the alert should be skipped.
 */
function buildMessage(cityName, alert, T) {
  const type         = alert.type         || 'unknown';
  const instructions = alert.instructions || '';

  // Drills are silently skipped.
  if (type.endsWith(DRILL_SUFFIX)) return null;

  // Substitute the runtime city name into the pre-translated template.
  const city = (template) => template.replace('%CITY%', cityName);

  switch (type) {
    case 'missiles':                 return city(T.missiles);
    case 'hostileAircraftIntrusion': return city(T.hostileAircraft);
    case 'earthQuake':               return city(T.earthquake);
    case 'terroristInfiltration':    return city(T.terroristInfiltration);
    case 'tsunami':                  return city(T.tsunami);
    case 'hazardousMaterials':
    case 'radiologicalEvent':        return city(T.hazmat);
    case 'newsFlash':
      return containsAny(instructions, INSTRUCTIONS_ALL_CLEAR)
        ? city(T.allClear)
        : city(T.newsFlashShelter);
    default:
      return city(T.defaultAlert);
  }
}

module.exports = { buildMessage, DRILL_SUFFIX };
