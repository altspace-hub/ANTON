#!/usr/bin/env bash
# ============================================================
# KitchenBox EU — ANTON Workbench API Test Script
# ============================================================
# Tests ANTON's core API endpoints using KitchenBox EU data.
# Run from the test-data/api-tests/ directory.
#
# Usage:
#   cd test-data/api-tests
#   chmod +x workbench-api.sh
#   ./workbench-api.sh
#
# Prerequisites: ANTON running on localhost:3001 (pnpm run dev)
# ============================================================

BASE="http://localhost:3001/api"
COMPANY_DIR="../company"

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${CYAN}ℹ  $1${NC}"; }
section() { echo -e "\n${YELLOW}═══ $1 ═══${NC}"; }

SESSION_ID=""
UPLOAD_ID=""

# ─── 1. HEALTH CHECK ──────────────────────────────────────────────────────────

section "1. Health Check"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/../health" 2>/dev/null || \
         curl -s -o /dev/null -w "%{http_code}" "$BASE/health" 2>/dev/null)

if [ "$STATUS" = "200" ]; then
  pass "Server is running (HTTP $STATUS)"
else
  fail "Server not responding (HTTP $STATUS) — is ANTON running on :3001?"
  echo "  Start it with: pnpm run dev"
  exit 1
fi

# ─── 2. FILE UPLOAD ───────────────────────────────────────────────────────────

section "2. File Upload — KitchenBox Company Overview"

if [ ! -f "$COMPANY_DIR/01-company-overview.md" ]; then
  fail "Company overview file not found at $COMPANY_DIR/01-company-overview.md"
else
  UPLOAD_RESP=$(curl -s -X POST "$BASE/files/upload" \
    -F "file=@$COMPANY_DIR/01-company-overview.md" \
    -H "Accept: application/json")

  UPLOAD_ID=$(echo "$UPLOAD_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$UPLOAD_ID" ]; then
    pass "File uploaded — ID: $UPLOAD_ID"
    info "Response: $(echo "$UPLOAD_RESP" | head -c 200)..."
  else
    fail "Upload failed — Response: $UPLOAD_RESP"
  fi
fi

# ─── 3. UPLOAD PRODUCT CATALOG ────────────────────────────────────────────────

section "3. File Upload — Product Catalog"

CATALOG_RESP=$(curl -s -X POST "$BASE/files/upload" \
  -F "file=@$COMPANY_DIR/02-product-catalog.md" \
  -H "Accept: application/json")

CATALOG_ID=$(echo "$CATALOG_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$CATALOG_ID" ]; then
  pass "Product catalog uploaded — ID: $CATALOG_ID"
else
  fail "Catalog upload failed — Response: $CATALOG_RESP"
fi

# ─── 4. UPLOAD FINANCIAL SUMMARY ──────────────────────────────────────────────

section "4. File Upload — Financial Summary"

FINANCE_RESP=$(curl -s -X POST "$BASE/files/upload" \
  -F "file=@$COMPANY_DIR/05-financial-summary-2024.md" \
  -H "Accept: application/json")

FINANCE_ID=$(echo "$FINANCE_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$FINANCE_ID" ]; then
  pass "Financial summary uploaded — ID: $FINANCE_ID"
else
  fail "Finance upload failed"
fi

# ─── 5. CREATE SESSION ────────────────────────────────────────────────────────

section "5. Session — Create New Session"

SESSION_RESP=$(curl -s -X POST "$BASE/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "moduleId": "gap-analysis",
    "title": "KitchenBox EU — VAT Compliance Gap Analysis"
  }')

