#!/usr/bin/env bash
# code-density.sh — Pattern F.4
# Lists biggest files + most-imported services. Combined: god-service candidates.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Code Density Report

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** F.4

## 1. Largest files (services + pages, >500 lines, top 30)

EOF
echo '```'
find server/services src/pages src/components -name "*.ts" -o -name "*.tsx" 2>/dev/null \
  | xargs wc -l 2>/dev/null | sort -rn | awk '\$1 > 500' | head -30
echo '```'

cat <<EOF

## 2. Most-imported services (god-service candidates)

EOF
echo '```'
grep -rh "from.*services/" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules \
  | sed -E "s|.*services/([^'\"]+)['\"].*|\1|" \
  | sort | uniq -c | sort -rn | head -20
echo '```'

cat <<EOF

## What to do

- A service that's both **>500 lines** AND **>20 imports** is a strong split candidate.
- An import that's lower-frequency (≤5) is fine even if the file is large.
- A small file (<200 lines) with high import count usually doesn't need splitting.

## Cadence

Quarterly.
EOF
