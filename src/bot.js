'use strict';

const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');

// Singleton Telegraf instance shared across all modules.
module.exports = new Telegraf(BOT_TOKEN);
