# multi-city-alert-monitor

A Telegram bot for real-time alert monitoring in specific Israeli cities with multilingual notifications — no external translation service required.

> **Purpose** — Designed to keep family members informed when I am in a bomb shelter and unable to communicate. When a siren fires in a monitored city, the bot automatically sends a reassuring message to a Telegram channel so loved ones abroad know I am safe and following security instructions.

---

## Features

- Polls the Israeli Home Front Command (Pikud HaOref) API every **2 seconds**
- Filters alerts to only the cities you care about, including **full district matching** — monitor "Tel Aviv" and receive alerts for all its sub-districts automatically
- **Multilingual** — English, Hebrew, or Russian; per-user language preference saved automatically
- City names resolved from a **static zone map** built from official Pikud HaOref data (accurate Israeli place names in all supported languages)
- **Interactive city search** — `/addcity` shows inline keyboard results, no need to type Hebrew
- Handles **all alert types** with tailored messages per incident category
- Detects **newsFlash phase** (shelter vs. all-clear) from Hebrew instruction text
- **Silently skips drills** — no unnecessary stress for family abroad
- **Deduplicates** alerts — one notification per unique event, no spam
- Startup and shutdown notifications sent to the channel
- Zero runtime CPU/RAM overhead — all lookups are O(1) in-memory operations
- Docker-ready with automated zone data refresh at build time

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
| Node.js ≥ 18 | Or use Docker (recommended for production) |
| **Network location** | Must run from **within Israel** — the Pikud HaOref API is geo-restricted |

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/rinad12/multi-city-alert-monitor.git
cd multi-city-alert-monitor
npm install
```

### 2. Create a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) and send `/newbot`
2. Copy the **API token** you receive

### 3. Get your channel ID

Add your bot as admin to a channel or group, then find the chat ID via [@userinfobot](https://t.me/userinfobot) (negative number for channels, e.g. `-1001234567890`).

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=123456789:AAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CHANNEL_ID=-1001234567890

# Comma-separated Hebrew city names (used for initial startup only)
# You can manage cities at runtime via /addcity instead
TARGET_CITIES_HEBREW=אשקלון,אשדוד,שדרות

# Default language for bot messages: en, he, or ru
TARGET_LANG=ru
```

### 5. Populate the zone map

Run the scraper **once** from inside Israel to build the static city translation map:

```bash
node scripts/fetch_alert_zones.js
```

This fetches the official Pikud HaOref city list in Hebrew, English, and Russian, and writes `src/data/alert_zones.json`. Re-run whenever you want to pick up newly added zones.

> The script must be run from within Israel — the Oref API is geo-restricted. If a zone is missing (e.g. added after your last scraper run), the bot falls back to displaying the Hebrew name.

### 6. Run

```bash
npm start        # production
npm run dev      # auto-restart on file changes
```

---

## Bot commands

| Command | Description |
|---|---|
| `/addcity <query>` | Search for a city and add it via inline keyboard |
| `/removecity` | Show monitored cities as buttons — tap to remove |
| `/setcities` | Rebuild the entire city list interactively (search one by one) |
| `/cities` | Show the current monitored city list |
| `/status` | Query live active alerts right now |
| `/language` | Change your personal language preference |

### Adding cities

```
/addcity Tel Aviv
```
→ Bot shows up to 10 matching zones as inline buttons. Tap to add.

```
/addcity תל אביב
```
→ Hebrew input also accepted. If only one match is found, a confirmation dialog appears instead.

### District matching

Monitoring `"Tel Aviv"` (parent city) automatically covers all sub-districts:

```
Tel Aviv - Center  ✓
Tel Aviv - North   ✓
Tel Aviv - South   ✓
```

You can also add specific districts via `/addcity` if you only want alerts for part of a city.

### Language selection

Each user's language is stored individually. Use `/language` to switch between English, Hebrew, and Russian at any time. The default falls back to `TARGET_LANG` from `.env`.

---

## Project structure

```
multi-city-alert-monitor/
├── scripts/
│   └── fetch_alert_zones.js   # Scraper: builds src/data/alert_zones.json
├── src/
│   ├── data/
│   │   ├── alert_zones.json   # Hebrew → {en, ru} zone name map (generated)
│   │   └── translations.json  # Bot UI strings in en, he, ru
│   ├── alertMessages.js       # buildMessage() — maps alert type to template
│   ├── alertPoller.js         # Polling loop with exponential backoff
│   ├── bot.js                 # Singleton Telegraf instance
│   ├── cityHelpers.js         # getLocalizedName(), isMonitored()
│   ├── citySearch.js          # Fuzzy zone search against alert_zones.json
│   ├── cityStore.js           # City list persistence (cities.json)
│   ├── commands.js            # Bot command + callback query handlers
│   ├── config.js              # Env vars, validation, tunable constants
│   ├── dedup.js               # Alert deduplication (Map + TTL)
│   ├── notifier.js            # Telegram send with retry
│   ├── strings.js             # i18n helpers: initTranslations(), getT()
│   └── userStore.js           # Per-user language persistence (user_prefs.json)
├── index.js                   # Entry point — wires modules, startup, shutdown
├── Dockerfile                 # Multi-stage build with scraper pre-baked
├── docker-compose.yml         # Production deployment
├── package.json
├── .env.example               # Config template
└── .gitignore
```

---

## Docker deployment (production)

Build and run from an Israeli server (required for the scraper to fetch zone data during build):

```bash
git clone https://github.com/rinad12/multi-city-alert-monitor.git
cd multi-city-alert-monitor
cp .env.example .env   # fill in BOT_TOKEN and CHANNEL_ID

docker compose build   # runs scraper, validates zone data, builds image
docker compose up -d   # start in background
docker compose logs -f # tail logs
```

The build **fails intentionally** if the Pikud HaOref API is unreachable or returns empty data — preventing deployment of a broken image.

Runtime state (`cities.json`, `user_prefs.json`) is stored in a named Docker volume and survives container restarts and image updates.

To update the zone data after Pikud HaOref adds new areas:

```bash
docker compose build --no-cache
docker compose up -d
```

---

## Tunable constants

All can be overridden in `.env` without touching code:

| Variable | Default | Description |
|---|---|---|
| `TARGET_LANG` | `en` | Default language: `en`, `he`, or `ru` |
| `POLL_INTERVAL_MS` | `2000` | How often to poll the HFC API |
| `BACKOFF_INTERVAL_MS` | `5000` | Pause after repeated errors |
| `BACKOFF_THRESHOLD` | `3` | Consecutive errors before backoff kicks in |
| `DEDUP_TTL_MS` | `600000` | Alert dedup window (10 minutes) |
| `SEND_MAX_RETRIES` | `3` | Telegram send retry attempts |
| `CITIES_FILE_PATH` | `./cities.json` | Path to the persistent city list |
| `USER_PREFS_PATH` | `./user_prefs.json` | Path to per-user language preferences |
| `DEBUG` | `false` | Log full alert objects for debugging |

---

## Dependencies

| Package | Purpose |
|---|---|
| [`pikud-haoref-api`](https://github.com/eladnava/pikud-haoref-api) | Unofficial wrapper for the Pikud HaOref alert API |
| [`telegraf`](https://telegraf.js.org/) | Telegram Bot framework for Node.js |
| [`dotenv`](https://github.com/motdotla/dotenv) | Load environment variables from `.env` |

All localisation is handled via static JSON files — no external translation service or additional npm packages required.

---

## License

MIT
