#!/usr/bin/env bash
# triangle-check.sh — Pattern G.6
# For each pillar, checks the surface ↔ service ↔ schema triangle.
# Imbalanced triangles (e.g. pages but no services, or schema but no UI) signal
# half-built features.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Surface-Service-Schema Triangle Check

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.6

For each pillar / domain: counts pages, services, and migrations. Imbalance signals a half-built feature.

| Domain | Pages | Services | Migrations | Triangle |
|---|---|---|---|---|
EOF

triangle_status() {
  local p=$1 s=$2 m=$3
  if [[ $p -eq 0 && $s -eq 0 && $m -eq 0 ]]; then echo "(absent)"; return; fi
  if [[ $p -gt 0 && $s -gt 0 && $m -gt 0 ]]; then echo "✅ balanced"; return; fi
  if [[ $p -eq 0 && $s -gt 0 ]]; then echo "🔴 backend-only (no UI)"; return; fi
  if [[ $s -eq 0 && $p -gt 0 ]]; then echo "🟡 UI without service?"; return; fi
  if [[ $m -eq 0 && $s -gt 0 ]]; then echo "🟢 service without dedicated schema"; return; fi
  echo "🟡 partial"
}

for pillar in markets school life pathfinder portals missions community payments procure civic grow agents atlas hardware coding talent beehive evidence; do
  pages=$(find src/pages -ipath "*/${pillar}*" -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
  services=$(find server/services -iname "*${pillar}*" 2>/dev/null \
    | grep -v ".test.ts" | wc -l | tr -d ' ')
  # migrations: match the pillar token in the filename (after the 3-digit prefix)
  migrations=$(ls server/db/migrations-pg/*"${pillar}"*.sql 2>/dev/null | wc -l | tr -d ' ')
  status=$(triangle_status "$pages" "$services" "$migrations")
  printf "| %-12s | %-5d | %-8d | %-10d | %s |\n" "$pillar" "$pages" "$services" "$migrations" "$status"
done

cat <<EOF

## How to read

- ✅ **balanced** — pages, services, and migrations all present. Healthy.
- 🟢 **service without dedicated schema** — common for services that share core tables (sessions, messages). Usually fine.
- 🟡 **UI without service** — page exists but no obvious matching service file. May indicate naming drift.
- 🔴 **backend-only** — service + schema but no user-facing pages. Either elevate (D.1 / D.2 pattern) or delete.

## Cadence

Monthly via \`pnpm run anton:investigate -- --pattern triangle\`.
EOF
