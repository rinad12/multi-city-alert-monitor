'use strict';

const { Markup }   = require('telegraf');
const pikudHaoref  = require('pikud-haoref-api');
const bot          = require('./bot');
const cityStore    = require('./cityStore');
const { getT, citiesList }         = require('./strings');
const { getLocalizedName }         = require('./cityHelpers');
const { notifyChannel }            = require('./notifier');
const { getUserLang, setUserLang } = require('./userStore');
const { searchCities }             = require('./cityDistricts');

// ── Per-user session store ─────────────────────────────────────────────────────
//
// Session shapes:
//   { type: 'add',      results: [{hebrew, label}] }
//   { type: 'remove',   results: [{hebrew, label}] }
//   { type: 'setcities', step: 'awaiting_query'|'selecting',
//                         collected: [{hebrew, label}],
//                         searchResults: [{hebrew, label}] | null }
//
const sessions = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────────

function getArgs(ctx) {
  return ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
}

/** Splits an array into rows of `size` for Telegraf's inlineKeyboard(). */
function chunk(arr, size) {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

/** Shared: add a city after confirmation/selection in the /addcity flow. */
async function commitAddCity(ctx, hebrew, label, lang) {
  const T = getT(lang);
  sessions.delete(ctx.from.id);

  if (cityStore.getAll().has(hebrew)) {
    await ctx.answerCbQuery();
    return ctx.editMessageText(
      T.cityAlreadyMonitored.replace('%CITY%', label),
      { parse_mode: 'Markdown' }
    );
  }

  cityStore.add(hebrew);
  const list = await citiesList(cityStore.getAll(), (h) => getLocalizedName(h, lang));
  const msg  = `${T.cityAdded.replace('%CITY%', label)}\n\n${T.labelNowMonitoring}\n${list}`;

  await ctx.answerCbQuery();
  ctx.editMessageText(msg, { parse_mode: 'Markdown' });
  notifyChannel(msg);
}

/**
 * Appends a city to an active /setcities session and edits the bot message to
 * show the running list + a Done button.
 */
async function commitSetcitiesAdd(ctx, session, city, lang) {
  const T = getT(lang);

  if (!session.collected.some((c) => c.hebrew === city.hebrew)) {
    session.collected.push(city);
  }

  session.step          = 'awaiting_query';
  session.searchResults = null;

  const soFar = session.collected.map((c) => `• ${c.label}`).join('\n');
  const msg   = T.setcitiesAdded
    .replace('%CITY%', city.label)
    .replace('%LIST%', soFar);

  await ctx.answerCbQuery();
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[
      Markup.button.callback(T.setcitiesDoneButton, 'sc_done'),
    ]]),
  });
}

/**
 * Finalises the /setcities flow: replaces the city store and notifies.
 * `replyFn` is either ctx.reply (from /done command) or ctx.editMessageText
 * (from the Done button).
 */
async function finishSetcities(ctx, collected, lang, replyFn) {
  const T = getT(lang);
  sessions.delete(ctx.from.id);

  if (collected.length === 0) {
    return replyFn(T.setcitiesNoSelection);
  }

  cityStore.replace(collected.map((c) => c.hebrew));

  const list = collected.map((c) => `• ${c.label}`).join('\n');
  const msg  = `${T.setcitiesDone}${list}`;

  replyFn(msg, { parse_mode: 'Markdown' });
  notifyChannel(msg);
}

// ── District selection helper ──────────────────────────────────────────────────

/**
 * Shows a district selection menu for a city group.
 * Used by both /addcity and /setcities flows.
 *
 * @param {object}   ctx
 * @param {string}   sessionType  - 'add' | 'setcities'
 * @param {object}   group        - { prefix, label, districts }
 * @param {string}   lang
 */
