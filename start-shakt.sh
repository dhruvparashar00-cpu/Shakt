#!/bin/bash
# start-shakt.sh - One-click launcher for Shakt (शक्ति)
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Source user's environment if needed (NVM, proxy tokens)
if [ -f "$HOME/.bashrc" ]; then
    set +e
    . "$HOME/.bashrc" 2>/dev/null
    set -e
fi

echo "========================================================"
echo "⚡ Starting SHAKT (शक्ति) Note & Study Companion..."
echo "========================================================"

# Check if node is available
if ! command -v node &> /dev/null; then
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
    fi
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required to run the server."
    echo "Please install Node.js (v18+) or load via nvm."
    exit 1
fi

echo "Using Node.js: $(node -v)"
echo "Base URL: ${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"

# Launch server
echo "Starting local server on port 3000..."
node server.js &
SERVER_PID=$!

sleep 1

# Automatically open default browser on Linux
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null &
elif command -v google-chrome &> /dev/null; then
    google-chrome "http://localhost:3000" 2>/dev/null &
elif command -v firefox &> /dev/null; then
    firefox "http://localhost:3000" 2>/dev/null &
fi

echo "========================================================"
echo "✓ Shakt is now active!"
echo "Server PID: $SERVER_PID"
echo "To stop, press Ctrl+C or kill $SERVER_PID"
echo "========================================================"

wait $SERVER_PID
