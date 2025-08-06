#!/bin/bash

# 🧠 Index của instance, ví dụ: 0, 1, 2,...
INDEX=$1
PORT=$((9222 + INDEX))
PROFILE_DIR="$HOME/chrome-bot-profile-$INDEX"
CHROME_LOG=$(mktemp)

echo "🚀 Starting Chrome instance #$INDEX on port $PORT..."

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
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
WS_URL=${RAW_WS_URL/127.0.0.1/host.docker.internal}

echo "✅ WS URL for instance #$INDEX: $WS_URL"

# 🐳 Chạy Docker container, với tên riêng biệt và endpoint riêng
CHROME_WS_ENDPOINT="$WS_URL" docker compose -p clickbot-$INDEX up --build