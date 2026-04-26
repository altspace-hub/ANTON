#!/usr/bin/env bash
# pillar-maturity.sh — Pattern G.8 v2.
# Thin wrapper that delegates to pillar-maturity.ts (TypeScript implementation
# with proper recursive directory walking + multi-strategy discovery).

set -uo pipefail
cd "$(dirname "$0")/../.."

exec pnpm exec tsx scripts/audit/pillar-maturity.ts "$@"
