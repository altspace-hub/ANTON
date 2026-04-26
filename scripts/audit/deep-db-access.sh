#!/usr/bin/env bash
# deep-db-access.sh — Pattern G.11 (real)
# Wraps the ts-morph implementation in scripts/audit/deep-db-access.ts.

set -uo pipefail
cd "$(dirname "$0")/../.."

# Cap at 4 minutes — ts-morph type-resolution can be slow on a large codebase.
exec timeout 240 pnpm exec tsx scripts/audit/deep-db-access.ts
