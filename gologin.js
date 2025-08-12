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
 * (tùy chọn) BATCH_PAUSE_MS=3000   // nghỉ giữa các batch
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
const BATCH_PAUSE_MS = Number(process.env.BATCH_PAUSE_MS || 3000);

if (!GL_API_TOKEN) throw new Error("Missing GL_API_TOKEN");
if (!PROXY_MODE) throw new Error("Missing PROXY_MODE");
if (!PROXY_HOST) throw new Error("Missing PROXY_HOST");
if (!PROXY_PORT) throw new Error("Missing PROXY_PORT");
if (!PROXY_USERNAME) throw new Error("Missing PROXY_USERNAME");
if (!PROXY_PASSWORD) throw new Error("Missing PROXY_PASSWORD");

const gologin = GologinApi({ token: GL_API_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

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
  console.error(
    "------------------------------------------------------------\n" +
      `[${i}] ERROR >>> ${safeMsg(err)}\n` +
      (http.statusCode || http.status ? `status=${http.statusCode || http.status}\n` : ``) +
      (http.url || http.requestUrl ? `url=${http.url || http.requestUrl}\n` : ``) +
      (parsedBody ? `body=${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}\n` : ``) +
      (err?.stack ? `stack=${err.stack}\n` : ``) +
    "------------------------------------------------------------"
  );
}

async function dismissGoogleOverlays(page) {
  // polyfill waitForTimeout nếu cần (đề phòng code khác gọi)
  if (typeof page.waitForTimeout !== "function") {
    page.waitForTimeout = (ms) => new Promise((r) => setTimeout(r, ms));
  }

  try {
    // Cookie consent phổ biến (nút Đồng ý)
    const agreeSelList = [
      '#L2AGLb',
      'button[aria-label*="Đồng ý"]',
      'button[aria-label="Accept all"]',
      'form[action*="consent"] button',
    ];
    for (const sel of agreeSelList) {
      const el = await page.$(sel);
      if (el) {
        await el.click().catch(() => {});
        await sleep(600);
        break;
      }
    }

    // Thử xử lý trong iframe consent (một số layout Google để consent trong iframe)
    const frames = page.frames();
    for (const f of frames) {
      try {
        const btn = await f.$('button[aria-label="Accept all"], #L2AGLb');
        if (btn) {
          await btn.click().catch(() => {});
          await sleep(600);
          break;
        }
      } catch {}
    }

    // Đóng vài dialog “No thanks / Not now”
    const miscSelectors = [
      'button[aria-label="No thanks"]',
      'button[jsname="d0qKfc"]',
      '[role="dialog"] button:not([disabled])',
    ];
    for (const sel of miscSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click().catch(() => {});
        await sleep(400);
      }
    }
  } catch (e) {
    console.warn("dismissGoogleOverlays warn:", safeMsg(e));
  }
}

async function simulateUser(page) {
  const hasWheel = typeof page.mouse?.wheel === "function";

  const actions = [
    async () => {
      const x = rand(100, 1200), y = rand(100, 800);
      await page.mouse.move(x, y, { steps: 20 });
      await sleep(rand(300, 800));
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: rand(200, 800) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, dy), rand(200, 800));
      }
      await sleep(rand(500, 1200));
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: -rand(200, 600) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, -dy), rand(200, 600));
      }
      await sleep(rand(500, 1200));
    },
    async () => {
      const links = await page.$$("a");
      if (!links.length) return;
      const link = links[rand(0, links.length - 1)];
      try {
        const box = await link.boundingBox();
        if (box) {
          await link.hover();
          await sleep(rand(300, 800));
          if (Math.random() < 0.15) {
            await Promise.allSettled([
              link.click({ delay: 80 }),
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }),
            ]);
          }
        }
      } catch (e) {
        console.warn("⚠️ simulateUser link:", safeMsg(e));
      }
    },
  ];

  const rounds = rand(6, 12);
  for (let i = 0; i < rounds; i++) {
    const action = actions[rand(0, actions.length - 1)];
    try { await action(); }
    catch (e) { console.warn("⚠️ simulateUser error:", safeMsg(e)); }
  }
}

async function doGoogleSearch(i, browser, keyword, targetDomain) {
  const page = await browser.newPage();
  // polyfill phòng code gọi waitForTimeout ở nơi khác
  if (typeof page.waitForTimeout !== "function") {
    page.waitForTimeout = (ms) => new Promise((r) => setTimeout(r, ms));
  }

  // Tải Google
  await page.goto("https://www.google.com/?hl=vi", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  }).catch(() => {});

  await dismissGoogleOverlays(page);

  // Gõ từ khóa
  await page.waitForSelector('textarea[name="q"]', { timeout: 15000 });
  await page.type('textarea[name="q"]', keyword, { delay: 50 });
  await page.keyboard.press("Enter");

  // Chờ kết quả 2 pha để giảm timeout
  await Promise.race([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    (async () => {
      await sleep(4000);
      try { await page.waitForSelector("#search", { timeout: 60000 }); } catch {}
    })(),
  ]).catch(() => {});

  await sleep(1000);
  await dismissGoogleOverlays(page);

  console.log(`[${i}] Search: "${keyword}" -> click domain contains "${targetDomain}"`);

  // Thử click mở tab mới để tránh “context destroyed”
  const links = await page.$$("a");
  let clicked = false;

  for (const link of links) {
    const href = (await link.evaluate((el) => el.getAttribute("href") || "")).toLowerCase();
    if (!href) continue;

    if (href.includes(targetDomain)) {
      console.log(`[${i}] ✅ Found: ${href}`);
      const oldPages = await browser.pages();

      // Middle-click để mở tab mới, an toàn hơn
      await link.click({ button: "middle", delay: 60 }).catch(() => {});

      // Đợi tab mới
      await sleep(2500);
      const newPages = await browser.pages();
      const newTab = newPages.find((p) => !oldPages.includes(p));

      if (newTab) {
        await newTab.bringToFront();
        await simulateUser(newTab);
        await newTab.close().catch(() => {});
      } else {
        // fallback: vẫn ở trang hiện tại
        await simulateUser(page);
      }
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    // Không tìm thấy domain mục tiêu → cuộn xem vài link
    const topHrefs = await page.$$eval("a", (as) =>
      as.map((a) => a.getAttribute("href") || "")
        .filter((h) => h && !h.startsWith("/"))
        .slice(0, 10)
    );
    console.log(`[${i}] No target link. Top hrefs:\n${topHrefs.join("\n")}`);
    await simulateUser(page);
  }

  await page.close().catch(() => {});
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

    await sleep(800); // cho chắc proxy đã được patch

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({ profileId });
    browser = launched.browser;

    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);
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
  // Batch đầu
  {
    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
    await Promise.all(tasks);
  }

  // Lặp vô hạn các batch tiếp theo
  while (true) {
    await sleep(BATCH_PAUSE_MS + rand(0, 3000));
    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
    await Promise.all(tasks);
  }
}

main()
  .catch(console.error)
  .finally(gologin.exit);