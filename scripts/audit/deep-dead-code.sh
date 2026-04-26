#!/usr/bin/env bash
# deep-dead-code.sh — Pattern G.18
# Dead code candidates: unimported services, unused deps, unrendered components,
# unlinked routes. Every finding is a CANDIDATE — humans decide before deleting.
#
# Implementation notes:
# - Uses BULK passes (one big grep, one big find) then matches in-memory in awk
#   to avoid spawning thousands of subprocesses (cygwin's fork pool would die
#   on the per-file loop variant).

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# G.18 — Dead Code / Unreachable Code Audit

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.18

> **No automatic deletions.** Every finding is a candidate — humans decide.

EOF

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ── Build bulk indexes once ──────────────────────────────────────────────
# All TS/TSX files under server/ and src/
find server/ src/ -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -name "*.test.ts" -not -name "*.test.tsx" -not -name "*.d.ts" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/build/*" \
  > "$TMP/all-files.txt" 2>/dev/null || true

# Extract every `from '...'` import target into one file (line: importer→target)
grep -rhoE "from ['\"][^'\"]+['\"]" server/ src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | sort -u \
  | sed -E "s/from ['\"]//;s/['\"]$//" \
  > "$TMP/import-targets.txt" || true

# ── 1. Unimported service files ──────────────────────────────────────────
echo "## 1. Unimported service files"
echo ""
echo "\`.ts\` files at the top level of \`server/services/\` that no other file in \`server/\` or \`src/\` imports."
echo ""
echo "*Caveat: re-exports through index.ts barrels can hide imports — verify before deleting.*"
echo ""

# All top-level service .ts files
find server/services -maxdepth 1 -name "*.ts" \
  -not -name "*.test.ts" -not -name "*.d.ts" 2>/dev/null \
  | sort > "$TMP/services.txt"

total_services=$(wc -l < "$TMP/services.txt" | tr -d ' ')

# For each service, check if any import-target line ends with its basename
unimported_count=0
> "$TMP/unimported-services.txt"

while IFS= read -r f; do
  base=$(basename "$f" .ts)
  # Match `something/base` or `something/base.js` at end of import string
  if ! grep -qE "/${base}(\.js)?$|^${base}(\.js)?$" "$TMP/import-targets.txt"; then
    echo "$f" >> "$TMP/unimported-services.txt"
    unimported_count=$((unimported_count + 1))
  fi
done < "$TMP/services.txt"

echo "**Scanned:** ${total_services} top-level service files. **Unimported candidates:** ${unimported_count}"
echo ""
if [[ "$unimported_count" = "0" ]]; then
  echo "✅ Every top-level service file is imported somewhere."
else
  echo "Top-level service files with zero imports:"
  echo '```'
  head -40 "$TMP/unimported-services.txt"
  if [[ "$unimported_count" -gt 40 ]]; then echo "  ... + $((unimported_count - 40)) more"; fi
  echo '```'
  echo ""
  echo "**Severity:** MEDIUM (likely dead, verify each)."
fi
echo ""

# ── 2. Unrendered React components ───────────────────────────────────────
echo "## 2. Unrendered React components"
echo ""
echo "\`.tsx\` components in \`src/components/\` whose name never appears as a JSX tag (\`<Name\`) in any other file."
echo ""
echo "*Caveat: dynamic imports + storybook-only components show as unrendered — verify.*"
echo ""

# Build component-name list per file
> "$TMP/components.txt"
> "$TMP/component-names.txt"
while IFS= read -r cmp; do
  name=$(grep -oE "(export default function|export function|export const) [A-Z][a-zA-Z0-9_]*" "$cmp" 2>/dev/null \
    | head -1 \
    | awk '{print $NF}')
  if [[ -z "$name" ]]; then name=$(basename "$cmp" .tsx); fi
  case "$name" in
    Component|Page|Index|App) continue ;;
  esac
  echo "$cmp|$name" >> "$TMP/components.txt"
  echo "$name" >> "$TMP/component-names.txt"
done < <(find src/components -name "*.tsx" -not -name "*.test.tsx" -not -name "*.stories.tsx" 2>/dev/null)

total_components=$(wc -l < "$TMP/components.txt" | tr -d ' ')

# One bulk grep across all .tsx for `<Name` patterns. Grep -o outputs each match.
# Then sort -u and use comm to find names that NEVER appear.
grep -rhoE "<[A-Z][a-zA-Z0-9_]+" src/ --include="*.tsx" 2>/dev/null \
  | sed 's/^<//' \
  | sort -u > "$TMP/jsx-tags.txt"

> "$TMP/unrendered-components.txt"
unrendered_count=0
while IFS='|' read -r cmp name; do
  if ! grep -qx "$name" "$TMP/jsx-tags.txt"; then
    echo "$cmp ($name)" >> "$TMP/unrendered-components.txt"
    unrendered_count=$((unrendered_count + 1))
  fi
done < "$TMP/components.txt"

echo "**Scanned:** ${total_components} components. **Unrendered candidates:** ${unrendered_count}"
echo ""
if [[ "$unrendered_count" = "0" ]]; then
  echo "✅ Every component is rendered somewhere."
else
  echo "Components with no JSX usage:"
  echo '```'
  head -30 "$TMP/unrendered-components.txt"
  if [[ "$unrendered_count" -gt 30 ]]; then echo "  ... + $((unrendered_count - 30)) more"; fi
  echo '```'
  echo ""
  echo "**Severity:** LOW (might be admin-only or pending wiring; humans decide)."
fi
echo ""

# ── 3. Unlinked routes ───────────────────────────────────────────────────
echo "## 3. Unlinked routes"
echo ""
echo "Backend routes in \`server/routes/\` whose URL never appears in frontend code (\`src/\`)."
echo ""
echo "*Caveats:*"
echo "*- Routes are registered relative to their mount prefix (e.g. \`router.get('/:id/documents')\` mounted at \`/api/engagements\` becomes \`/api/engagements/:id/documents\`). This script doesn't reconstruct the full URL, so it overcounts.*"
echo "*- API-only routes (server-to-server, agent connectors, admin endpoints) are legitimately unlinked.*"
echo "*- Use this section as a starting set; real triage requires reading \`server/index.ts\` to map mount prefixes.*"
echo ""

# Extract route paths in a single pass
grep -rhE "router\.(get|post|put|delete|patch)\(\s*['\"][^'\"]+['\"]" server/routes/ --include="*.ts" 2>/dev/null \
  | grep -oE "['\"][^'\"]+['\"]" \
  | head -1000 \
  | tr -d "'\"" \
  | grep -E "^/" \
  | grep -vE "^(/|/:id|/:slug)$" \
  | sort -u > "$TMP/routes.txt"

# Bulk-extract every quoted path-like string from frontend
grep -rhoE "['\"]/api/[^'\"]+['\"]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | tr -d "'\"" \
  | sort -u > "$TMP/frontend-paths.txt"
grep -rhoE "['\"]/[a-z][^'\"]+['\"]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | tr -d "'\"" \
  | sort -u >> "$TMP/frontend-paths.txt"

total_routes=$(wc -l < "$TMP/routes.txt" | tr -d ' ')
unlinked_count=0
> "$TMP/unlinked-routes.txt"

while IFS= read -r route; do
  # Routes typically registered without /api prefix; frontend calls /api/<route>.
  # Normalise both for matching.
  route_no_slash="${route#/}"
  # A route is "linked" if any frontend path contains the route path (modulo leading /api).
  if ! grep -qE "(api/)?${route_no_slash//\//\\/}" "$TMP/frontend-paths.txt"; then
    echo "$route" >> "$TMP/unlinked-routes.txt"
    unlinked_count=$((unlinked_count + 1))
  fi
done < "$TMP/routes.txt"

echo "**Routes scanned:** ${total_routes}. **Unlinked candidates:** ${unlinked_count}"
echo ""
if [[ "$unlinked_count" = "0" ]]; then
  echo "✅ Every route is referenced in frontend code."
else
  echo "Routes with no frontend reference:"
  echo '```'
  head -40 "$TMP/unlinked-routes.txt"
  if [[ "$unlinked_count" -gt 40 ]]; then echo "  ... + $((unlinked_count - 40)) more"; fi
  echo '```'
  echo ""
  echo "**Severity:** LOW (server-to-server routes, agent connectors, admin endpoints are legitimately unlinked)."
fi
echo ""

# ── 4. Unused npm dependencies (depcheck) ────────────────────────────────
echo "## 4. Unused npm dependencies"
echo ""
echo "Per \`npx depcheck\`. Each one is a real cost (bundle size, install time, security surface)."
echo ""

# depcheck can be slow on big repos; cap at 90s.
depcheck_out=$(timeout 90 npx -y depcheck --json 2>/dev/null || echo "")

if [[ -z "$depcheck_out" ]]; then
  echo "⚠️ depcheck timed out or returned empty (re-run manually with \`npx depcheck\`)."
else
  unused_deps=$(echo "$depcheck_out" | grep -oE '"dependencies":\[[^]]*\]' | head -1 || true)
  unused_dev_deps=$(echo "$depcheck_out" | grep -oE '"devDependencies":\[[^]]*\]' | head -1 || true)

  if [[ "$unused_deps" = "\"dependencies\":[]" && "$unused_dev_deps" = "\"devDependencies\":[]" ]]; then
    echo "✅ depcheck reports no unused dependencies."
  else
    echo "**Unused dependencies (reported by depcheck):**"
    echo '```json'
    echo "$unused_deps" | sed 's/,/,\n  /g' | head -30
    echo '```'
    echo ""
    echo "**Unused devDependencies:**"
    echo '```json'
    echo "$unused_dev_deps" | sed 's/,/,\n  /g' | head -30
    echo '```'
    echo ""
    echo "**Severity:** HIGH (real cost — bundle size, security surface). Verify each isn't a peer-dep / runtime-only / dynamic require."
  fi
fi
echo ""

# ── 5. Lazy-loaded pages with no Route registered ────────────────────────
echo "## 5. Lazy-loaded pages with no \`<Route>\` registered"
echo ""
echo "\`React.lazy(() => import('./pages/Foo'))\` declarations whose component name never appears as a \`<Route element={...}>\` target."
echo ""

# Single-pass extraction from App.tsx
> "$TMP/lazy-names.txt"
grep -E "^const [A-Z][a-zA-Z0-9_]* = lazy" src/App.tsx 2>/dev/null \
  | awk '{print $2}' \
  | sort -u > "$TMP/lazy-names.txt"

# All JSX tag names mentioned in App.tsx
grep -oE "<[A-Z][a-zA-Z0-9_]+" src/App.tsx 2>/dev/null \
  | sed 's/^<//' \
  | sort -u > "$TMP/app-tsx-tags.txt"

total_lazy=$(wc -l < "$TMP/lazy-names.txt" | tr -d ' ')
unrouted_count=0
> "$TMP/unrouted-pages.txt"

while IFS= read -r name; do
  if ! grep -qx "$name" "$TMP/app-tsx-tags.txt"; then
    echo "$name" >> "$TMP/unrouted-pages.txt"
    unrouted_count=$((unrouted_count + 1))
  fi
done < "$TMP/lazy-names.txt"

echo "**Lazy declarations scanned:** ${total_lazy}. **Unrouted candidates:** ${unrouted_count}"
echo ""
if [[ "$unrouted_count" = "0" ]]; then
  echo "✅ Every lazy import is registered as a Route."
else
  echo "Lazy components with no JSX usage in App.tsx:"
  echo '```'
  head -30 "$TMP/unrouted-pages.txt"
  echo '```'
  echo ""
  echo "**Severity:** MEDIUM (the import incurs bundle cost without serving any URL)."
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
echo "---"
echo ""
echo "## Summary"
echo ""
echo "| Check | Count |"
echo "|---|---|"
echo "| Top-level services scanned | ${total_services} |"
echo "| → unimported candidates | **${unimported_count}** |"
echo "| Components scanned | ${total_components} |"
echo "| → unrendered candidates | **${unrendered_count}** |"
echo "| Routes scanned | ${total_routes} |"
echo "| → unlinked candidates | **${unlinked_count}** |"
echo "| Lazy imports scanned | ${total_lazy} |"
echo "| → unrouted candidates | **${unrouted_count}** |"
echo ""
echo "**Cadence:** quarterly + pre-release + before any major refactor (per addendum §G.18)."
echo ""
echo "**Acceptance:** every finding is a *candidate*, not an action. Each candidate gets a 'delete or document' decision before any code is removed."