SESSION_ID=$(echo "$SESSION_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
  pass "Session created — ID: $SESSION_ID"
else
  fail "Session creation failed — Response: $SESSION_RESP"
  SESSION_ID="test-session-$(date +%s)"
fi

# ─── 6. LIST SESSIONS ─────────────────────────────────────────────────────────

section "6. Session — List Sessions"

SESSIONS=$(curl -s "$BASE/sessions")
SESSION_COUNT=$(echo "$SESSIONS" | grep -o '"id"' | wc -l | tr -d ' ')

if [ "$SESSION_COUNT" -ge 1 ]; then
  pass "Sessions listed — found $SESSION_COUNT session(s)"
else
  fail "No sessions returned or endpoint failed"
  info "Response: $(echo "$SESSIONS" | head -c 200)"
fi

# ─── 7. GET SPECIFIC SESSION ──────────────────────────────────────────────────

section "7. Session — Get Session by ID"

if [ -n "$SESSION_ID" ]; then
  SESSION_GET=$(curl -s "$BASE/sessions/$SESSION_ID")
  HAS_ID=$(echo "$SESSION_GET" | grep -o '"id"' | head -1)

  if [ -n "$HAS_ID" ]; then
    pass "Session retrieved — ID: $SESSION_ID"
  else
    fail "Could not retrieve session $SESSION_ID"
    info "Response: $(echo "$SESSION_GET" | head -c 200)"
  fi
fi

# ─── 8. CLAUDE STREAM — GAP ANALYSIS ─────────────────────────────────────────

section "8. Claude API — Gap Analysis (Streaming SSE)"

info "Sending gap analysis request — streaming response (first 500 chars shown)..."

FILE_IDS="[]"
if [ -n "$UPLOAD_ID" ] && [ -n "$CATALOG_ID" ]; then
  FILE_IDS="[\"$UPLOAD_ID\", \"$CATALOG_ID\"]"
fi

STREAM_OUTPUT=$(curl -s -X POST "$BASE/claude/stream" \
  -H "Content-Type: application/json" \
  -N --max-time 60 \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"KitchenBox EU AB is a Swedish e-commerce company selling kitchen equipment across the EU. They are registered for EU VAT OSS since July 2021. Based on the uploaded company overview and product catalog, identify 3 key VAT compliance gaps or risks, particularly around their cross-border B2C and B2B sales model. Keep the response brief.\",
    \"model\": \"claude-sonnet-4-6\",
    \"thinking\": \"think\",
    \"creativity\": \"balanced\",
    \"transparencyLevel\": 1,
    \"selectedPersonas\": [\"tax-advisor\"],
    \"selectedOutputFormats\": [\"quick-briefing\"],
    \"uploadedFileIds\": $FILE_IDS,
    \"moduleId\": \"gap-analysis\"
  }" | head -c 2000)

if echo "$STREAM_OUTPUT" | grep -q "data:"; then
  pass "Streaming response received"
  TEXT=$(echo "$STREAM_OUTPUT" | grep '"text"' | head -3)
  info "First text chunks: $(echo "$TEXT" | head -c 300)"
elif echo "$STREAM_OUTPUT" | grep -q "error"; then
  fail "Error in stream response"
  info "Response: $(echo "$STREAM_OUTPUT" | head -c 500)"
else
  fail "Unexpected stream response format"
  info "Response: $(echo "$STREAM_OUTPUT" | head -c 300)"
fi

# ─── 9. CLAUDE STREAM — PRODUCT ANALYSIS ─────────────────────────────────────

section "9. Claude API — Product Margin Analysis"

info "Sending product analysis request..."

MARGIN_OUTPUT=$(curl -s -X POST "$BASE/claude/stream" \
  -H "Content-Type: application/json" \
  -N --max-time 45 \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"From the KitchenBox product catalog: which product category has the highest average gross margin percentage, and what is the lowest-margin SKU? Give a 2-sentence answer.\",
    \"model\": \"claude-haiku-4-5-20251001\",
    \"thinking\": \"quick\",
    \"creativity\": \"strict\",
    \"transparencyLevel\": 0,
    \"selectedPersonas\": [\"general-assistant\"],
    \"selectedOutputFormats\": [],
    \"uploadedFileIds\": [\"$CATALOG_ID\"],
    \"moduleId\": \"data-management\"
  }" | head -c 1000)

if echo "$MARGIN_OUTPUT" | grep -q "data:"; then
  pass "Product analysis stream received"
else
  fail "Product analysis stream failed"
  info "Response: $(echo "$MARGIN_OUTPUT" | head -c 300)"
fi

# ─── 10. EXPORT — MARKDOWN ────────────────────────────────────────────────────

section "10. Export — Markdown Download"

MD_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/export/markdown" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"# KitchenBox EU Test Export\n\nThis is a test markdown export from the ANTON workbench API test suite.\n\n## Company\n**KitchenBox EU AB** — Swedish kitchen e-commerce company.\n\n## Key Metrics (2024)\n- Gross revenue: €3,240,000\n- EBIT margin: 8.3%\n- Products: 32 SKUs\",
    \"filename\": \"kitchenbox-test-export\"
  }")

if [ "$MD_RESP" = "200" ]; then
  pass "Markdown export endpoint responding (HTTP 200)"
else
  info "Markdown export returned HTTP $MD_RESP (may not be implemented as POST)"
fi

# ─── 11. EXPORT — DOCX ────────────────────────────────────────────────────────

section "11. Export — DOCX Generation"

