#!/usr/bin/env bash
# quality-smells.sh — Pattern G.3
# Detects code-quality smells: TODO/FIXME density, oversized files, untested
# services, error-swallowing, console.log leftovers, hard-coded URLs.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Quality Smells Report

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.3 (quality smell detection)

Severity: error swallowing > console.log in prod > TODO density > file size.
EOF

echo ""
echo "## 1. Error swallowing (\`catch (...) {}\`)"
echo ""
echo "Empty catch blocks silently drop errors. Top offenders:"
echo ""
echo '```'
grep -rnE "catch\s*\([^)]*\)\s*\{\s*\}" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules | head -20 || echo "(none — clean!)"
echo '```'

echo ""
echo "## 2. \`console.log\` / \`console.warn\` in production code"
echo ""
echo "These should be removed or replaced by structured logging. CLAUDE.md anti-pattern §6."
echo ""
COUNT=$(grep -rnE "console\.(log|warn)" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules | grep -v "/test" | grep -v ".test.ts" | wc -l | tr -d ' ')
echo "**Total occurrences:** ${COUNT}"
echo ""
echo "Top files by count:"
echo ""
echo '```'
grep -rnE "console\.(log|warn)" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules | grep -v "/test" | grep -v ".test.ts" \
  | sed 's|:[0-9]*:.*||' | sort | uniq -c | sort -rn | head -15
echo '```'

echo ""
echo "## 3. TODO / FIXME / HACK / XXX density"
echo ""
TODO_COUNT=$(grep -rnE "TODO|FIXME|HACK|XXX" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules | wc -l | tr -d ' ')
echo "**Total markers:** ${TODO_COUNT}"
echo ""
echo "Top files:"
echo ""
echo '```'
grep -rnE "TODO|FIXME|HACK|XXX" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules \
  | sed 's|:[0-9]*:.*||' | sort | uniq -c | sort -rn | head -15
echo '```'

echo ""
echo "## 4. Files over 500 lines"
echo ""
echo "Candidates for split per CLAUDE.md anti-pattern (god services)."
echo ""
echo '```'
find server/services src/pages src/components -name "*.ts" -o -name "*.tsx" 2>/dev/null \
  | xargs wc -l 2>/dev/null | sort -rn | awk '$1 > 500' | head -25
echo '```'

echo ""
echo "## 5. Hard-coded HTTP(S) URLs in server code"
echo ""
echo "Should be env vars or config — CLAUDE.md anti-pattern §6."
echo ""
echo '```'
grep -rnE "https?://" server/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -v "localhost" | grep -v ".test.ts" \
  | head -20
echo '```'

echo ""
echo "## 6. Untested service files"
echo ""
SERVICES_TOTAL=$(find server/services -name "*.ts" -not -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
TESTS_COUNT=$(find tests -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "**Services:** ${SERVICES_TOTAL} · **Test files:** ${TESTS_COUNT}"
echo ""
echo "Service basenames without a corresponding \`<basename>.test.ts\` anywhere under tests/:"
echo ""
echo '```'
{
  for svc in $(find server/services -name "*.ts" -not -name "*.test.ts" 2>/dev/null); do
    base=$(basename "$svc" .ts)
    if ! grep -rln "${base}.test.ts" tests/ >/dev/null 2>&1; then
      echo "$svc"
    fi
  done
} | head -30
echo '```'

echo ""
echo "## Cadence"
echo ""
echo "Run weekly via \`pnpm run anton:investigate -- --pattern quality\`."
