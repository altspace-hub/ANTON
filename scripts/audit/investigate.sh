#!/usr/bin/env bash
# investigate.sh — runs all seven self-investigation patterns and writes
# outputs to docs/audit/. Defined in ANTON_Improvement_and_Investigation_Brief.md
# Part G.7.
#
# Usage: pnpm run anton:investigate
#        # or directly:
#        bash scripts/audit/investigate.sh [--pattern <name>]
#
# Patterns: drift hidden quality narrative anti-patterns triangle
# Pass --pattern <name> to run a single pattern; omit to run all.

set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p docs/audit

# Parse a single optional --pattern arg
PATTERN="${2:-all}"
if [[ "${1:-}" == "--pattern" ]]; then
  PATTERN="${2:-all}"
fi

run_one() {
  local name="$1"
  local script="scripts/audit/${name}.sh"
  local out="docs/audit/${name}.md"
  if [[ ! -f "$script" ]]; then
    echo "  [skip] $name — script not found at $script"
    return
  fi
  echo "  [run]  $name → $out"
  if bash "$script" > "$out" 2>&1; then
    echo "  [ok]   $name"
  else
    echo "  [warn] $name exited non-zero — check $out"
  fi
}

echo "ANTON investigation runner"
echo "=========================="
echo "Repo:    $(pwd)"
echo "Branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "Commit:  $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Date:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

case "$PATTERN" in
  all)
    run_one drift-report
    run_one hidden-capabilities
    run_one quality-smells
    run_one narrative-opportunities
    run_one anti-patterns
    run_one triangle-check
    # Part F (deeper investigation pass — quarterly cadence)
    run_one test-coverage
    run_one security-findings
    run_one performance-hotpaths
    run_one code-density
    # Pattern G.8 (Addendum 1 — pillar maturity)
    run_one pillar-maturity
    ;;
  drift|drift-report)        run_one drift-report ;;
  hidden|hidden-capabilities) run_one hidden-capabilities ;;
  quality|quality-smells)    run_one quality-smells ;;
  narrative|narrative-opportunities) run_one narrative-opportunities ;;
  anti|anti-patterns)        run_one anti-patterns ;;
  triangle|triangle-check)   run_one triangle-check ;;
  test|test-coverage)        run_one test-coverage ;;
  security|security-findings) run_one security-findings ;;
  performance|perf|performance-hotpaths) run_one performance-hotpaths ;;
  density|code-density)      run_one code-density ;;
  maturity|pillar-maturity)  run_one pillar-maturity ;;
  *)
    echo "Unknown pattern: $PATTERN"
    echo "Valid: all | drift | hidden | quality | narrative | anti | triangle | test | security | performance | density | maturity"
    exit 2
    ;;
esac

echo ""
echo "Done. Outputs written to docs/audit/"
