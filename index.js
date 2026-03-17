'use strict';

require('dotenv').config();

const pikudHaoref = require('pikud-haoref-api');
const { Telegraf } = require('telegraf');

// ── Environment validation ────────────────────────────────────────────────────

const { BOT_TOKEN, CHANNEL_ID, TARGET_CITIES_HEBREW } = process.env;

if (!BOT_TOKEN || !CHANNEL_ID || !TARGET_CITIES_HEBREW) {
  console.error(
    '[FATAL] Missing required environment variables: BOT_TOKEN, CHANNEL_ID, TARGET_CITIES_HEBREW'
  );
  process.exit(1);
}

const TARGET_CITIES = new Set(
  TARGET_CITIES_HEBREW.split(',').map((c) => c.trim()).filter(Boolean)
);

if (TARGET_CITIES.size === 0) {
  console.error('[FATAL] TARGET_CITIES_HEBREW must contain at least one city name.');
  process.exit(1);
}

// ── Telegram bot ──────────────────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);

// ── Hebrew → Russian city name mapping ───────────────────────────────────────

const CITY_MAP = {
  'תל אביב - יפו': 'Тель-Авив — Яффо',
  'תל אביב': 'Тель-Авив',
  'ירושלים': 'Иерусалим',
  'חיפה': 'Хайфа',
  'באר שבע': 'Беэр-Шева',
  'נתניה': 'Нетания',
  'אשדוד': 'Ашдод',
  'אשקלון': 'Ашкелон',
  'רחובות': 'Реховот',
  'בת ים': 'Бат-Ям',
  'הרצליה': 'Герцлия',
  'כפר סבא': 'Кфар-Саба',
  'פתח תקווה': 'Петах-Тиква',
  'ראשון לציון': 'Ришон-ле-Цион',
  'נס ציונה': 'Нес-Циона',
  'לוד': 'Лод',
  'רמלה': 'Рамла',
  'עכו': 'Акко',
  'נהריה': 'Нагария',
  'עפולה': 'Афула',
  'טבריה': 'Тверия',
  'צפת': 'Цфат',
  'קריית שמונה': 'Кирьят-Шмона',
  'מודיעין-מכבים-רעות': 'Модиин-Маккабим-Реут',
  'מודיעין': 'Модиин',
  'אילת': 'Эйлат',
  'דימונה': 'Димона',
  'ערד': 'Арад',
  'קריית גת': 'Кирьят-Гат',
  'קריית ביאליק': 'Кирьят-Биалик',
  'קריית מוצקין': 'Кирьят-Моцкин',
  'קריית ים': 'Кирьят-Ям',
  'קריית אתא': 'Кирьят-Ата',
  'קריית אונו': 'Кирьят-Оно',
  'גבעתיים': 'Гиватаим',
  'בני ברק': 'Бней-Брак',
  'רמת גן': 'Рамат-Ган',
  'גבעת שמואל': 'Гиват-Шмуэль',
  'אור יהודה': 'Ор-Иехуда',
  'יהוד-מונוסון': 'Иегуд-Монасон',
  'חדרה': 'Хадера',
  'זכרון יעקב': 'Зихрон-Яаков',
  'רעננה': 'Раанана',
  'הוד השרון': 'Ход-ха-Шарон',
  'רמת השרון': 'Рамат-ха-Шарон',
  'כפר יונה': 'Кфар-Йона',
  'טירת כרמל': 'Тират-Кармель',
  'יקנעם עילית': 'Йокнеам-Иллит',
  'מגדל העמק': 'Мигдаль-ха-Эмек',
  'נצרת': 'Назарет',
  'נוף הגליל': 'Ноф-ха-Галиль',
  'שדרות': 'Сдерот',
  'ניר עם': 'Нир-Ам',
  'כפר עזה': 'Кфар-Аза',
  'בארי': 'Беэри',
  'נחל עוז': 'Нахаль-Оз',
  'גן יבנה': 'Ган-Явне',
  'יבנה': 'Явне',
  'גדרה': 'Гедера',
  'מזכרת בתיה': 'Мазкерет-Батья',
  'קרית מלאכי': 'Кирьят-Малахи',
  'ספיר': 'Сапир',
  'מעלה אדומים': 'Маале-Адумим',
  'בית שמש': 'Бейт-Шемеш',
  'ביתר עילית': 'Битар-Иллит',
  'אלעד': 'Эльад',
  'כפר קאסם': 'Кфар-Касем',
  'טייבה': 'Тайбе',
  'טירה': 'Тира',
  'קלנסווה': 'Кальансауа',
  'רהט': 'Рахат',
  'ירוחם': 'Йерухам',
  'מצפה רמון': 'Мицпе-Рамон',
  'שלומי': 'Шломи',
  'מטולה': 'Метула',
  'כיסופים': 'Кисуфим',
  'ניר עוז': 'Нир-Оз',
  'רעים': 'Реим',
  'נתיב העשרה': 'Натив-ха-Асара',
  'זיקים': 'Зиким',
  'אשכול': 'Эшколь',
  'חוף אשקלון': 'Побережье Ашкелона',
};

