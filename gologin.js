// gologin.js  (ESM)
import { GologinApi } from "gologin";
import dotenv from "dotenv";
dotenv.config();

/**
 * .env cần có:
 * GL_API_TOKEN=...
 * PROXY_MODE=http
 * PROXY_HOST=p.webshare.io
 * PROXY_PORT=80
 * PROXY_USERNAME=...
 * PROXY_PASSWORD=...
 * KEYWORD="bài ca đi cùng năm tháng"
 * TARGET_DOMAIN="bcdcnt.net"
 * (tùy chọn) CONCURRENCY=3
 *
 * Chạy: node gologin.js 5  -> 5 luồng song song
 */

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

function safeMsg(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message && typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function logErr(i, err) {
  // trải body lỗi nếu có
  const http = err?.response || err?.res || err?.raw || {};
  const body = http.body || http.data;

  let parsedBody = body;
  if (typeof body === "string") {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }
  }

  // cố gắng “unwrap” message nếu là object
  let msg = err?.message;
  if (msg && typeof msg === "object") {
    try {
      msg = JSON.stringify(msg);
    } catch {
      msg = String(msg);
    }
  }
  if (!msg) msg = safeMsg(err);

  console.error(
    "------------------------------------------------------------\n" +
      `[${i}] ERROR >>> ${msg}\n` +
      (http.statusCode || http.status ? `status=${http.statusCode || http.status}\n` : ``) +
      (http.url || http.requestUrl ? `url=${http.url || http.requestUrl}\n` : ``) +
      (parsedBody
        ? `body=${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}\n`
        : ``) +
      (err?.stack ? `stack=${err.stack}\n` : ``) +
      "------------------------------------------------------------"
  );
}

async function ensureGoogleReady(page) {
  // Bấm đồng ý cookie/consent nếu có (một vài selector phổ biến)
  try {
    const selectors = [
      '#L2AGLb',
      'button[aria-label*="Đồng ý"]',
      'button:has-text("I agree")',
      'button:has-text("Tôi đồng ý")',
    ];
    for (const s of selectors) {
      const btn = await page.$(s);
      if (btn) {
        await btn.click().catch(() => {});
        await sleep(600);
        break;
      }
    }
  } catch {}
}

async function simulateUser(page) {
  // Không click bừa trong simulateUser để tránh điều hướng bất ngờ
  const hasWheel = typeof page.mouse?.wheel === "function";
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const safe = async (fn) => {
    if (page.isClosed()) return;
    try {
      await fn();
    } catch {}
  };

  const actions = [
    () =>
      safe(async () => {
        await page.mouse.move(rnd(80, 1000), rnd(100, 720), { steps: 15 });
        await sleep(rnd(250, 700));
      }),
    () =>
      safe(async () => {
        if (hasWheel) await page.mouse.wheel({ deltaY: rnd(200, 800) });
        else await page.evaluate((dy) => window.scrollBy(0, dy), rnd(200, 800));
        await sleep(rnd(400, 1100));
      }),
    () =>
      safe(async () => {
        if (hasWheel) await page.mouse.wheel({ deltaY: -rnd(200, 600) });
        else await page.evaluate((dy) => window.scrollBy(0, -dy), rnd(200, 600));
        await sleep(rnd(400, 1100));
      }),
    () =>
      safe(async () => {
        const links = await page.$$("a");
        if (!links.length) return;
        const link = links[rnd(0, links.length - 1)];
        await link.hover().catch(() => {});
        await sleep(rnd(300, 700));
      }),
  ];

  const rounds = rnd(6, 12);
  for (let i = 0; i < rounds; i++) {
    if (page.isClosed()) break;
    await actions[rnd(0, actions.length - 1)]();
  }
}

// Lấy list href từ SERP, lọc http/https, bỏ javascript:, /search?q=...
async function extractSerpHrefs(page) {
  const hrefs = await page.$$eval("a", (as) =>
    as
      .map((a) => a.getAttribute("href") || "")
      .filter(Boolean)
      .filter((h) => /^https?:\/\//i.test(h))
  );
  // loại các link google “tiện ích” nếu có
  return hrefs.filter((h) => !/\/search\?|\/imgres\?/.test(h));
}

function hostnameIncludes(href, targetDomain) {
  try {
    const u = new URL(href);
    return u.hostname.toLowerCase().includes(targetDomain);
  } catch {
    return href.toLowerCase().includes(targetDomain);
  }
}

async function doGoogleSearch(i, browser, keyword, targetDomain) {
  const page = await browser.newPage();

  // Truy cập Google
  await page.goto("https://www.google.com/?hl=vi", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await ensureGoogleReady(page);

  // Nhập keyword
  await page.waitForSelector('textarea[name="q"]', { timeout: 20000 });
  await page.type('textarea[name="q"]', keyword, { delay: 60 });
  await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(800);

  console.log(`[${i}] Search: "${keyword}" -> looking for "${targetDomain}"`);

  // Lấy các href ngoài SERP
  const hrefs = await extractSerpHrefs(page);

  // Tìm link chứa domain
  let clicked = false;
  for (const href of hrefs) {
    if (!hostnameIncludes(href, targetDomain)) continue;

    console.log(`[${i}] ✅ Found result: ${href}`);
    // Điều hướng bằng goto để tránh dùng ElementHandle cũ -> an toàn hơn
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await simulateUser(page);
    clicked = true;
    break;
  }

  if (!clicked) {
    console.log(`[${i}] No target link found. Top hrefs:`);
    hrefs.slice(0, 8).forEach((h, idx) => console.log(`[${i}]   [${idx + 1}] ${h}`));
    await simulateUser(page);
  }

  await page.close();
}

async function runOne(i) {
  let profileId = null;
  let browser = null;

  try {
    console.log(`[${i}] Creating profile...`);
    const profile = await gologin.createProfileRandomFingerprint();
    profileId = profile.id;

    // Gán proxy thủ công vào profile
    await gologin.changeProfileProxy(profileId, {
      mode: PROXY_MODE,
      host: PROXY_HOST,
      port: Number(PROXY_PORT),
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });

    // Nghỉ nhẹ để patch proxy ổn định
    await sleep(600);

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({ profileId });
    browser = launched.browser;

    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);

    // Random idle 2–5s giữa các vòng nếu muốn
    await sleep(2000 + Math.floor(Math.random() * 3000));
  } catch (err) {
    logErr(i, err);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}

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
  // Batch đầu
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1)));

  // Lặp batch vô hạn
  while (true) {
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1)));
    // nghỉ ngắn giữa các batch để tự nhiên hơn
    await sleep(3000 + Math.floor(Math.random() * 4000));
  }
}

main().catch(console.error).finally(gologin.exit);