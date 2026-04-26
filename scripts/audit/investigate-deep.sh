#!/usr/bin/env bash
# investigate-deep.sh — Pattern G.9–G.18 + H.1
#
# Deep investigation runner. Where investigate.sh asks "does it exist?",
# this asks "does it work, is it safe, is it sustainable?"
#
# Usage:  pnpm run anton:investigate-deep
#         bash scripts/audit/investigate-deep.sh [--pattern <name>]
#
# Outputs land in docs/audit/deep/ to keep them separate from the surface
# scans in docs/audit/.
#
# Patterns:
#   G.9  sensitive-flow      — sensitive data flow tracing       (stub)
#   G.10 contract-inference  — TS return-type drift              (stub)
#   G.11 db-access           — schema drift / N+1 / index audit  (stub)
#   G.12 prompt-assembly     — 12-layer assembly correctness     (stub)
#   G.13 llm-parity          — provider feature matrix           (stub)
#   G.14 async-audit         — concurrency bugs                  (stub)
#   G.15 error-paths         — silent catches / leakage          (real)
#   G.16 cost-economics      — token spend / spend caps          (stub)
#   G.17 migration-history   — drift / drops / renames           (real)
#   G.18 dead-code           — unimported / unused / unrendered  (real)

set -uo pipefail
cd "$(dirname "$0")/../.."

mkdir -p docs/audit/deep

PATTERN="all"
if [[ "${1:-}" == "--pattern" ]]; then
  PATTERN="${2:-all}"
fi

run_one() {
  local name="$1"
  local script="scripts/audit/deep-${name}.sh"
  local out="docs/audit/deep/${name}.md"
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

echo "ANTON deep-investigation runner"
echo "==============================="
echo "Repo:    $(pwd)"
echo "Branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "Commit:  $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Date:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

case "$PATTERN" in
  all)
    run_one sensitive-flow
    run_one contract-inference
    run_one db-access
    run_one prompt-assembly
    run_one llm-parity
    run_one async-audit
    run_one error-paths
    run_one cost-economics
    run_one migration-history
    run_one dead-code
    # Build the priority queue (H.1) once all audits have run
    if [[ -f scripts/audit/deep-priority-queue.sh ]]; then
      echo "  [run]  priority-queue → docs/audit/deep/_priority-queue.md"
      bash scripts/audit/deep-priority-queue.sh > docs/audit/deep/_priority-queue.md 2>&1 \
        && echo "  [ok]   priority-queue" \
        || echo "  [warn] priority-queue exited non-zero"
    fi
    ;;
  sensitive|sensitive-flow)         run_one sensitive-flow ;;
  contract|contract-inference)      run_one contract-inference ;;
  db|db-access)                     run_one db-access ;;
  prompt|prompt-assembly)           run_one prompt-assembly ;;
  llm|llm-parity)                   run_one llm-parity ;;
  async|async-audit)                run_one async-audit ;;
  error|error-paths)                run_one error-paths ;;
  cost|cost-economics)              run_one cost-economics ;;
  migration|migration-history)      run_one migration-history ;;
  dead|dead-code)                   run_one dead-code ;;
  *)
    echo "Unknown pattern: $PATTERN"
    echo "Valid: all | sensitive | contract | db | prompt | llm | async | error | cost | migration | dead"
    exit 2
    ;;
esac

echo ""
echo "Done. Outputs written to docs/audit/deep/"
