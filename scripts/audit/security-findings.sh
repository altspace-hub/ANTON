#!/usr/bin/env bash
# security-findings.sh — Pattern F.2
# Surfaces hard-coded-secret patterns, routes without obvious auth, and the
# rate-limited / non-rate-limited route ratio. Flags only — no fixes.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Security Findings

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** F.2 (investigation only — triage, do NOT auto-fix)

## 1. Possible hard-coded secrets

Patterns like \`api_key = 'foo'\` or \`password = "bar"\` in non-test code.
EOF
echo ""
echo '```'
grep -rnE "(api_?key|password|secret|token)\s*[=:]\s*['\"][A-Za-z0-9._\-]{8,}['\"]" server/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -v ".test.ts" | grep -v "process.env" | grep -v "// " | head -20 \
  || echo "(none found)"
echo '```'

cat <<EOF

## 2. Routes with no obvious auth/rate-limit middleware

Each route file should reference at least one of: \`requireAuth\`, \`ensureAuth\`,
\`rateLimit\`, \`getAuthHeader\`. Files missing all four are flagged. Some are
intentionally public (visitor surfaces); audit each.
EOF
echo ""
echo '```'
for r in server/routes/*.ts; do
  name=$(basename "$r")
  if ! grep -qE "requireAuth|ensureAuth|rateLimit|rate-limit|auth-middleware|getAuthHeader" "$r" 2>/dev/null; then
    echo "$name"
  fi
done | head -25
echo '```'

cat <<EOF

## 3. Rate-limit coverage

EOF
TOTAL=$(ls server/routes/*.ts 2>/dev/null | wc -l | tr -d ' ')
RL=$(grep -rln --include="*.ts" "rateLimit\|rate-limit" server/routes/ 2>/dev/null | wc -l | tr -d ' ')
echo "**Routes:** ${TOTAL} · **Routes referencing rate-limit:** ${RL} (${RL}/${TOTAL} ≈ $(( RL * 100 / TOTAL ))%)"

cat <<EOF

## 4. \`shell: true\` in spawn (CLAUDE.md anti-pattern)

EOF
echo '```'
grep -rnE "shell:\s*true|spawnSync.*shell" server/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | head -15 || echo "(none — clean!)"
echo '```'

cat <<EOF

## 5. SQL string concatenation

CLAUDE.md mandates parameterised queries only. Detect potential string-concat SQL.
EOF
echo ""
echo '```'
grep -rnE "(SELECT|INSERT|UPDATE|DELETE).*\\\$\{|(\`SELECT|INSERT|UPDATE|DELETE.*\\\$\{)" server/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -v ".test.ts" | head -15 || echo "(none found)"
echo '```'

cat <<EOF

## What to do

Each finding is a flag, not a fix. Triage with the team:

- 🔴 **Hard-coded secret** → rotate immediately + move to env / vault.
- 🟡 **Auth-less route** → confirm intentional (visitor surface) or add auth middleware.
- 🟡 **Low rate-limit coverage** → add a default rate-limit at the global router.
- 🔴 **\`shell: true\`** → rewrite using \`execFile\` with arg array.
- 🔴 **Concatenated SQL** → rewrite as parameterised query.

## Cadence

Quarterly via \`pnpm run anton:investigate -- --pattern security\`.
EOF