DOCX_RESP=$(curl -s -o /tmp/test-kitchenbox.docx -w "%{http_code}" -X POST "$BASE/export/docx" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# KitchenBox EU — Test Report\n\nGenerated via ANTON Workbench API test.\n\n## Executive Summary\n\nKitchenBox EU AB achieved €3.24M gross revenue in 2024, a 15.3% increase year-on-year. EBIT margin improved from 6.2% to 8.3%.\n\n## Key Findings\n\n1. VAT OSS compliance appears solid with quarterly filings maintained\n2. Supplier concentration risk — top supplier represents 28% of procurement\n3. B2B segment growing but still only 8% of revenue\n\n## Recommendation\n\nPrioritise supplier diversification and B2B expansion in 2025.",
    "filename": "kitchenbox-test-report",
    "sessionId": "test"
  }')

if [ "$DOCX_RESP" = "200" ]; then
  DOCX_SIZE=$(wc -c < /tmp/test-kitchenbox.docx 2>/dev/null || echo "0")
  pass "DOCX generated (HTTP 200, ${DOCX_SIZE} bytes) → /tmp/test-kitchenbox.docx"
else
  fail "DOCX export returned HTTP $DOCX_RESP"
fi

# ─── 12. FOLDERS — LIST REGISTERED ───────────────────────────────────────────

section "12. Folders — List Registered Folders"

FOLDERS_RESP=$(curl -s "$BASE/folders/registered")
FOLDER_COUNT=$(echo "$FOLDERS_RESP" | grep -o '"path"' | wc -l | tr -d ' ')

if echo "$FOLDERS_RESP" | grep -qE '^\[|\{'; then
  pass "Folders endpoint responding — $FOLDER_COUNT registered folder(s)"
else
  fail "Folders endpoint failed — Response: $(echo "$FOLDERS_RESP" | head -c 100)"
fi

# ─── 13. MODULES — LIST / GET CONFIG ─────────────────────────────────────────

section "13. Modules — Get Module Config"

MODULE_RESP=$(curl -s "$BASE/modules/gap-analysis")
HAS_MODULE=$(echo "$MODULE_RESP" | grep -o '"moduleId"' | head -1)

if [ -n "$HAS_MODULE" ]; then
  pass "Module config retrieved for gap-analysis"
elif echo "$MODULE_RESP" | grep -qE '^\[|\{'; then
  pass "Module endpoint responding"
  info "Response: $(echo "$MODULE_RESP" | head -c 200)"
else
  info "Module endpoint not available or gap-analysis config not set yet"
fi

# ─── 14. GDPR — CUSTOMER CONSENT QUERY ───────────────────────────────────────

section "14. Claude API — GDPR Data Management Query"

GDPR_OUTPUT=$(curl -s -X POST "$BASE/claude/stream" \
  -H "Content-Type: application/json" \
  -N --max-time 45 \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"KitchenBox EU has 20 customers. Three customers (CUST-0003 Sophie Dubois, CUST-0010 Björn Lindqvist, CUST-0017 Klaus Wagner) have gdpr_basis of 'legitimate_interest' rather than 'consent', and have marketing_consent set to false. Three B2B customers (CUST-0011, CUST-0013, CUST-0019) are on 'contract' basis. What are the key GDPR obligations KitchenBox must meet for each of these basis types? Give a concise 3-point answer.\",
    \"model\": \"claude-haiku-4-5-20251001\",
    \"thinking\": \"quick\",
    \"creativity\": \"strict\",
    \"transparencyLevel\": 0,
    \"selectedPersonas\": [\"compliance-advisor\"],
    \"selectedOutputFormats\": [],
    \"uploadedFileIds\": [],
    \"moduleId\": \"data-management\"
  }" | head -c 1500)

if echo "$GDPR_OUTPUT" | grep -q "data:"; then
  pass "GDPR query stream received"
else
  fail "GDPR query stream failed"
  info "Response: $(echo "$GDPR_OUTPUT" | head -c 200)"
fi

# ─── SUMMARY ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Test Run Complete — KitchenBox EU     ${NC}"
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo ""
echo "Session ID used: $SESSION_ID"
[ -n "$UPLOAD_ID" ]   && echo "Company overview file ID: $UPLOAD_ID"
[ -n "$CATALOG_ID" ]  && echo "Product catalog file ID:  $CATALOG_ID"
[ -n "$FINANCE_ID" ]  && echo "Financial summary file ID: $FINANCE_ID"
echo ""
echo "Resume this session in ANTON:"
echo "  → My Work → session titled 'KitchenBox EU — VAT Compliance Gap Analysis'"
echo ""
