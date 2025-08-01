#!/bin/bash

# 1. Khởi động Chrome với remote debugging (ghi log vào tệp tạm)
echo "🚀 Starting Chrome with remote debugging..."
CHROME_LOG=$(mktemp)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --remote-allow-origins=* \
  --user-data-dir="$HOME/chrome-bot-profile" \
  --no-first-run \
  --no-default-browser-check > "$CHROME_LOG" 2>&1 &

# 2. Đợi đến khi Chrome in ra dòng có ws URL
echo "⌛ Waiting for Chrome to print WebSocket URL..."
while ! grep -q "DevTools listening on ws://" "$CHROME_LOG"; do
  sleep 1
done

# 3. Trích xuất WebSocket URL và thay localhost => host.docker.internal
RAW_WS_URL=$(grep "DevTools listening on ws://" "$CHROME_LOG" | tail -n1 | awk '{print $NF}')
WS_URL=${RAW_WS_URL/127.0.0.1/host.docker.internal}
echo "✅ WS URL found: $WS_URL"

# 4. Chạy Docker và truyền biến môi trường vào
echo "🐳 Starting Docker container..."
WS_URL_ESCAPED=$(printf '%q' "$WS_URL")
CHROME_WS_ENDPOINT="$WS_URL" docker compose up --build