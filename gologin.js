// gologin.js  (ESM)
import { GologinApi } from "gologin";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

// ======= CỜ HÀNH VI =======
const SINGLE_TAB_ONLY = true;
const RANDOM_LINK_CLICK = false;
const OPEN_RESULT_IN_NEW_TAB = false;
// ==========================

const GL_API_TOKEN = process.env.GL_API_TOKEN || "";
const PROXY_MODE = process.env.PROXY_MODE || "http";
const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = process.env.PROXY_PORT || "";
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const KEYWORD = process.env.KEYWORD || "bài ca đi cùng năm tháng";
const TARGET_DOMAIN = (process.env.TARGET_DOMAIN || "bcdcnt.net").toLowerCase();
const CONCURRENCY = Number(process.argv[2] || process.env.CONCURRENCY || 3);

if (!GL_API_TOKEN) throw new Error("Missing GL_API_TOKEN");
if (!PROXY_MODE) throw new Error("Missing PROXY_MODE");
if (!PROXY_HOST) throw new Error("Missing PROXY_HOST");
if (!PROXY_PORT) throw new Error("Missing PROXY_PORT");
if (!PROXY_USERNAME) throw new Error("Missing PROXY_USERNAME");
if (!PROXY_PASSWORD) throw new Error("Missing PROXY_PASSWORD");

const gologin = GologinApi({ token: GL_API_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let successClicks = 0;
let proxyErrorCount = 0;

function saveStats() {
  const log = `[${new Date().toISOString()}] Total successful clicks: ${successClicks}\n`;
  fs.appendFileSync("click_stats.txt", log);
}

function safeMsg(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message && typeof err.message === "string") return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function logErr(i, err) {
  const http = err?.response || err?.res || err?.raw || {};
  const body = http.body || http.data;
  let parsedBody = body;
  if (typeof body === "string") {
    try { parsedBody = JSON.parse(body); } catch { parsedBody = body; }
  }
  const msg = safeMsg(err);
  if (msg.includes("Proxy Error") || msg.includes("tunneling socket could not be established")) {
    proxyErrorCount++;
    if (proxyErrorCount >= 10) {
      console.error(`❌ Proxy lỗi liên tục ${proxyErrorCount} lần. Thoát chương trình.`);
      process.exit(1);
    }
  }
  console.error(
    `------------------------------------------------------------\n` +
    `[${i}] ERROR >>> ${msg}\n` +
    (err?.stack ? `stack=${err.stack}\n` : ``) +
    (http.statusCode || http.status ? `status=${http.statusCode || http.status}\n` : ``) +
    (http.url || http.requestUrl ? `url=${http.url || http.requestUrl}\n` : ``) +
    (parsedBody ? `body=${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}\n` : ``) +
    `------------------------------------------------------------`
  );
}

async function ensureGoogleReady(page) {
  try {
    const agree = await page.$('#L2AGLb');
    if (agree) { await agree.click(); await sleep(800); }
  } catch {}
}

async function simulateUser(page) {
  const hasWheel = typeof page.mouse?.wheel === "function";
  const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const actions = [
    async () => {
      const x = random(100, 1000);
      const y = random(100, 700);
      await page.mouse.move(x, y, { steps: 18 });
      await sleep(random(250, 650));
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: random(200, 800) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, dy), random(200, 800));
      }
      await sleep(random(400, 900));
    }
  ];
  const rounds = random(3, 6);
  for (let i = 0; i < rounds; i++) {
    const action = actions[random(0, actions.length - 1)];
    try { await action(); } catch {}
  }
}

async function closeBlankTabs(browser) {
  const pages = await browser.pages();
  for (const p of pages) {
    const u = p.url();
    if (!u || u === "about:blank" || u.startsWith("chrome://")) {
      if (pages.length > 1) {
        try { await p.close(); } catch {}
      }
    }
  }
}

async function doGoogleSearch(i, browser, keyword, targetDomain) {
  const page = await browser.newPage();
  await page.goto("https://www.google.com/?hl=vi", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await ensureGoogleReady(page);
  await page.waitForSelector('textarea[name="q"]', { timeout: 15000 });
  await page.type('textarea[name="q"]', keyword, { delay: 50 });
  await page.keyboard.press("Enter");

  await Promise.race([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    sleep(7000),
  ]);
  await sleep(800);

  const linkHandles = await page.$$("a");
  console.log(`[${i}] Search: "${keyword}" -> target: "${targetDomain}"`);

  for (const link of linkHandles) {
    let href = "";
    try {
      href = (await link.evaluate(el => el.getAttribute("href") || "")).toLowerCase();
    } catch {}
    if (!href) continue;
    if (href.includes(targetDomain)) {
      successClicks++;
      console.log(`🎯 [${i}] CLICK SUCCESS → ${href} (Total: ${successClicks})`);
      saveStats();

      await Promise.allSettled([
        link.click({ delay: 80 }),
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
      ]);
      await simulateUser(page);
      await page.close();
      return;
    }
  }

  console.log(`[${i}] ❌ No target link found`);
  await simulateUser(page);
  await page.close();
}

async function runOne(i) {
  let profileId = null;
  let browser = null;
  try {
    console.log(`[${i}] Creating profile...`);
    const profile = await gologin.createProfileRandomFingerprint();
    profileId = profile.id;
    await gologin.changeProfileProxy(profileId, {
      mode: PROXY_MODE,
      host: PROXY_HOST,
      port: Number(PROXY_PORT),
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });
    await sleep(600);

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({ profileId });
    browser = launched.browser;
    if (SINGLE_TAB_ONLY) await closeBlankTabs(browser);

    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);
    await sleep(500 + Math.floor(Math.random() * 1000));
  } catch (err) {
    logErr(i, err);
  } finally {
    try { if (browser) await browser.close(); } catch {}
    if (profileId) {
      try {
        await gologin.deleteProfile(profileId);
        console.log(`[${i}] Deleted profile ${profileId}`);
      } catch (e) {
        console.warn(`[${i}] Cannot delete profile ${profileId}:`, safeMsg(e));
      }
    }
  }
}

async function main() {
  console.log(`[INFO] Concurrency = ${CONCURRENCY}`);
  while (true) {
    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
    await Promise.all(tasks);
  }
}

main().catch(console.error).finally(gologin.exit);