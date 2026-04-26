#!/usr/bin/env bash
# deep-migration-history.sh — Pattern G.17
# Migration history audit: real drops, real renames, drift, sequence gaps.
#
# Distinguishes "swap" patterns (DROP x → RENAME x_new TO x; or RENAME table → CREATE table)
# from real drops where the name is gone for good. Only flags the latter.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

MIG_DIR="server/db/migrations-pg"

cat <<EOF
# G.17 — Migration History Audit

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.17

EOF

total_migs=$(ls "$MIG_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "**Migrations scanned:** ${total_migs} files in \`${MIG_DIR}/\`"
echo ""

# ── 1. Naming consistency ────────────────────────────────────────────────
echo "## 1. Naming consistency"
echo ""
echo "Convention: \`NNN_lower_snake_case.sql\`."
echo ""
bad_names=$(ls "$MIG_DIR" 2>/dev/null \
  | grep -v "README" \
  | grep -vE "^[0-9]{3}_[a-z0-9_]+\.sql$" || true)
if [[ -z "$bad_names" ]]; then
  echo "✅ All migration filenames follow the convention."
else
  echo "⚠️ Files NOT matching the convention:"
  echo '```'
  echo "$bad_names"
  echo '```'
fi
echo ""

# ── 2. Sequence gaps + duplicates ────────────────────────────────────────
echo "## 2. Sequence gaps + duplicate numbers"
echo ""
nums=$(ls "$MIG_DIR"/*.sql 2>/dev/null | xargs -n1 basename | grep -oE "^[0-9]{3}" | sort -n)
duplicates=$(echo "$nums" | sort | uniq -d || true)

if [[ -n "$duplicates" ]]; then
  echo "❌ **HIGH:** duplicate migration numbers detected:"
  echo '```'
  for n in $duplicates; do
    echo "  $n appears in:"
    ls "$MIG_DIR"/${n}_*.sql 2>/dev/null | sed 's/^/    /'
  done
  echo '```'
else
  echo "✅ No duplicate migration numbers."
fi
echo ""

first=$(echo "$nums" | head -1)
last=$(echo "$nums" | tail -1)
gaps=""
prev=""
for n in $nums; do
  if [[ -n "$prev" ]]; then
    expected=$((10#$prev + 1))
    while [[ $expected -lt $((10#$n)) ]]; do
      gaps="$gaps $(printf '%03d' $expected)"
      expected=$((expected + 1))
    done
  fi
  prev=$n
done

if [[ -n "$gaps" ]]; then
  gap_count=$(echo "$gaps" | tr ' ' '\n' | grep -v '^$' | wc -l | tr -d ' ')
  echo "ℹ️ **${gap_count} sequence gap(s)** between ${first} and ${last}:"
  echo '```'
  echo "$gaps" | tr ' ' '\n' | grep -v '^$' | head -50
  if [[ "$gap_count" -gt 50 ]]; then echo "  ... + $((gap_count - 50)) more"; fi
  echo '```'
  echo ""
  echo "Gaps usually mean migrations were renumbered or removed. Acceptable but worth confirming none represent lost work."
else
  echo "✅ No sequence gaps."
fi
echo ""

# ── 3. Real DROPs (excluding swap patterns) ──────────────────────────────
echo "## 3. Dropped columns / tables — still referenced?"
echo ""
echo "**Swap patterns excluded:** \`DROP COLUMN x; RENAME COLUMN x_new TO x\` and"
echo "\`ALTER TABLE x RENAME TO x_old; CREATE TABLE x ...\` are swaps, not real drops —"
echo "the name still exists after the migration. Only **real** drops are flagged."
echo ""

drop_findings=""
drop_clean=0
drop_swap=0

while read -r mig; do
  short_mig=$(basename "$mig")
  # All names being dropped in this migration
  drop_cols=$(grep -oiE "DROP COLUMN[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  drop_tbls=$(grep -oiE "DROP TABLE[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)

  # All names that are CREATEd or RENAMEd-TO in this same migration (post-migration "live" names)
  created_tbls=$(grep -oiE "CREATE TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  renamed_to=$(grep -oiE "RENAME (COLUMN[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]+)?TO[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  live_names="$created_tbls $renamed_to"

  for col in $drop_cols; do
    case "$col" in EXISTS) continue ;; esac
    # Swap pattern: same name reappears via RENAME TO
    if echo "$live_names" | tr ' ' '\n' | grep -qx "$col"; then
      drop_swap=$((drop_swap + 1))
      continue
    fi
    refs=$(grep -rln "\\b${col}\\b" server/services/ server/routes/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
      | grep -vE "(test\.ts|test\.tsx|node_modules)" \
      | wc -l | tr -d ' ')
    if [[ "$refs" -gt 0 ]]; then
      drop_findings="$drop_findings\n- ❌ **HIGH:** \`$short_mig\` drops column \`$col\` — **$refs reference(s) remain**"
    else
      drop_clean=$((drop_clean + 1))
    fi
  done

  for tbl in $drop_tbls; do
    case "$tbl" in EXISTS) continue ;; esac
    if echo "$live_names" | tr ' ' '\n' | grep -qx "$tbl"; then
      drop_swap=$((drop_swap + 1))
      continue
    fi
    refs=$(grep -rln "\\b${tbl}\\b" server/services/ server/routes/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
      | grep -vE "(test\.ts|test\.tsx|node_modules)" \
      | wc -l | tr -d ' ')
    if [[ "$refs" -gt 0 ]]; then
      drop_findings="$drop_findings\n- ❌ **HIGH:** \`$short_mig\` drops table \`$tbl\` — **$refs reference(s) remain**"
    else
      drop_clean=$((drop_clean + 1))
    fi
  done
done < <(grep -lE "DROP (COLUMN|TABLE)" "$MIG_DIR"/*.sql 2>/dev/null || true)

if [[ -z "$drop_findings" ]]; then
  echo "✅ No real drops with stale references."
else
  echo -e "$drop_findings"
fi
echo ""
echo "- Real clean drops (name gone, no refs): **$drop_clean**"
echo "- Swap drops excluded (name reused in same migration): **$drop_swap**"
echo ""

# ── 4. Real RENAMEs (excluding swap patterns) ────────────────────────────
echo "## 4. Renamed away — old name still referenced?"
echo ""
echo "Swap patterns also excluded here (e.g. \`market_data_raw RENAME TO market_data_raw_old; CREATE TABLE market_data_raw\`)."
echo ""

rename_findings=""
rename_clean=0
rename_swap=0

# Skip column names that are too generic to produce useful signal
GENERIC_NAMES="id name status type kind label title description created_at updated_at value data metadata content payload context"

while read -r mig; do
  short_mig=$(basename "$mig")

  # Names being renamed AWAY (old names)
  old_cols=$(grep -oiE "RENAME COLUMN[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  old_tbls=$(grep -oiE "ALTER TABLE[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]+RENAME TO" "$mig" 2>/dev/null \
    | awk '{print tolower($3)}' | sort -u)

  # Names "live" after migration: all CREATEs + RENAMEs-TO targets
  created_tbls=$(grep -oiE "CREATE TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  renamed_to=$(grep -oiE "RENAME (COLUMN[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]+)?TO[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*" "$mig" 2>/dev/null \
    | awk '{print tolower($NF)}' | sort -u)
  live_names="$created_tbls $renamed_to"

  for col in $old_cols $old_tbls; do
    # Skip generic names
    is_generic=false
    for g in $GENERIC_NAMES; do
      if [[ "$col" = "$g" ]]; then is_generic=true; break; fi
    done
    if $is_generic; then continue; fi

    # Swap detection
    if echo "$live_names" | tr ' ' '\n' | grep -qx "$col"; then
      rename_swap=$((rename_swap + 1))
      continue
    fi
    refs=$(grep -rln "\\b${col}\\b" server/services/ server/routes/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
      | grep -vE "(test\.ts|test\.tsx|node_modules)" \
      | wc -l | tr -d ' ')
    if [[ "$refs" -gt 0 ]]; then
      rename_findings="$rename_findings\n- ⚠️ **MEDIUM:** \`$short_mig\` renames \`$col\` away — **$refs old-name reference(s) remain**"
    else
      rename_clean=$((rename_clean + 1))
    fi
  done
done < <(grep -lE "RENAME" "$MIG_DIR"/*.sql 2>/dev/null || true)

if [[ -z "$rename_findings" ]]; then
  echo "✅ No real renames with stale references."
else
  echo -e "$rename_findings"
fi
echo ""
echo "- Real clean renames (old name gone, no refs): **$rename_clean**"
echo "- Swap renames excluded: **$rename_swap**"
echo ""

# ── 5. ALTER COLUMN TYPE — risk surface ──────────────────────────────────
echo "## 5. Type changes — manual review needed"
echo ""
echo "ALTER COLUMN TYPE migrations need explicit cast review (downstream code may assume the old type)."
echo ""
type_changes=$(grep -lE "ALTER COLUMN .* TYPE" "$MIG_DIR"/*.sql 2>/dev/null || true)
if [[ -z "$type_changes" ]]; then
  echo "✅ No ALTER COLUMN TYPE migrations."
else
  echo "Migrations with type changes (review each):"
  echo '```'
  for f in $type_changes; do
    echo "$(basename "$f"):"
    grep -nE "ALTER COLUMN .* TYPE" "$f" | sed 's/^/  /' | head -5
  done
  echo '```'
fi
echo ""

# ── 6. NOT NULL added ────────────────────────────────────────────────────
echo "## 6. NOT NULL added to existing columns — backfill check"
echo ""
echo "Adding NOT NULL to a column that may already have NULL data fails on production. The migration should backfill first."
echo ""
not_null_adds=$(grep -lE "SET NOT NULL" "$MIG_DIR"/*.sql 2>/dev/null || true)
if [[ -z "$not_null_adds" ]]; then
  echo "✅ No SET NOT NULL constraints added."
else
  echo "Migrations adding NOT NULL constraints (verify each backfills first or column was new):"
  echo '```'
  for f in $not_null_adds; do
    echo "$(basename "$f"):"
    grep -nE "SET NOT NULL|UPDATE .* SET" "$f" | head -8 | sed 's/^/  /'
  done
  echo '```'
fi
echo ""

# ── 7. Tables created but never queried ──────────────────────────────────
echo "## 7. Tables created but never queried (dead schema)"
echo ""
echo "Tables defined in migrations but never SELECTed / INSERTed / UPDATEd / DELETEd in code."
echo ""
unqueried=""
unqueried_count=0
created_tables=$(grep -hiE "CREATE TABLE (IF NOT EXISTS )?[a-zA-Z_][a-zA-Z0-9_]*" "$MIG_DIR"/*.sql 2>/dev/null \
  | grep -oiE "CREATE TABLE (IF NOT EXISTS )?[a-zA-Z_][a-zA-Z0-9_]*" \
  | awk '{print tolower($NF)}' \
  | sort -u)

for tbl in $created_tables; do
  case "$tbl" in EXISTS) continue ;; esac
  refs=$(grep -rliEn "\\b${tbl}\\b" server/services/ server/routes/ --include="*.ts" 2>/dev/null \
    | grep -vE "(test\.ts|node_modules)" \
    | wc -l | tr -d ' ')
  if [[ "$refs" = "0" ]]; then
    unqueried="$unqueried $tbl"
    unqueried_count=$((unqueried_count + 1))
  fi
done

if [[ "$unqueried_count" = "0" ]]; then
  echo "✅ Every created table is referenced in service/route code."
else
  echo "⚠️ **MEDIUM:** ${unqueried_count} table(s) created but never queried in services/routes:"
  echo '```'
  for t in $unqueried; do echo "  $t"; done
  echo '```'
  echo ""
  echo "Some may be queried via raw SQL in adapters (acceptable). Some may be partition tables auto-managed by PG. Some may be future-state placeholders. Verify each."
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
echo "---"
echo ""
echo "## Summary"
echo ""
echo "| Check | Status |"
echo "|---|---|"
echo "| Total migrations | ${total_migs} |"
echo "| Filename convention | $(if [[ -z "$bad_names" ]]; then echo "✅ clean"; else echo "⚠️ off-convention files"; fi) |"
echo "| Duplicate numbers | $(if [[ -z "$duplicates" ]]; then echo "✅ none"; else echo "❌ duplicates"; fi) |"
echo "| Real drops with stale refs | $(if [[ -z "$drop_findings" ]]; then echo "✅ none"; else echo "❌ findings"; fi) |"
echo "| Real renames with stale refs | $(if [[ -z "$rename_findings" ]]; then echo "✅ none"; else echo "⚠️ findings"; fi) |"
echo "| Unqueried tables | ${unqueried_count} |"
echo ""
echo "**Cadence:** run on every migration, plus quarterly + pre-release (per addendum §G.17)."
