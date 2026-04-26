#!/usr/bin/env bash
# narrative-opportunities.sh — Pattern G.4
# Detects built features without spec docs, bundle types without examples,
# pillars with high page count but low whitepaper coverage.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Narrative Opportunities

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.4 (built but under-narrated)

EOF

echo "## 1. Recent migrations without a spec doc"
echo ""
echo "Migrations where the feature name doesn't appear in any docs/ markdown — possibly under-documented features."
echo ""
echo '```'
{
  for mig in $(ls server/db/migrations-pg/*.sql 2>/dev/null | sort -r | head -30); do
    num=$(basename "$mig" .sql | cut -d_ -f1)
    feature=$(basename "$mig" .sql | cut -d_ -f2- | sed 's/_/ /g')
    feature_slug=$(basename "$mig" .sql | cut -d_ -f2- | sed 's/_/-/g')
    spec=$(grep -rl --include="*.md" "$feature_slug" docs/ 2>/dev/null | wc -l | tr -d ' ')
    if [[ $spec -eq 0 ]]; then
      echo "$num — $feature (no spec doc references the slug \"$feature_slug\")"
    fi
  done
} | head -20
echo '```'

echo ""
echo "## 2. Bundle types without an example payload"
echo ""
echo "From the 45-type \`BundleType\` union in anton-bundler.ts; those without any example file under data/ or examples/."
echo ""
echo '```'
{
  grep -E "^\s*\| '[a-z-]+'" server/services/anton-bundler.ts 2>/dev/null \
    | sed -E "s/.*\| '([a-z-]+)'.*/\1/" \
    | while read -r type; do
        examples=$(find data/ examples/ -iname "*${type}*" 2>/dev/null | wc -l | tr -d ' ')
        if [[ $examples -eq 0 ]]; then
          echo "$type"
        fi
      done
} | head -30
echo '```'

echo ""
echo "## 3. Pillars: page count vs marketing-doc coverage"
echo ""
echo "Pillars with many pages but few/no docs/marketing files."
echo ""
echo '```'
for pillar in work school life pathfinder markets community payments portals missions procure civic grow; do
  pages=$(find src/pages -ipath "*/${pillar}/*" -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
  marketing=$(find docs/marketing -iname "*${pillar}*" 2>/dev/null | wc -l | tr -d ' ')
  status="ok"
  if [[ $pages -ge 3 && $marketing -eq 0 ]]; then status="🔴 under-narrated"
  elif [[ $pages -ge 1 && $marketing -eq 0 ]]; then status="🟡 no marketing"; fi
  printf "%-12s pages:%-3d marketing:%-2d %s\n" "$pillar" "$pages" "$marketing" "$status"
done
echo '```'

echo ""
echo "## How to use this"
echo ""
echo "Each row is a candidate marketing one-pager or example payload. Prioritise by strategic weight (FCP, hardware, school = high; everything else = standard)."
echo ""
echo "## Cadence"
echo ""
echo "Monthly, before any major content push."
