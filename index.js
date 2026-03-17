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
  'רמלה': 'Рамла',
  'מזכרת בתיה': 'Мазкерет-Батья',
  'גן יבנה': 'Ган-Явне',
  'אשקלון': 'Ашкелон',
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

/**
 * Returns a Russian name for a Hebrew city, falling back to the original
 * Hebrew name if no mapping exists.
 */
function toRussian(hebrewCity) {
  return CITY_MAP[hebrewCity] || hebrewCity;
}

// ── Message formatting ────────────────────────────────────────────────────────

function buildMessage(cityHebrew) {
  const cityRu = toRussian(cityHebrew);
  return (
    `🚨 *ТРЕВОГА: ${cityRu}* 🚨\n\n` +
    `Это сообщение отправлено автоматически, так как в этом районе сработала сирена. ` +
    `Пожалуйста, не волнуйтесь, я следую инструкциям безопасности и нахожусь в защищённом пространстве.`
  );
}

// ── Deduplication ─────────────────────────────────────────────────────────────
//
// Key: Hebrew zone string → timestamp of first notification.
// Pruned after DEDUP_TTL_MS so a new alert later in the day is not dropped.

const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const sentAlerts = new Map();

function isDuplicate(zone) {
  const ts = sentAlerts.get(zone);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    sentAlerts.delete(zone);
    return false;
  }
  return true;
}

function markSent(zone) {
  sentAlerts.set(zone, Date.now());
}

// ── Telegram send with retry ──────────────────────────────────────────────────

async function sendNotification(cityHebrew) {
  const message = buildMessage(cityHebrew);
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
      console.log(`[INFO] Notification sent for zone: ${cityHebrew}`);
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
// pikud-haoref-api exports getActiveRocketAlertZones(callback).
// Callback receives (err, alertZones) where alertZones is a plain string[]
// of Hebrew zone names, e.g. ["בת ים", "חיפה 75"].
// Empty array = no active alerts.

const POLL_INTERVAL_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poll() {
  pikudHaoref.getActiveRocketAlertZones((err, alertZones) => {
    if (err) {
      console.error(`[ERROR] Failed to fetch alerts: ${err.message || err}`);
      return;
    }

    if (!Array.isArray(alertZones) || alertZones.length === 0) return;

    for (const zone of alertZones) {
      if (!TARGET_CITIES.has(zone)) continue;
      if (isDuplicate(zone)) continue;

      markSent(zone);

      sendNotification(zone).catch((e) =>
        console.error(`[ERROR] Unexpected error in sendNotification: ${e.message}`)
      );
    }
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

console.log('[INFO] Starting custom-israel-alerts-notifier…');
console.log(`[INFO] Monitoring cities: ${[...TARGET_CITIES].join(', ')}`);

setInterval(poll, POLL_INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[INFO] Shutting down gracefully.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[INFO] SIGTERM received, shutting down.');
  process.exit(0);
});
