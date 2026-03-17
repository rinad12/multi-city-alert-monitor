# custom-israel-alerts-notifier

A Telegram bot for real-time alert monitoring in specific Israeli cities with Russian-language notifications.

> **Purpose** — Designed to keep family members informed when I am in a bomb shelter and unable to communicate. When a siren fires in a monitored city, the bot automatically sends a reassuring message to a Telegram channel so loved ones abroad know I am safe and following security instructions.

---

## Features

- Polls the Israeli Home Front Command (Pikud HaOref) API every **1 second**
- Filters alerts to only the cities you care about
- Translates Hebrew city names to **Russian**
- Sends a calm, reassuring message to a Telegram channel or group
- **Deduplicates** alerts — one notification per unique alert event, no spam
- Graceful error handling with automatic retry for Telegram delivery failures

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 14.x |
| npm | ≥ 6.x |
| **Network location** | Must run from **within Israel** (the Pikud HaOref API is geo-restricted) |

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/custom-israel-alerts-notifier.git
cd custom-israel-alerts-notifier
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Telegram bot

1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the **API token** you receive.

### 4. Get your channel / chat ID

- For a **private channel**: add your bot as an admin, then send a message and use [@userinfobot](https://t.me/userinfobot) or the Telegram API to retrieve the chat ID (it will be a negative number like `-1001234567890`).
- For a **private group**: same process.
- For a **personal chat**: your own numeric user ID works.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=123456789:AAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CHANNEL_ID=-1001234567890
TARGET_CITIES_HEBREW=אשקלון,אשדוד,שדרות
```

`TARGET_CITIES_HEBREW` is a **comma-separated list** of city names in Hebrew, exactly as they appear in the Pikud HaOref API (no spaces around commas).

### 6. Run

```bash
npm start
```

You should see:

```
[INFO] Starting custom-israel-alerts-notifier…
[INFO] Monitoring cities: אשקלון, אשדוד, שדרות
```

---

## Notification message (Russian)

When an alert fires for a monitored city the following message is sent:

```
🚨 ТРЕВОГА: Ашкелон 🚨

Это сообщение отправлено автоматически, так как в этом районе сработала сирена.
Пожалуйста, не волнуйтесь, я следую инструкциям безопасности и нахожусь в защищённом пространстве.
```

---

## Running as a persistent service (Linux / VPS)

Using **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name israel-alerts
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

---

## Linking to a remote GitHub repository

After creating a new repository on GitHub (name it `custom-israel-alerts-notifier`):

```bash
git remote add origin https://github.com/<your-username>/custom-israel-alerts-notifier.git
git branch -M main
git push -u origin main
```

> **Never push `.env`** — it is listed in `.gitignore` and must stay local.

---

## Project structure

```
custom-israel-alerts-notifier/
├── index.js          # Core bot logic
├── package.json      # Dependencies
├── .env.example      # Environment variable template
├── .gitignore        # Excludes .env and node_modules
└── README.md         # This file
```

---

## Dependencies

| Package | Purpose |
|---|---|
| [`pikud-haoref-api`](https://www.npmjs.com/package/pikud-haoref-api) | Unofficial wrapper for the Pikud HaOref alert API |
| [`telegraf`](https://telegraf.js.org/) | Telegram Bot framework for Node.js |
| [`dotenv`](https://github.com/motdotla/dotenv) | Load environment variables from `.env` |

---

## License

MIT
