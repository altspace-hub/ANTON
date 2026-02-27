#!/bin/bash

echo "========================================="
echo "FCP Workbench Dependency Security Audit"
echo "========================================="
echo ""

# Run pnpm audit
echo "1. Running pnpm audit..."
pnpm audit --json > audit-report.json 2>&1 || true

# Parse results - check if we have vulnerabilities
if grep -q '"vulnerabilities":' audit-report.json; then
  CRITICAL=$(cat audit-report.json | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' || echo "0")
  HIGH=$(cat audit-report.json | grep -o '"high":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MODERATE=$(cat audit-report.json | grep -o '"moderate":[0-9]*' | grep -o '[0-9]*' || echo "0")
  LOW=$(cat audit-report.json | grep -o '"low":[0-9]*' | grep -o '[0-9]*' || echo "0")

  TOTAL=$((CRITICAL + HIGH + MODERATE + LOW))

  if [ "$TOTAL" -gt 0 ]; then
    echo "⚠️  Found $TOTAL vulnerabilities (Critical: $CRITICAL, High: $HIGH, Moderate: $MODERATE, Low: $LOW)"
    echo ""
    pnpm audit --audit-level=moderate
    echo ""
    echo "Run 'pnpm audit --fix' to auto-fix where possible"
    exit 1
  else
    echo "✅ No vulnerabilities found"
  fi
else
  echo "✅ No vulnerabilities found"
fi

echo ""
echo "2. Checking for outdated packages..."
pnpm outdated || true

echo ""
echo "3. License compliance check..."
pnpm dlx license-checker --summary --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;Unlicense;0BSD;Python-2.0' || echo "⚠️  Some packages use non-standard licenses - review manually"

echo ""
echo "========================================="
echo "Audit complete"
echo "========================================="
