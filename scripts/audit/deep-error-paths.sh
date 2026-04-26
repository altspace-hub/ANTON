#!/usr/bin/env bash
# deep-error-paths.sh — Pattern G.15
# Error path audit: silent catches, stack-trace leakage, missing route middleware.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# G.15 — Error Path Audit

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.15

> Silent error handling is where bugs hide. The happy path is tested; the
> error path rarely is. This audit surfaces where errors are swallowed,
> rethrown without context, or leaked to clients.

EOF

# ── 1. Silent catches: catch {} or catch (e) {} ─────────────────────────
echo "## 1. Silent catches"
echo ""
echo "\`catch {}\` or \`catch (e) {}\` blocks with no log, no rethrow, no recovery —"
echo "errors disappear without trace."
echo ""

# Multi-line aware: a catch block where the body is empty (or only contains
# whitespace) up to the closing brace. Use Grep with multiline matching.
# Bash equivalent: capture each "} catch ... {" line + the next non-blank line.
# Simpler: grep for the empty-body single-line form first, then surface multi-line via context.

# Single-line empty catch
single_line_count=$(grep -rE "catch\s*(\([a-zA-Z_][a-zA-Z0-9_]*\)|\(\)|)\s*\{\s*\}" \
  server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -vE "(test\.ts|test\.tsx|node_modules|dist/|build/)" \
  | wc -l | tr -d ' ')

echo "**Single-line empty catches:** ${single_line_count}"
echo ""
if [[ "$single_line_count" -gt 0 ]]; then
  echo "Top 30 occurrences (file:line):"
  echo '```'
  grep -rnE "catch\s*(\([a-zA-Z_][a-zA-Z0-9_]*\)|\(\)|)\s*\{\s*\}" \
    server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -vE "(test\.ts|test\.tsx|node_modules|dist/|build/)" \
    | head -30
  echo '```'
  echo ""
  echo "**Severity:** HIGH if in critical path (orchestrator, prompt-builder, AAP, bundle-export); MEDIUM elsewhere."
fi
echo ""

# Multi-line empty catch — catch block with comment-only or whitespace-only body
echo "### Multi-line empty/comment-only catch blocks"
echo ""
echo "Catches whose body is just \`/* ignore */\` or whitespace-equivalent — same problem."
echo ""

# Match `catch (...) {` followed by 1-3 lines containing only comments or whitespace, then `}`
multiline_silent=$(grep -rnE "catch\s*\([^)]*\)\s*\{\s*(/\*[^*]*\*/|//.*)?\s*$" \
  server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -vE "(test\.ts|test\.tsx|node_modules)" \
  | head -30 || true)

if [[ -z "$multiline_silent" ]]; then
  echo "✅ No obvious comment-only catch openings detected (heuristic)."
else
  echo '```'
  echo "$multiline_silent"
  echo '```'
fi
echo ""

# ── 2. Stack-trace leakage to client ─────────────────────────────────────
echo "## 2. Stack-trace leakage to HTTP response"
echo ""
echo "Routes that return \`err.stack\` or whole error objects to the client. Info disclosure."
echo ""

# Patterns: res.json({ error: err.stack }) / res.json(err) / res.send(err) / json: error: err.message + stack ref
leak_count=$(grep -rnE "res\.(json|send)\(.*(err|error)\.stack" \
  server/routes/ server/middleware/ --include="*.ts" 2>/dev/null \
  | grep -vE "(test\.ts|node_modules)" \
  | wc -l | tr -d ' ')
direct_err_count=$(grep -rnE "res\.(json|send)\(\s*(err|e)\s*\)" \
  server/routes/ server/middleware/ --include="*.ts" 2>/dev/null \
  | grep -vE "(test\.ts|node_modules)" \
  | wc -l | tr -d ' ')

if [[ "$leak_count" = "0" && "$direct_err_count" = "0" ]]; then
  echo "✅ No HTTP responses found that return raw error stacks."
else
  echo "**Stack-leak findings:** ${leak_count}; **Raw-error findings:** ${direct_err_count}"
  echo ""
  if [[ "$leak_count" -gt 0 ]]; then
    echo "Stack leaks:"
    echo '```'
    grep -rnE "res\.(json|send)\(.*(err|error)\.stack" \
      server/routes/ server/middleware/ --include="*.ts" 2>/dev/null \
      | grep -vE "(test\.ts|node_modules)" \
      | head -20
    echo '```'
  fi
  if [[ "$direct_err_count" -gt 0 ]]; then
    echo "Raw error sent:"
    echo '```'
    grep -rnE "res\.(json|send)\(\s*(err|e)\s*\)" \
      server/routes/ server/middleware/ --include="*.ts" 2>/dev/null \
      | grep -vE "(test\.ts|node_modules)" \
      | head -20
    echo '```'
  fi
  echo ""
  echo "**Severity:** HIGH (info disclosure — stack traces reveal file paths, internal types, library versions)."
fi
echo ""

# ── 3. Routes without error handling ─────────────────────────────────────
echo "## 3. Async routes without try/catch or .catch(next)"
echo ""
echo "An \`async (req, res) => { ... }\` handler with no try/catch produces an unhandled rejection on throw."
echo "Express ≤4 doesn't catch these automatically; the rejection bubbles to process and the client sees a hung connection."
echo ""

# Find async route handlers, then for each, check if its body contains try { or .catch(
# Heuristic: count async route declarations vs. those with try/catch in the same file
total_async_routes=$(grep -rE "router\.(get|post|put|delete|patch)\(\s*['\"][^'\"]+['\"]\s*,\s*(async\s*\(|.*async\s*\()" \
  server/routes/ --include="*.ts" 2>/dev/null \
  | grep -vE "(test\.ts|node_modules)" \
  | wc -l | tr -d ' ')

