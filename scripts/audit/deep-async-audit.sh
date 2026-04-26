#!/usr/bin/env bash
# deep-async-audit.sh — Pattern G.14 (real)
# Wraps the ts-morph implementation in scripts/audit/deep-async-audit.ts.

set -uo pipefail
cd "$(dirname "$0")/../.."

# Cap at 5 minutes — ts-morph type-resolution on src/ + server/ is ~120s on this codebase.
exec timeout 300 pnpm exec tsx scripts/audit/deep-async-audit.ts
