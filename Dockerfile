# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 1 — data & dependencies
#
# Runs the Pikud HaOref scraper so the image ships with fresh alert zone data.
# The build FAILS if the API is unreachable or returns an empty response,
# preventing a broken image from being deployed.
#
# NOTE: this stage requires outbound HTTPS to alerts-history.oref.org.il,
# which is geo-restricted to Israel. Build from an Israeli host or CI runner.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:22-alpine AS builder

WORKDIR /app

# Install production dependencies only (layer-cached separately from source).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY . .

# Fetch fresh alert zones and validate the output is non-empty.
RUN node scripts/fetch_alert_zones.js && \
    node -e " \
      const zones = require('./src/data/alert_zones.json'); \
      const count = Object.keys(zones).length; \
      if (count === 0) { \
        console.error('[FATAL] alert_zones.json is empty — Oref API unreachable or geo-blocked.'); \
        process.exit(1); \
      } \
      console.log('[INFO] alert_zones.json validated:', count, 'zones OK.'); \
    "

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 2 — minimal production image
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

# Dedicated non-root user for security.
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

# Copy only what is needed at runtime.
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/src           ./src
COPY --from=builder /app/scripts       ./scripts
COPY --from=builder /app/index.js      ./index.js
COPY --from=builder /app/package.json  ./package.json

# Runtime data directory — cities.json and user_prefs.json are mounted here
# via a Docker volume so they survive container restarts and re-deploys.
RUN mkdir -p /app/persist && chown botuser:botgroup /app/persist

USER botuser

# Healthcheck: verify the Node process is still alive.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD pgrep -x node > /dev/null || exit 1

CMD ["node", "index.js"]
