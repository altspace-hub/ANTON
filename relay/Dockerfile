# ANTON Mesh Relay — production container.
#
# Multi-stage Alpine for minimal attack surface + small image size.
# Final stage runs as a non-root user with read-only root filesystem.
#
# Build:
#   docker build -t anton-mesh-relay:0.1.0 .
#
# Run (behind a reverse proxy that handles TLS):
#   docker run -e RELAY_URL=wss://r1.example.org -e RELAY_INSECURE=1 \
#     -p 8443:8443 anton-mesh-relay:0.1.0
#
# Run (with TLS termination at the relay):
#   docker run -e RELAY_URL=wss://r1.example.org \
#     -e RELAY_TLS_CERT=/certs/fullchain.pem \
#     -e RELAY_TLS_KEY=/certs/privkey.pem \
#     -v /etc/letsencrypt/live/r1.example.org:/certs:ro \
#     -p 8443:8443 anton-mesh-relay:0.1.0

# ── Stage 1 — build ──────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /build

# Install pnpm via corepack — Node 22 ships corepack, so no global install.
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# Copy manifests first for layer caching.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-workspace

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Stage 2 — runtime ────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Drop privileges. node:22-alpine ships a `node` user (uid 1000) for this.
USER node

COPY --from=build --chown=node:node /build/node_modules ./node_modules
COPY --from=build --chown=node:node /build/dist ./dist
COPY --chown=node:node package.json ./
# Migrations are plain SQL — copy them in so the registry migrate
# runner can find them at /app/migrations. Run with:
#   docker compose run --rm relay node dist/registry/migrate.js
COPY --chown=node:node migrations ./migrations

ENV NODE_ENV=production

# Default port — operators override with -p when publishing.
EXPOSE 8443

# Healthcheck: a HEAD on the WS port should at least open a TCP connection.
# (The WS handshake won't succeed without HTTP upgrade, but a refused
# connection means the process is down. Adjust if you front this with a
# proper /healthz HTTP endpoint in a future spec version.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('net').createConnection(${RELAY_PORT:-8443}, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
