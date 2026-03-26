'use strict';

const { DEDUP_TTL_MS } = require('./config');

// Tracks recently sent alerts: key → timestamp.
// Prevents duplicate notifications for the same incident within the TTL window.
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

module.exports = { dedupKey, isDuplicate, markSent };
