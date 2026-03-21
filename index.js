'use strict';

require('dotenv').config();

// Suppress verbose debug logs emitted by pikud-haoref-api internals
const _origLog = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Pikud Haoref API]')) return;
  _origLog(...args);
};

const fs = require('fs');
const path = require('path');
const pikudHaoref = require('pikud-haoref-api');
const { Telegraf } = require('telegraf');

// ── Environment validation ────────────────────────────────────────────────────

const { BOT_TOKEN, CHANNEL_ID, TARGET_CITIES_HEBREW } = process.env;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('[FATAL] Missing required environment variables: BOT_TOKEN, CHANNEL_ID');
  process.exit(1);
}

// ── Persistent city list ──────────────────────────────────────────────────────
//
// cities.json stores the active city list so changes via /addcity / /removecity
// survive bot restarts. On first run it is seeded from TARGET_CITIES_HEBREW.

const CITIES_FILE = path.join(__dirname, 'cities.json');

function loadCities() {
  if (fs.existsSync(CITIES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return new Set(data);
    } catch {
      console.warn('[WARN] Failed to parse cities.json — falling back to .env');
    }
  }
  // Seed from .env on first run
  const fromEnv = (TARGET_CITIES_HEBREW || '')
    .split(',').map((c) => c.trim()).filter(Boolean);
  if (fromEnv.length === 0) {
    console.error('[FATAL] No cities configured. Set TARGET_CITIES_HEBREW in .env or use /addcity.');
    process.exit(1);
  }
  return new Set(fromEnv);
}

function saveCities() {
  fs.writeFileSync(CITIES_FILE, JSON.stringify([...TARGET_CITIES], null, 2), 'utf8');
}

const TARGET_CITIES = loadCities();
saveCities(); // ensure file always exists after startup

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
        `Здесь я не смогу отвечать на звонки до окончания инцидента. ` +
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

const POLL_INTERVAL_MS = 2000;
const BACKOFF_INTERVAL_MS = 5000;
const BACKOFF_THRESHOLD = 3;