function toRussian(hebrewCity) {
  return CITY_MAP[hebrewCity] || hebrewCity;
}

// ── Alert type → Russian message ──────────────────────────────────────────────

// Alert types ending in "Drill" are silently skipped.
const DRILL_SUFFIX = 'Drill';

// Keywords in `alert.instructions` that signal newsFlash phase.
const INSTRUCTIONS_ALL_CLEAR = ['ניתן לצאת', 'הסתיים'];

function containsAny(text, keywords) {
  if (!text) return false;
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Builds a Russian Telegram message based on alert type and instructions.
 * Returns null for drill alerts (caller should skip).
 */
function buildMessage(cityHebrew, alert) {
  const cityRu = toRussian(cityHebrew);
  const type = alert.type || 'unknown';
  const instructions = alert.instructions || '';

  // Skip drills silently
  if (type.endsWith(DRILL_SUFFIX)) return null;

  switch (type) {
    case 'missiles':
      return (
        `🚀 *РАКЕТНЫЙ ОБСТРЕЛ: ${cityRu}* 🚨\n\n` +
        `Пожалуйста, не волнуйтесь: сработала сирена, и я уже в безопасном месте. ` +
        `Здесь я не смогу отвечать на звонки до окончания инцидента. ` +
        `Всё под контролем, напишу сразу, как выйду!`
      );

    case 'hostileAircraftIntrusion':
      return (
        `✈️ *ВОЗДУШНАЯ УГРОЗА: ${cityRu}* 🚨\n\n` +
        `В небе замечен подозрительный объект. Я уже в защищённом пространстве, здесь безопасно. ` +
        `Просто следую протоколу безопасности и жду отбоя.`
      );

    case 'earthQuake':
      return (
        `🫨 *ЗЕМЛЕТРЯСЕНИЕ: ${cityRu}* 🚨\n\n` +
        `Зафиксированы подземные толчки. Я вышел на открытое пространство, как того требует инструкция. ` +
        `Со мной всё хорошо, не переживайте!`
      );

    case 'terroristInfiltration':
      return (
        `🪖 *БЕЗОПАСНОСТЬ: ${cityRu}* 🚨\n\n` +
        `Подозрение на проникновение в район. Я дома, двери заперты, всё в порядке. ` +
        `Нахожусь в защищённой комнате и следую указаниям.`
      );

    case 'tsunami':
      return (
        `🌊 *УГРОЗА ЦУНАМИ: ${cityRu}* 🚨\n\n` +
        `Поступило предупреждение о цунами. Я отошёл от береговой линии на безопасное расстояние. ` +
        `Всё под контролем.`
      );

    case 'hazardousMaterials':
    case 'radiologicalEvent':
      return (
        `⚠️ *ТЕХНОГЕННАЯ ОПАСНОСТЬ: ${cityRu}* 🚨\n\n` +
        `Сообщается об утечке опасных веществ. Я плотно закрыл окна и нахожусь в помещении. ` +
        `Со мной всё в порядке, просто меры предосторожности.`
      );

    case 'newsFlash':
      if (containsAny(instructions, INSTRUCTIONS_ALL_CLEAR)) {
        return (
          `✅ *ОТБОЙ / МОЖНО ВЫХОДИТЬ: ${cityRu}* ✅\n\n` +
          `Служба тыла подтвердила окончание инцидента. Можно выходить из убежища. 😊`
        );
      }
      // Default newsFlash (shelter / take cover)
      return (
        `🔔 *УВЕДОМЛЕНИЕ: ${cityRu}* 🔔\n\n` +
        `Поступило указание быть рядом с защищённым пространством. ` +
        `Я уже рядом, всё в порядке, просто меры предосторожности.`
      );

    default:
      return (
        `🚨 *ТРЕВОГА: ${cityRu}* 🚨\n\n` +
        `Это сообщение отправлено автоматически — в районе сработала сирена. ` +
        `Я следую инструкциям безопасности и нахожусь в защищённом пространстве.`
      );
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────
//
// Key: `${type}_${instructions}_${zone}` — ensures each distinct phase of an
// incident (e.g., alert → all-clear) sends its own notification.
// Entries are pruned after DEDUP_TTL_MS.

const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
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

// ── Telegram send with retry ──────────────────────────────────────────────────

async function sendNotification(message, label) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
      console.log(`[INFO] Notification sent: ${label}`);
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[ERROR] Failed to send Telegram message (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`
      );
      if (!isLast) await sleep(attempt * 1000);
    }
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
//
// getActiveAlerts(callback) → callback(err, alerts[])
// Each alert: { type, cities, instructions, id }
// Empty array = no active alerts.

const POLL_INTERVAL_MS = 1000;

// Rate-limit identical error messages to once per 60 seconds so the console
// doesn't flood when the API repeatedly returns malformed history JSON.
const ERROR_LOG_INTERVAL_MS = 60 * 1000;
let lastErrorMessage = null;
let lastErrorTimestamp = 0;

function logError(message) {
  const now = Date.now();
  if (message === lastErrorMessage && now - lastErrorTimestamp < ERROR_LOG_INTERVAL_MS) return;
  lastErrorMessage = message;
  lastErrorTimestamp = now;
  console.error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poll() {
  pikudHaoref.getActiveAlerts((err, alerts) => {
    if (err) {
      logError(`[ERROR] Failed to fetch alerts: ${err.message || err}`);
      return;
    }

    if (!Array.isArray(alerts) || alerts.length === 0) return;

    for (const alert of alerts) {
      if (!Array.isArray(alert.cities)) continue;

      for (const city of alert.cities) {
        if (!TARGET_CITIES.has(city)) continue;

        // Only log when this alert concerns one of our target cities
        console.log('[DEBUG] Full Alert Object:', JSON.stringify(alert, null, 2));

        // Skip drills silently
        if ((alert.type || '').endsWith(DRILL_SUFFIX)) continue;

        const key = dedupKey(alert, city);
        if (isDuplicate(key)) continue;

        const message = buildMessage(city, alert);
        if (!message) continue;

        markSent(key);

        sendNotification(message, `${alert.type} / ${city}`).catch((e) =>
          console.error(`[ERROR] Unexpected error in sendNotification: ${e.message}`)
        );
      }
    }
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

const citiesRu = [...TARGET_CITIES].map((c) => toRussian(c)).join(', ');

console.log('[INFO] Starting custom-israel-alerts-notifier…');
console.log(`[INFO] Monitoring cities: ${[...TARGET_CITIES].join(', ')}`);

bot.telegram
  .sendMessage(
    CHANNEL_ID,
    `✅ *Бот запущен и работает*\n\nОтслеживаемые города: ${citiesRu}`,
    { parse_mode: 'Markdown' }
  )
  .then(() => console.log('[INFO] Startup notification sent.'))
  .catch((err) => console.error(`[ERROR] Failed to send startup notification: ${err.message}`));

setInterval(poll, POLL_INTERVAL_MS);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[INFO] ${signal} received, shutting down.`);
  try {
    await bot.telegram.sendMessage(CHANNEL_ID, '🔴 *Бот остановлен*', { parse_mode: 'Markdown' });
    console.log('[INFO] Shutdown notification sent.');
  } catch (err) {
    console.error(`[ERROR] Failed to send shutdown notification: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
