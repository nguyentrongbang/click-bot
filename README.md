
# Click Bot 🤖

A simple automation tool using Puppeteer to simulate human-like search and click behavior on Google search results.

## Features

- Search keyword on Google
- Detect target domain in search results
- Click on the matched domain
- Simulate human interaction (scrolling, clicking, mouse movement)
- Looping with delay
- Robust retry on timeout or errors

## Tech Stack

- Node.js
- TypeScript
- Puppeteer-Core
- Chrome DevTools Protocol (remote debugging)

---

## ⚙️ Prerequisites

- Node.js >= 18
- Google Chrome installed
- Enable remote debugging for Chrome:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=~/chrome-bot-profile
```

> 📌 Replace `~/chrome-bot-profile` with your actual Chrome profile path if needed.

---

## 📦 Installation

```bash
git clone https://github.com/yourusername/click-bot.git
cd click-bot
npm install
```

---

## 📄 .env Configuration

Create a `.env` file with the following variables:

```env
KEYWORD=iphone 16 pro max
TARGET_DOMAIN=nocnoc.com
CHROME_WS_ENDPOINT=ws://localhost:9222/devtools/browser/your-browser-id
```

### 🔍 How to get `CHROME_WS_ENDPOINT`

1. After launching Chrome with remote debugging:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 -user-data-dir="$HOME/chrome-bot-profile"
   ```

2. Open your browser and visit:
   ```
   http://localhost:9222/json/version
   ```

3. Look for the first item in the returned JSON array, and copy the value of `"webSocketDebuggerUrl"`, e.g.:

   ```json
   {
     "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/c68b2802-5eb1-4d2d-af1c-98d9f9887bb2"
   }
   ```

4. Paste that value into `.env` as `CHROME_WS_ENDPOINT`.

---

## ▶️ Run the Bot

```bash
npm run start
```

---

## 📁 Project Structure

```
click-bot/
├── src/
│   ├── index.ts         # Main script
│   └── simulate.ts      # Simulate user behavior
├── .env                 # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔐 Notes

- This tool is for educational or testing purposes only.
- Do **NOT** use for unethical activities (e.g., clicking competitor ads). Violates Google ToS.
- You are responsible for your own usage.

---

## 💡 Tips

- Increase navigation timeout: `page.waitForNavigation({ timeout: 60000 })`
- Use different simulate scripts for various behavior
- Randomize delay between actions to mimic human activity

---

## ✅ Example Log

```bash
🔍 Searching for: iphone 16 pro max
✅ Found link: https://nocnoc.com/p/...
🌀 Simulated user activity...
⏳ Waiting before next round...
```
