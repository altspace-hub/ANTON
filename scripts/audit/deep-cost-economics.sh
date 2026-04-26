#!/usr/bin/env bash
# deep-cost-economics.sh — Pattern G.16 (real)
# Wraps the ts-morph implementation in scripts/audit/deep-cost-economics.ts.

set -uo pipefail
cd "$(dirname "$0")/../.."

exec timeout 240 pnpm exec tsx scripts/audit/deep-cost-economics.ts
