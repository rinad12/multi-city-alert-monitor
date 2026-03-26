# custom-israel-alerts-notifier

A Telegram bot for real-time alert monitoring in specific Israeli cities with automatic multilingual notifications via [LibreTranslate](https://libretranslate.com/).

> **Purpose** — Designed to keep family members informed when I am in a bomb shelter and unable to communicate. When a siren fires in a monitored city, the bot automatically sends a reassuring message to a Telegram channel so loved ones abroad know I am safe and following security instructions.

---

## Features

- Polls the Israeli Home Front Command (Pikud HaOref) API every **2 seconds**
- Filters alerts to only the cities you care about
- **Multilingual** — all messages translated to any target language via LibreTranslate (`TARGET_LANG`)
- City names accepted and displayed in the user's language; Hebrew resolved automatically on input
- Handles **all alert types** with tailored messages per incident category
- Detects **newsFlash phase** (shelter vs. all-clear) from Hebrew instruction text
- **Silently skips drills** — no unnecessary stress for family abroad
- **Deduplicates** alerts — one notification per unique alert event, no spam
- Static bot strings pre-translated at startup; only city names translated at runtime
- Startup and shutdown notifications sent to the channel
- Graceful error handling: LibreTranslate fallback to source text on timeout; malformed API responses silently skipped; backoff after consecutive failures

---

## Alert types

| Type | Message |
|---|---|
| `missiles` | 🚀 MISSILE ALERT — already in a safe place, can't answer calls |
| `hostileAircraftIntrusion` | ✈️ AIR THREAT — in a protected space, waiting for all-clear |
| `earthQuake` | 🫨 EARTHQUAKE — moved to open ground, I'm fine |
| `terroristInfiltration` | 🪖 SECURITY ALERT — at home, doors locked |
| `tsunami` | 🌊 TSUNAMI WARNING — moved away from coastline |
| `hazardousMaterials` / `radiologicalEvent` | ⚠️ HAZMAT ALERT — windows sealed, staying indoors |
| `newsFlash` + shelter keywords | 🔔 NOTICE — staying near protected space |
| `newsFlash` + all-clear keywords | ✅ ALL CLEAR — you may leave the shelter 😊 |
| `*Drill` | *(silently skipped)* |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | Uses `node --watch` for dev mode |
| npm ≥ 8 | |
| **Network location** | Must run from **within Israel** — the Pikud HaOref API is geo-restricted |
| **LibreTranslate** | A self-hosted or public instance; see [setup](#libretranslate) below |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/custom-israel-alerts-notifier.git
cd custom-israel-alerts-notifier
npm install
```

### 2. Create a Telegram bot

1. Start a chat with [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Copy the **API token** you receive.

### 3. Get your channel / chat ID

- **Private channel or group**: add the bot as an admin, then retrieve the chat ID via [@userinfobot](https://t.me/userinfobot) or the Telegram API (negative number, e.g. `-1001234567890`).
- **Personal chat**: use your own numeric user ID.

### 4. LibreTranslate

The bot requires a LibreTranslate instance to translate messages. The easiest way is Docker:

```bash
docker run -p 5000:5000 libretranslate/libretranslate
```

Or use any public instance and set its URL in `.env`. If `TARGET_LANG=en`, translation is a no-op and LibreTranslate is not called.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=123456789:AAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CHANNEL_ID=-1001234567890

# Hebrew city names as they appear in the Pikud HaOref API (comma-separated)
TARGET_CITIES_HEBREW=אשקלון,אשדוד,שדרות

# Language for all bot messages (BCP-47 code: en, ru, de, fr, uk, he, …)
TARGET_LANG=en

# Your LibreTranslate instance
LIBRE_TRANSLATE_URL=http://localhost:5000
LIBRE_TRANSLATE_KEY=
```

City names in `TARGET_CITIES_HEBREW` must be exact Hebrew strings. Use `/addcity` to add cities in your own language at runtime — the bot resolves them to Hebrew automatically.

### 6. Run

```bash
npm start          # production
npm run dev        # development (auto-restarts on file changes)
```

Expected startup output:

```
[INFO] Starting custom-israel-alerts-notifier…
[INFO] Monitoring cities: אשקלון, אשדוד, שדרות
[INFO] Translating bot strings to "en"…
[INFO] Bot strings ready.
[INFO] Alert poller started (interval: 2000ms)
[INFO] Startup notification sent.
```

---

## Bot commands

All commands accept city names in **your language or Hebrew**.

| Command | Description |
|---|---|
| `/cities` | Show the current list of monitored cities |
| `/addcity <city1,city2,...>` | Add one or more cities |
| `/removecity <city1,city2,...>` | Remove specific cities |
| `/setcities <city1,city2,...>` | Replace the entire city list |
| `/status` | Query live active alerts right now |

**Examples** (with `TARGET_LANG=en`):
```
/addcity Tel Aviv, Haifa
/addcity תל אביב,חיפה      ← Hebrew also accepted
/removecity Haifa
/setcities Bat Yam, Ashdod, Sderot
```

The monitored list is persisted to `cities.json` and survives bot restarts.

---

## Console output

| Level | When |
|---|---|
| `[INFO]` | Startup, shutdown, notification sent, poller started |
| `[DEBUG]` | Full alert object — only when `DEBUG=true` in `.env` |
| `[WARN]` | Malformed API responses (backoff triggered), LibreTranslate timeout |
| `[ERROR]` | Network failures, Telegram send failures, file write errors |

---

## Project structure

```
custom-israel-alerts-notifier/
├── src/
│   ├── config.js          # Env vars, validation, all tunable constants
│   ├── bot.js             # Singleton Telegraf instance
│   ├── cityStore.js       # City list persistence (cities.json)
│   ├── cityHelpers.js     # translateCity(), resolveToHebrew()
│   ├── dedup.js           # Alert deduplication (Map + TTL)
│   ├── alertMessages.js   # buildMessage() — pure, no I/O
│   ├── alertPoller.js     # Polling loop with exponential backoff
│   ├── notifier.js        # sendNotification() with retry, notifyChannel()
│   ├── strings.js         # Static string templates + initTranslations()
│   └── commands.js        # Bot command handlers
├── translate.js           # LibreTranslate HTTP client
├── index.js               # Entry point — wires modules, startup, shutdown
├── cities.json            # Runtime city list (auto-created, gitignored)
├── package.json
├── .env                   # Secrets — never commit
├── .env.example           # Template with all supported variables
└── .gitignore
```

---

## Tunable constants

All of these can be overridden in `.env` without touching code:

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL_MS` | `2000` | How often to poll the HFC API |
| `BACKOFF_INTERVAL_MS` | `5000` | Pause duration after repeated errors |
| `BACKOFF_THRESHOLD` | `3` | Consecutive errors before backoff kicks in |
| `DEDUP_TTL_MS` | `600000` | Alert dedup window (10 minutes) |
| `SEND_MAX_RETRIES` | `3` | Telegram send retry attempts |
| `CITIES_FILE_PATH` | `./cities.json` | Path to the persistent city list |
| `DEBUG` | `false` | Set to `true` to log full alert objects |

---

## Running as a persistent service

**PM2 (Linux / VPS):**

```bash
npm install -g pm2
pm2 start index.js --name israel-alerts
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

**Docker Compose** (bot + LibreTranslate together):

```yaml
services:
  bot:
    image: node:18-alpine
    working_dir: /app
    volumes: [".:/app"]
    command: npm start
    env_file: .env
    restart: unless-stopped
    depends_on: [libretranslate]

  libretranslate:
    image: libretranslate/libretranslate
    restart: unless-stopped
    ports: ["5000:5000"]
```

Then set `LIBRE_TRANSLATE_URL=http://libretranslate:5000` in `.env`.

---

## Dependencies

| Package | Purpose |
|---|---|
| [`pikud-haoref-api`](https://github.com/eladnava/pikud-haoref-api) | Unofficial wrapper for the Pikud HaOref alert API |
| [`telegraf`](https://telegraf.js.org/) | Telegram Bot framework for Node.js |
| [`dotenv`](https://github.com/motdotla/dotenv) | Load environment variables from `.env` |

Translation is handled via the [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) HTTP API using Node.js built-in `http`/`https` — no extra npm dependency.

---

## License

MIT
