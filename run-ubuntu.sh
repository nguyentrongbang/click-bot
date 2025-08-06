#!/bin/bash

# 🧠 Index của instance, ví dụ: 0, 1, 2,...
INDEX=$1
PORT=$((9222 + INDEX))
PROFILE_DIR="$HOME/chrome-bot-profile-$INDEX"
CHROME_LOG=$(mktemp)

echo "🚀 Starting Chrome instance #$INDEX on port $PORT..."
echo "📁 Chrome profile: $PROFILE_DIR"
echo "📄 Chrome log: $CHROME_LOG"

# 👉 Khởi chạy GUI ảo
# Xvfb :99 -screen 0 1024x768x16 &
# export DISPLAY=:99

# 👉 Khởi chạy Chrome headless có GUI giả
google-chrome \
  --no-sandbox \
  --headless=new \
  --remote-debugging-port=$PORT \
  --remote-debugging-address=0.0.0.0 \
  --remote-allow-origins=* \
  --user-data-dir="$PROFILE_DIR" \
  --proxy-pac-url="https://cdn.keobongvip.digital/uploads/tmp/proxy.pac" \
  --no-first-run \
  --no-default-browser-check > "$CHROME_LOG" 2>&1 &

# ⏳ Đợi Chrome xuất WebSocket URL
echo "⌛ Waiting for Chrome to print WebSocket URL..."
while ! grep -q "DevTools listening on ws://" "$CHROME_LOG"; do
  sleep 1
done

# 👉 Lấy WebSocket URL thật
RAW_WS_URL=$(grep "DevTools listening on ws://" "$CHROME_LOG" | tail -n1 | awk '{print $NF}')

echo "✅ WS URL for instance #$INDEX: $RAW_WS_URL"

# 👉 Export thành biến môi trường để app Node.js đọc được
export CHROME_WS_ENDPOINT="$RAW_WS_URL"

# 👉 Cài thư viện và khởi chạy app
echo "📦 Running Node.js app..."
npm install
npm run start