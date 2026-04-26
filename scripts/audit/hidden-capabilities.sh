#!/usr/bin/env bash
# hidden-capabilities.sh — Pattern G.2
# Detects services with backend wiring but no marketing or user-facing surface.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Hidden Capabilities Report

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.2 (services with backend wiring but no surface)

For each service file: counts how many routes / pages / marketing docs reference it.
**Hidden** = referenced from routes (i.e. wired) but absent from \`docs/marketing/\`.

## Hidden services (high elevation potential)

| Service | Routes | Pages | Marketing | Status |
|---|---|---|---|---|
EOF

while IFS= read -r svc; do
  [[ -z "$svc" ]] && continue
  base=$(basename "$svc" .ts)
  routes=$(grep -rl --include="*.ts" "$base" server/routes/ 2>/dev/null | wc -l | tr -d ' ')
  pages=$(grep -rl --include="*.tsx" --include="*.ts" "$base" src/pages/ 2>/dev/null | wc -l | tr -d ' ')
  marketing=$(grep -rl --include="*.md" "$base" docs/marketing/ 2>/dev/null | wc -l | tr -d ' ')
  if [[ $routes -gt 0 && $marketing -eq 0 ]]; then
    if [[ $pages -gt 0 ]]; then
      status="🟡 wired, no marketing"
    else
      status="🔴 backend-only"
    fi
    echo "| \`$base\` | $routes | $pages | $marketing | $status |"
  fi
done < <(find server/services -name "*.ts" -not -name "*.test.ts" 2>/dev/null) \
  | sort -t'|' -k2 -rn | head -30

echo ""
echo "## How to use this"
echo ""
echo "- 🔴 **backend-only** services with multiple route hits are major candidates for elevation — they're built features without UI or narrative."
echo "- 🟡 **wired, no marketing** = there's a UI surface but the asset isn't documented for users."
echo ""
echo "Promote → ship a marketing one-pager OR delete (per the brief's \"delete or document\" rule)."
echo ""
echo "## Cadence"
echo ""
echo "Monthly via \`pnpm run anton:investigate -- --pattern hidden\`."
