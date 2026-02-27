#!/bin/bash

# Test script for Intelligence Dashboard API endpoints
# Run this after starting the server to verify all endpoints work

BASE_URL="http://localhost:3001"
TOKEN=""  # Add auth token here if needed

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Intelligence Dashboard API Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to make authenticated GET request
function api_get() {
  local endpoint=$1
  local name=$2
  echo "Testing: $name"
  echo "GET $endpoint"

  if [ -n "$TOKEN" ]; then
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint" | jq '.'
  else
    curl -s "$BASE_URL$endpoint" | jq '.'
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

# Test all intelligence endpoints

api_get "/api/intelligence/summary" "Dashboard Summary"

api_get "/api/intelligence/temporal/atoms-per-day?days=30" "Atoms Per Day (30 days)"

api_get "/api/intelligence/temporal/patterns-per-week?weeks=12" "Patterns Per Week (12 weeks)"

api_get "/api/intelligence/temporal/entity-activity?weeks=12" "Entity Activity (12 weeks)"

api_get "/api/intelligence/temporal/quality-trend?weeks=12" "Quality Trend (12 weeks)"

api_get "/api/patterns?status=active&limit=10" "Active Patterns (10)"

api_get "/api/knowledge/atoms?limit=10" "Knowledge Atoms (10)"

api_get "/api/knowledge-graph/entities?limit=10" "Top Entities (10)"

echo "✅ Test suite complete!"
echo ""
echo "If all endpoints returned valid JSON, the Intelligence Dashboard API is ready."
echo "If you see errors, check:"
echo "  1. Server is running on port 3001"
echo "  2. Database tables exist (run migrations from Layers 1-4)"
echo "  3. Auth token is correct (if in team mode)"
