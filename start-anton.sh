#!/bin/bash

echo ""
echo "  ====================================================="
echo "   ANTON by openEXPERT"
echo "   AI Workbench for FCP Teams"
echo "  ====================================================="
echo ""

cd "$(dirname "$0")"

# Check if already running
if lsof -i :3001 -t > /dev/null 2>&1; then
    echo "  ANTON is already running."
    echo "  Opening browser at http://localhost:3001"
    echo ""
    xdg-open http://localhost:3001 2>/dev/null || open http://localhost:3001 2>/dev/null
    exit 0
fi

# Check Node.js
if ! command -v node > /dev/null 2>&1; then
    echo "  ERROR: Node.js not found."
    echo "  Install from https://nodejs.org and try again."
    echo ""
    exit 1
fi

# Check .env
if [ ! -f ".env" ]; then
    echo "  ERROR: No .env file found."
    echo "  Copy .env.example to .env and add your ANTHROPIC_API_KEY."
    echo ""
    exit 1
fi

# Install dependencies if needed
if [ ! -f "node_modules/.bin/tsx" ]; then
    echo "  Installing dependencies — this only happens once..."
    pnpm install --frozen-lockfile
    if [ $? -ne 0 ]; then
        echo "  ERROR: Dependency install failed."
        exit 1
    fi
fi

# Build if dist is missing or git hash has changed since last build
CURRENT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
STORED_HASH=$(cat dist/client/.build-hash 2>/dev/null || echo "")
if [ ! -d "dist/client" ] || [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    if [ -d "dist/client" ]; then
        echo "  Code has changed — rebuilding ANTON..."
    else
        echo "  Building ANTON — this only happens once..."
    fi
    pnpm run build
    if [ $? -ne 0 ]; then
        echo "  ERROR: Build failed."
        exit 1
    fi
    echo "$CURRENT_HASH" > dist/client/.build-hash
fi

# Open browser after 5 seconds in the background
(sleep 5 && (xdg-open http://localhost:3001 2>/dev/null || open http://localhost:3001 2>/dev/null)) &

echo "  Starting server... your browser will open in a few seconds."
echo "  Go to: http://localhost:3001"
echo ""
echo "  -------------------------------------------------------"
echo "  Press Ctrl+C to stop ANTON."
echo "  -------------------------------------------------------"
echo ""

node_modules/.bin/tsx server/index.ts

echo ""
echo "  ANTON has stopped."