# Files that DO contain async routes
async_route_files=$(grep -rlE "router\.(get|post|put|delete|patch)\(\s*['\"][^'\"]+['\"]\s*,\s*(async\s*\(|.*async\s*\()" \
  server/routes/ --include="*.ts" 2>/dev/null \
  | grep -vE "(test\.ts|node_modules)" \
  | sort -u)

# Of those, files with no `try {` and no `.catch(` and no asyncHandler import
risky_files=""
risky_count=0
for f in $async_route_files; do
  if ! grep -qE "try\s*\{|\.catch\(|asyncHandler|express-async-errors" "$f" 2>/dev/null; then
    risky_files="$risky_files\n  $f"
    risky_count=$((risky_count + 1))
  fi
done

echo "**Async route handlers found:** ${total_async_routes}"
echo "**Files with async routes but no try/catch / .catch / asyncHandler:** ${risky_count}"
echo ""
if [[ "$risky_count" = "0" ]]; then
  echo "✅ Every async-route file has at least some error handling."
else
  echo '```'
  echo -e "$risky_files" | grep -v '^$' | head -20
  if [[ "$risky_count" -gt 20 ]]; then echo "  ... + $((risky_count - 20)) more"; fi
  echo '```'
  echo ""
  echo "**Severity:** MEDIUM. Express may have global error middleware catching these — verify by reading \`server/index.ts\`."
fi
echo ""

# ── 4. catch (e: any) — type narrowing skipped ──────────────────────────
echo "## 4. \`catch (e: any)\` — type narrowing skipped"
echo ""
echo "Catches typed as \`any\` skip the proper unknown→narrow flow. TypeScript 4.4+ defaults to \`unknown\`; \`any\` is an explicit override."
echo ""

any_catch_count=$(grep -rnE "catch\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*any\s*\)" \
  server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -vE "(test\.ts|test\.tsx|node_modules)" \
  | wc -l | tr -d ' ')

if [[ "$any_catch_count" = "0" ]]; then
  echo "✅ No \`catch (e: any)\` declarations."
else
  echo "**Count:** ${any_catch_count}"
  echo ""
  echo "Top 20:"
  echo '```'
  grep -rnE "catch\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*any\s*\)" \
    server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -vE "(test\.ts|test\.tsx|node_modules)" \
    | head -20
  echo '```'
  echo ""
  echo "**Severity:** LOW (typing debt; replace with \`catch (e: unknown)\` + narrow with \`if (e instanceof Error)\`)."
fi
echo ""

# ── 5. throw new Error(e.message) — stack-trace loss ────────────────────
echo "## 5. \`throw new Error(e.message)\` — stack-trace loss"
echo ""
echo "Rethrowing without \`{ cause: e }\` (Node 16.9+) loses the original stack. Debugging gets much harder."
echo ""

rethrow_count=$(grep -rnE "throw new Error\([a-zA-Z_][a-zA-Z0-9_]*\.message\)" \
  server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -vE "(test\.ts|test\.tsx|node_modules)" \
  | wc -l | tr -d ' ')

if [[ "$rethrow_count" = "0" ]]; then
  echo "✅ No bare \`throw new Error(e.message)\` rethrows found."
else
  echo "**Count:** ${rethrow_count}"
  echo ""
  echo "Top 20:"
  echo '```'
  grep -rnE "throw new Error\([a-zA-Z_][a-zA-Z0-9_]*\.message\)" \
    server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -vE "(test\.ts|test\.tsx|node_modules)" \
    | head -20
  echo '```'
  echo ""
  echo "**Severity:** MEDIUM. Use \`throw new Error('context', { cause: e })\` to preserve the stack chain."
fi
echo ""

# ── 6. Critical-path silent catches ─────────────────────────────────────
echo "## 6. Critical-path silent catches (intersection of §1 and high-stakes services)"
echo ""
echo "Silent catches in services where they're most dangerous: the orchestrator, prompt-builder,"
echo "bundle-export, AAP transport, and credential-vault paths."
echo ""

critical_paths="server/services/orchestrator-engine.ts server/services/prompt-builder.ts server/services/anton-bundler.ts server/services/aap-rollout-bridge.ts server/services/credential-vault.ts server/services/agent-processor.ts"
critical_findings=""
for f in $critical_paths; do
  if [[ ! -f "$f" ]]; then continue; fi
  hits=$(grep -nE "catch\s*(\([a-zA-Z_][a-zA-Z0-9_]*\)|\(\)|)\s*\{\s*\}" "$f" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    critical_findings="$critical_findings\n### $f\n\`\`\`\n$hits\n\`\`\`\n"
  fi
done

if [[ -z "$critical_findings" ]]; then
  echo "✅ No silent catches in critical-path files."
else
  echo -e "$critical_findings"
  echo ""
  echo "**Severity:** HIGH for any finding here — these paths are where silent failure is most damaging."
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
echo "---"
echo ""
echo "## Summary"
echo ""
echo "| Check | Count | Severity |"
echo "|---|---|---|"
echo "| Single-line empty catches | ${single_line_count} | HIGH if critical-path |"
echo "| Stack-trace leaks | ${leak_count} | HIGH |"
echo "| Raw error responses | ${direct_err_count} | HIGH |"
echo "| Async-route files with no error handling | ${risky_count} | MEDIUM |"
echo "| \`catch (e: any)\` | ${any_catch_count} | LOW |"
echo "| Rethrow without \`{ cause: e }\` | ${rethrow_count} | MEDIUM |"
echo ""
echo "**Cadence:** weekly + pre-release (per addendum §G.15)."
