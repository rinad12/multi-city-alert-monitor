'use strict';

const pikudHaoref = require('pikud-haoref-api');
const bot                              = require('./bot');
const cityStore                        = require('./cityStore');
const { T, citiesList }                = require('./strings');
const { translateCity, resolveToHebrew } = require('./cityHelpers');
const { notifyChannel }                = require('./notifier');

/**
 * Extracts the argument string from a command message.
 * Handles both `/command text` and `/command@botname text` forms.
 */
function getArgs(ctx) {
  return ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
}

/** Registers all bot commands. Call once before bot.launch(). */
function registerCommands() {

  // ── /cities ────────────────────────────────────────────────────────────────
  bot.command('cities', async (ctx) => {
    const list = await citiesList(cityStore.getAll(), translateCity);
    ctx.reply(`${T.citiesHeader}\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // ── /addcity <city1,city2,...> ─────────────────────────────────────────────
  bot.command('addcity', async (ctx) => {
    const args = getArgs(ctx);
    if (!args) return ctx.reply(T.addcityUsage);

    const incoming = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
    const added    = incoming.filter((c) => !cityStore.getAll().has(c));

    if (added.length === 0) return ctx.reply(T.addcityAlready);

    cityStore.add(added);
    console.log(`[INFO] Cities added: ${added.join(', ')}`);

    const addedNames = await Promise.all(added.map(translateCity));
    const list       = await citiesList(cityStore.getAll(), translateCity);
    const msg =
      `${T.labelAdded}\n${addedNames.map((n) => `• ${n}`).join('\n')}` +
      `\n\n${T.labelNowMonitoring}\n${list}`;

    ctx.reply(msg, { parse_mode: 'Markdown' });
    notifyChannel(msg);
  });

  // ── /removecity <city1,city2,...> ──────────────────────────────────────────
  bot.command('removecity', async (ctx) => {
    const args = getArgs(ctx);
    if (!args) return ctx.reply(T.removecityUsage);

    const incoming = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
    const toRemove = incoming.filter((c) =>  cityStore.getAll().has(c));
    const notFound = incoming.filter((c) => !cityStore.getAll().has(c));

    if (toRemove.length === 0) return ctx.reply(T.removecityNotFound);

    const success = cityStore.remove(toRemove);
    if (!success) return ctx.reply(T.removecityCannotEmpty);

    console.log(`[INFO] Cities removed: ${toRemove.join(', ')}`);

    const removedNames  = await Promise.all(toRemove.map(translateCity));
    const notFoundNames = await Promise.all(notFound.map(translateCity));
    const list          = await citiesList(cityStore.getAll(), translateCity);

    const parts = [`${T.labelRemoved}\n${removedNames.map((n) => `• ${n}`).join('\n')}`];
    if (notFoundNames.length)
      parts.push(`${T.labelNotFound}\n${notFoundNames.map((n) => `• ${n}`).join('\n')}`);
    parts.push(`${T.labelNowMonitoring}\n${list}`);

    const msg = parts.join('\n\n');
    ctx.reply(msg, { parse_mode: 'Markdown' });
    notifyChannel(msg);
  });

  // ── /setcities <city1,city2,...> ───────────────────────────────────────────
  bot.command('setcities', async (ctx) => {
    const args = getArgs(ctx);
    if (!args) return ctx.reply(T.setcitiesUsage);

    const newCities = await Promise.all(args.split(',').map((c) => resolveToHebrew(c.trim())));
    if (newCities.length === 0) return ctx.reply(T.setcitiesEmpty);

    const added   = newCities.filter((c) => !cityStore.getAll().has(c));
    const removed = [...cityStore.getAll()].filter((c) => !newCities.includes(c));

    cityStore.replace(newCities);
    console.log(`[INFO] Cities replaced: ${newCities.join(', ')}`);

    const addedNames   = await Promise.all(added.map(translateCity));
    const removedNames = await Promise.all(removed.map(translateCity));
    const list         = await citiesList(cityStore.getAll(), translateCity);

    const parts = [];
    if (addedNames.length)
      parts.push(`${T.labelAdded}\n${addedNames.map((n) => `• ${n}`).join('\n')}`);
    if (removedNames.length)
      parts.push(`${T.labelRemoved}\n${removedNames.map((n) => `• ${n}`).join('\n')}`);
    parts.push(`${T.labelNowMonitoring}\n${list}`);

    const msg = parts.join('\n\n');
    ctx.reply(msg, { parse_mode: 'Markdown' });
    notifyChannel(msg);
  });

  // ── /status ────────────────────────────────────────────────────────────────
  bot.command('status', (ctx) => {
    pikudHaoref.getActiveAlerts(async (err, alerts) => {
      if (err) {
        return ctx.reply(T.statusError.replace('%ERROR%', err.message));
      }

      if (!Array.isArray(alerts) || alerts.length === 0) {
        return ctx.reply(T.statusAllClear);
      }

      const lines = await Promise.all(
        alerts.flatMap((alert) =>
          (alert.cities || []).map(async (city) =>
            `• ${await translateCity(city)} (${alert.type})`
          )
        )
      );
      ctx.reply(`${T.statusActiveHeader}\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
    });
  });
}

module.exports = { registerCommands };
