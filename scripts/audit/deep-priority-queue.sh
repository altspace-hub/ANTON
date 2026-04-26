#!/usr/bin/env bash
# deep-priority-queue.sh — Pattern H.1
# Aggregator: reads all docs/audit/deep/*.md outputs, parses findings,
# scores them, writes top 20 to _priority-queue.md.

set -uo pipefail
cd "$(dirname "$0")/../.."

exec timeout 60 pnpm exec tsx scripts/audit/deep-priority-queue.ts