function showDistrictMenu(ctx, sessionType, group, lang) {
  const T = getT(lang);

  const existing = sessions.get(ctx.from.id) || {};
  sessions.set(ctx.from.id, {
    ...existing,
    type:        sessionType,
    step:        'district_select',
    prefix:      group.prefix,
    prefixLabel: group.label,
    districts:   group.districts,
  });

  const allLabel  = T.districtAllCity.replace('%CITY%', group.label);
  const allAction = sessionType === 'add' ? 'city_ga' : 'sc_ga';
  const cancelAction = sessionType === 'add' ? 'city_n' : 'sc_skip';

  const districtButtons = group.districts.map((d, i) =>
    Markup.button.callback(d.label, `${sessionType === 'add' ? 'city_d' : 'sc_d'}:${i}`)
  );
  const rows = chunk(districtButtons, 2);
  rows.unshift([Markup.button.callback(allLabel, allAction)]);
  rows.push([Markup.button.callback(T.actionCancelled, cancelAction)]);

  ctx.reply(
    T.districtSelectPrompt.replace('%CITY%', group.label),
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

// ── Command registration ───────────────────────────────────────────────────────

function registerCommands() {

  // ── /language ────────────────────────────────────────────────────────────────
  bot.command('language', (ctx) => {
    const T = getT(getUserLang(ctx.from.id));
    ctx.reply(T.languagePrompt, Markup.inlineKeyboard([[
      Markup.button.callback('🇬🇧 English', 'lc:en'),
      Markup.button.callback('🇮🇱 עברית',   'lc:he'),
      Markup.button.callback('🇷🇺 Русский',  'lc:ru'),
    ]]));
  });

  // ── /cities ──────────────────────────────────────────────────────────────────
  bot.command('cities', async (ctx) => {
    const lang = getUserLang(ctx.from.id);
    const T    = getT(lang);
    const list = await citiesList(cityStore.getAll(), (h) => getLocalizedName(h, lang));
    ctx.reply(`${T.citiesHeader}\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // ── /addcity <query> ──────────────────────────────────────────────────────────
  bot.command('addcity', (ctx) => {
    const lang  = getUserLang(ctx.from.id);
    const T     = getT(lang);
    const query = getArgs(ctx);

    if (!query) return ctx.reply(T.addcityUsage);

    const groups = searchCities(query, lang, 10);

    if (groups.length === 0) {
      return ctx.reply(
        T.searchNoResults.replace('%QUERY%', query),
        { parse_mode: 'Markdown' }
      );
    }

    // Single result with districts → go straight to district selection.
    if (groups.length === 1 && groups[0].districts.length > 0) {
      return showDistrictMenu(ctx, 'add', groups[0], lang);
    }

    // Single result with no districts → confirm and add.
    if (groups.length === 1) {
      sessions.set(ctx.from.id, { type: 'add', step: 'confirming', groups });
      return ctx.reply(
        T.searchConfirm.replace('%CITY%', groups[0].label),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[
            Markup.button.callback(T.searchConfirmYes, 'city_y'),
            Markup.button.callback(T.searchConfirmNo,  'city_n'),
          ]]),
        }
      );
    }

    // Multiple results → show city grid; district selection happens on pick.
    sessions.set(ctx.from.id, { type: 'add', step: 'selecting', groups });
    const buttons = groups.map((g, i) => Markup.button.callback(g.label, `city_a:${i}`));
    const rows    = chunk(buttons, 2);
    rows.push([Markup.button.callback(T.actionCancelled, 'city_n')]);

    ctx.reply(
      T.searchSelectZone
        .replace('%COUNT%', String(groups.length))
        .replace('%QUERY%', query),
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
    );
  });

  // ── /removecity ───────────────────────────────────────────────────────────────
  bot.command('removecity', (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const T       = getT(lang);
    const results = [...cityStore.getAll()].map((h) => ({
      hebrew: h,
      label:  getLocalizedName(h, lang),
    }));

    sessions.set(ctx.from.id, { type: 'remove', results });

    const buttons = results.map((r, i) => Markup.button.callback(r.label, `city_r:${i}`));
    ctx.reply(T.removecityPrompt, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(chunk(buttons, 2)),
    });
  });

  // ── /setcities — iterative search flow ───────────────────────────────────────
  // Replaces the entire city list by searching one city at a time.
  // Finish with the Done button or /done.
  bot.command('setcities', (ctx) => {
    const lang = getUserLang(ctx.from.id);
    const T    = getT(lang);

    sessions.set(ctx.from.id, {
      type:          'setcities',
      step:          'awaiting_query',
      collected:     [],
      searchResults: null,
    });

    ctx.reply(T.setcitiesStart, { parse_mode: 'Markdown' });
  });

  // ── /done — finalise /setcities ───────────────────────────────────────────────
  bot.command('done', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'setcities') return;

    await finishSetcities(ctx, session.collected, lang, ctx.reply.bind(ctx));
  });

  // ── /status ───────────────────────────────────────────────────────────────────
  bot.command('status', (ctx) => {
    const lang = getUserLang(ctx.from.id);
    const T    = getT(lang);

    pikudHaoref.getActiveAlerts(async (err, alerts) => {
      try {
        if (err) {
          await ctx.reply(T.statusError.replace('%ERROR%', err.message));
          return;
        }
        if (!Array.isArray(alerts) || alerts.length === 0) {
          await ctx.reply(T.statusAllClear);
          return;
        }

        const lines = alerts.flatMap((alert) =>
          (alert.cities || []).map((city) =>
            `• ${getLocalizedName(city, lang)} (${alert.type})`
          )
        );

        // Telegram's message limit is 4096 characters.  Trim the city list
        // before joining so we never send an oversized message.
        const header   = `${T.statusActiveHeader}\n\n`;
        const maxBody  = 4096 - header.length - 2; // 2 = '…\n'
        let   body     = lines.join('\n');
        if (body.length > maxBody) {
          body = body.slice(0, body.lastIndexOf('\n', maxBody)) + '\n…';
        }

        await ctx.reply(header + body, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error(`[ERROR] /status reply failed: ${e.message}`);
        ctx.reply(T.statusError.replace('%ERROR%', e.message)).catch(() => {});
      }
    });
  });

  // ── Free-text handler: intercepts search queries during /setcities flow ───────
  bot.on('text', (ctx) => {
    // Skip command messages — they are handled above.
    if (ctx.message.text.startsWith('/')) return;

    const session = sessions.get(ctx.from.id);
    if (!session || session.type !== 'setcities' || session.step !== 'awaiting_query') return;

    const lang   = getUserLang(ctx.from.id);
    const T      = getT(lang);
    const query  = ctx.message.text.trim();
    const groups = searchCities(query, lang, 10);

    if (groups.length === 0) {
      return ctx.reply(
        T.searchNoResults.replace('%QUERY%', query),
        { parse_mode: 'Markdown' }
      );
    }

    // Single result with districts → go straight to district selection.
    if (groups.length === 1 && groups[0].districts.length > 0) {
      session.step = 'district_select';
      return showDistrictMenu(ctx, 'setcities', groups[0], lang);
    }

    // Single result with no districts → confirm.
    if (groups.length === 1) {
      session.step          = 'selecting';
      session.searchResults = groups;
      return ctx.reply(
        T.searchConfirm.replace('%CITY%', groups[0].label),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[
            Markup.button.callback(T.searchConfirmYes, 'sc_y'),
            Markup.button.callback(T.searchConfirmNo,  'sc_skip'),
          ]]),
        }
      );
    }

    session.step          = 'selecting';
    session.searchResults = groups;
    const buttons = groups.map((g, i) => Markup.button.callback(g.label, `sc_a:${i}`));
    ctx.reply(
      T.searchSelectZone
        .replace('%COUNT%', String(groups.length))
        .replace('%QUERY%', query),
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(chunk(buttons, 2)) }
    );
  });

  // ── Callback query handlers ────────────────────────────────────────────────────

  // Language buttons
  bot.action(/^lc:(en|he|ru)$/, (ctx) => {
    const newLang = ctx.match[1];
    setUserLang(ctx.from.id, newLang);
    ctx.answerCbQuery();
    ctx.editMessageText(getT(newLang).languageSet, { parse_mode: 'Markdown' });
  });

  // /addcity: city selected from grid
  bot.action(/^city_a:(\d+)$/, async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);
    const idx     = parseInt(ctx.match[1], 10);

    if (!session || session.type !== 'add' || !session.groups?.[idx]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }

    await ctx.answerCbQuery();
    const group = session.groups[idx];

    // City has districts → show district selection menu.
    if (group.districts.length > 0) {
      return showDistrictMenu(ctx, 'add', group, lang);
    }

    // No districts → add the whole city directly.
    await commitAddCity(ctx, group.prefix, group.label, lang);
  });

  // /addcity: single match confirmed (no districts)
  bot.action('city_y', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'add' || !session.groups?.[0]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    const g = session.groups[0];
    await commitAddCity(ctx, g.prefix, g.label, lang);
  });

  // /addcity: "All of <city>" selected from district menu
  bot.action('city_ga', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'add' || session.step !== 'district_select') {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    await commitAddCity(ctx, session.prefix, session.prefixLabel, lang);
  });

  // /addcity: specific district selected
  bot.action(/^city_d:(\d+)$/, async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);
    const idx     = parseInt(ctx.match[1], 10);

    if (!session || session.type !== 'add' || session.step !== 'district_select' || !session.districts?.[idx]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    const { hebrew, label } = session.districts[idx];
    await commitAddCity(ctx, hebrew, label, lang);
  });

  // /addcity or /removecity: cancelled
  bot.action('city_n', (ctx) => {
    const lang = getUserLang(ctx.from.id);
    sessions.delete(ctx.from.id);
    ctx.answerCbQuery();
    ctx.editMessageText(getT(lang).actionCancelled);
  });

  // /removecity: city selected
  bot.action(/^city_r:(\d+)$/, async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const T       = getT(lang);
    const session = sessions.get(ctx.from.id);
    const idx     = parseInt(ctx.match[1], 10);

    if (!session || session.type !== 'remove' || !session.results[idx]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(T.actionExpired);
    }

    const { hebrew, label } = session.results[idx];
    sessions.delete(ctx.from.id);

    if (!cityStore.remove(hebrew)) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(T.removecityCannotEmpty, { parse_mode: 'Markdown' });
    }

    const list = await citiesList(cityStore.getAll(), (h) => getLocalizedName(h, lang));
    const msg  = `${T.labelRemoved}\n• ${label}\n\n${T.labelNowMonitoring}\n${list}`;

    await ctx.answerCbQuery();
    ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    notifyChannel(msg);
  });

  // /setcities: city selected from grid
  bot.action(/^sc_a:(\d+)$/, async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);
    const idx     = parseInt(ctx.match[1], 10);

    if (!session || session.type !== 'setcities' || !session.searchResults?.[idx]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    await ctx.answerCbQuery();
    const group = session.searchResults[idx];
    if (group.districts.length > 0) return showDistrictMenu(ctx, 'setcities', group, lang);
    await commitSetcitiesAdd(ctx, session, { hebrew: group.prefix, label: group.label }, lang);
  });

  // /setcities: single match confirmed
  bot.action('sc_y', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'setcities' || !session.searchResults?.[0]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    await ctx.answerCbQuery();
    const group = session.searchResults[0];
    if (group.districts.length > 0) return showDistrictMenu(ctx, 'setcities', group, lang);
    await commitSetcitiesAdd(ctx, session, { hebrew: group.prefix, label: group.label }, lang);
  });

  // /setcities: "All of <city>" from district menu
  bot.action('sc_ga', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'setcities' || session.step !== 'district_select') {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    await commitSetcitiesAdd(ctx, session, { hebrew: session.prefix, label: session.prefixLabel }, lang);
  });

  // /setcities: specific district selected
  bot.action(/^sc_d:(\d+)$/, async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);
    const idx     = parseInt(ctx.match[1], 10);

    if (!session || session.type !== 'setcities' || session.step !== 'district_select' || !session.districts?.[idx]) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }
    const { hebrew, label } = session.districts[idx];
    await commitSetcitiesAdd(ctx, session, { hebrew, label }, lang);
  });

  // /setcities: skip this result, search again
  bot.action('sc_skip', (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (session && session.type === 'setcities') {
      session.step          = 'awaiting_query';
      session.searchResults = null;
    }

    ctx.answerCbQuery();
    ctx.editMessageText(getT(lang).setcitiesSearchNext, { parse_mode: 'Markdown' });
  });

  // /setcities: Done button
  bot.action('sc_done', async (ctx) => {
    const lang    = getUserLang(ctx.from.id);
    const session = sessions.get(ctx.from.id);

    if (!session || session.type !== 'setcities') {
      await ctx.answerCbQuery();
      return ctx.editMessageText(getT(lang).actionExpired);
    }

    await ctx.answerCbQuery();
    await finishSetcities(ctx, session.collected, lang, ctx.editMessageText.bind(ctx));
  });
}

module.exports = { registerCommands };