let consecutiveErrors = 0;
let nextPollAt = 0; // epoch ms — allows skipping a cycle during backoff

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poll() {
  // Honour backoff: skip this tick if we're still in the wait window
  if (Date.now() < nextPollAt) return;

  pikudHaoref.getActiveAlerts((err, alerts) => {
    if (err) {
      const msg = err.message || String(err);
      const isMalformedJson = msg.includes('JSON') || msg.includes('SyntaxError');

      if (isMalformedJson) {
        // Truncated / malformed response from HFC servers — skip silently
        consecutiveErrors++;
        if (consecutiveErrors >= BACKOFF_THRESHOLD) {
          console.warn(`[WARN] HFC API returned malformed JSON ${consecutiveErrors} times in a row — backing off for 5s`);
          nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
        }
        return;
      }

      // Genuine network or server error — always log
      consecutiveErrors++;
      console.error(`[ERROR] Failed to fetch alerts: ${msg}`);
      if (consecutiveErrors >= BACKOFF_THRESHOLD) {
        console.warn(`[WARN] ${consecutiveErrors} consecutive errors — backing off for 5s`);
        nextPollAt = Date.now() + BACKOFF_INTERVAL_MS;
      }
      return;
    }

    // Successful response — reset error counter
    consecutiveErrors = 0;

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

// ── Bot commands ──────────────────────────────────────────────────────────────

function citiesList() {
  return [...TARGET_CITIES].map((c) => `• ${toRussian(c)}`).join('\n');
}

function notifyChannel(text) {
  bot.telegram.sendMessage(CHANNEL_ID, text, { parse_mode: 'Markdown' }).catch((e) =>
    console.error(`[ERROR] Failed to notify channel: ${e.message}`)
  );
}

// /cities — show current list
bot.command('cities', (ctx) => {
  ctx.reply(`📍 *Отслеживаемые города:*\n\n${citiesList()}`, { parse_mode: 'Markdown' });
});

// /addcity בת ים,תל אביב — add cities without removing existing
bot.command('addcity', (ctx) => {
  const args = ctx.message.text.replace('/addcity', '').trim();
  if (!args) return ctx.reply('ℹ️ Использование: /addcity בת ים,תל אביב');

  const incoming = args.split(',').map((c) => c.trim()).filter(Boolean);
  const added = incoming.filter((c) => !TARGET_CITIES.has(c));

  if (added.length === 0) {
    return ctx.reply('ℹ️ Все указанные города уже отслеживаются.');
  }

  for (const city of added) TARGET_CITIES.add(city);
  saveCities();

  console.log(`[INFO] Cities added: ${added.join(', ')}`);
  const addMsg = `➕ *Добавлены:*\n${added.map((c) => `• ${toRussian(c)}`).join('\n')}\n\n📍 *Сейчас отслеживаются:*\n${citiesList()}`;
  ctx.reply(addMsg, { parse_mode: 'Markdown' });
  notifyChannel(addMsg);
});

// /removecity בת ים,תל אביב — remove specific cities
bot.command('removecity', (ctx) => {
  const args = ctx.message.text.replace('/removecity', '').trim();
  if (!args) return ctx.reply('ℹ️ Использование: /removecity בת ים,תל אביב');

  const incoming = args.split(',').map((c) => c.trim()).filter(Boolean);
  const removed = incoming.filter((c) => TARGET_CITIES.has(c));
  const notFound = incoming.filter((c) => !TARGET_CITIES.has(c));

  if (removed.length === 0) {
    return ctx.reply('ℹ️ Ни один из указанных городов не найден в списке.');
  }

  for (const city of removed) TARGET_CITIES.delete(city);

  if (TARGET_CITIES.size === 0) {
    // Restore removed cities to avoid empty list
    for (const city of removed) TARGET_CITIES.add(city);
    return ctx.reply('⚠️ Нельзя удалить все города — список должен содержать хотя бы один.');
  }

  saveCities();
  console.log(`[INFO] Cities removed: ${removed.join(', ')}`);

  const parts = [
    `➖ *Больше не отслеживаются:*\n${removed.map((c) => `• ${toRussian(c)}`).join('\n')}`,
  ];
  if (notFound.length) parts.push(`❓ *Не найдены в списке:*\n${notFound.map((c) => `• ${c}`).join('\n')}`);
  parts.push(`📍 *Сейчас отслеживаются:*\n${citiesList()}`);

  const removeMsg = parts.join('\n\n');
  ctx.reply(removeMsg, { parse_mode: 'Markdown' });
  notifyChannel(removeMsg);
});

// /setcities בת ים,תל אביב — replace entire list
bot.command('setcities', (ctx) => {
  const args = ctx.message.text.replace('/setcities', '').trim();
  if (!args) return ctx.reply('ℹ️ Использование: /setcities בת ים,תל אביב');

  const newCities = args.split(',').map((c) => c.trim()).filter(Boolean);
  if (newCities.length === 0) return ctx.reply('⚠️ Список городов не может быть пустым.');

  const added   = newCities.filter((c) => !TARGET_CITIES.has(c));
  const removed = [...TARGET_CITIES].filter((c) => !newCities.includes(c));

  TARGET_CITIES.clear();
  for (const city of newCities) TARGET_CITIES.add(city);
  saveCities();

  console.log(`[INFO] Cities replaced: ${[...TARGET_CITIES].join(', ')}`);

  const parts = [];
  if (added.length)   parts.push(`➕ *Добавлены:*\n${added.map((c) => `• ${toRussian(c)}`).join('\n')}`);
  if (removed.length) parts.push(`➖ *Больше не отслеживаются:*\n${removed.map((c) => `• ${toRussian(c)}`).join('\n')}`);
  parts.push(`📍 *Сейчас отслеживаются:*\n${citiesList()}`);

  const setMsg = parts.join('\n\n');
  ctx.reply(setMsg, { parse_mode: 'Markdown' });
  notifyChannel(setMsg);
});

bot.command('status', (ctx) => {
  pikudHaoref.getActiveAlerts((err, alerts) => {
    if (err) {
      return ctx.reply(`⚠️ Не удалось получить данные от Пикуд ха-Орэф: ${err.message}`);
    }

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return ctx.reply('✅ Всё спокойно — активных тревог нет.');
    }

    const lines = alerts.flatMap((alert) =>
      (alert.cities || []).map((city) => `• ${toRussian(city)} (${alert.type})`)
    );

    ctx.reply(`🚨 *Активные тревоги:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  });
});

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

bot.launch();
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
