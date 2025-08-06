#!/bin/bash

# 🧠 Index của instance, ví dụ: 0, 1, 2,...
INDEX=$1
PORT=$((9222 + INDEX))
PROFILE_DIR="$HOME/chrome-bot-profile-$INDEX"
CHROME_LOG=$(mktemp)

echo "🚀 Starting Chrome instance #$INDEX on port $PORT..."
echo "$PROFILE_DIR"
echo "$CHROME_LOG"

google-chrome \
  --no-sandbox \
  --remote-debugging-port=$PORT \
  --remote-debugging-address=0.0.0.0 \
  --remote-allow-origins=* \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check > "$CHROME_LOG" 2>&1 &

echo "⌛ Waiting for Chrome to print WebSocket URL..."
while ! grep -q "DevTools listening on ws://" "$CHROME_LOG"; do
  sleep 1
done

RAW_WS_URL=$(grep "DevTools listening on ws://" "$CHROME_LOG" | tail -n1 | awk '{print $NF}')