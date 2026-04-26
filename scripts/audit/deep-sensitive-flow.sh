#!/usr/bin/env bash
# deep-sensitive-flow.sh — Pattern G.9 (real)
# Wraps the ts-morph implementation in scripts/audit/deep-sensitive-flow.ts.

set -uo pipefail
cd "$(dirname "$0")/../.."

exec timeout 240 pnpm exec tsx scripts/audit/deep-sensitive-flow.ts
