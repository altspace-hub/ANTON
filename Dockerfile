# ── openEXPERT by ANTON — Dockerfile ──────────────────────────
#
# Single-stage build using tsx so server TypeScript runs directly.
# Keeps things simple for a local/self-hosted tool.
#
# Build:  docker build -t openexpert .
# Run:    docker run -p 3001:3001 -e ANTHROPIC_API_KEY=sk-ant-... openexpert

FROM node:20-alpine

# Build tools required for better-sqlite3 native module compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies first (layer-caches until package files change)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build the React client (outputs to dist/client/)
RUN pnpm exec vite build

# Ensure runtime directories exist
RUN mkdir -p data uploads outputs

# Runtime environment defaults (override with -e or docker-compose.yml)
ENV NODE_ENV=production
ENV PORT=3001

# Persist data, uploads, and outputs across container restarts
VOLUME ["/app/data", "/app/uploads", "/app/outputs"]

EXPOSE 3001

# Run server with tsx (no separate TS compilation step needed)
CMD ["node", "node_modules/.bin/tsx", "server/index.ts"]
