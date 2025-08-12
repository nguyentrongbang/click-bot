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

// ======= CỜ HÀNH VI (thay đổi nếu cần) =======
const SINGLE_TAB_ONLY = true;        // dọn tab rỗng + không mở tab mới
const RANDOM_LINK_CLICK = false;     // tắt click ngẫu nhiên trong simulateUser
const OPEN_RESULT_IN_NEW_TAB = false; // false = click trái trong cùng tab; true = middle-click mở tab mới
// ============================================

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
    `------------------------------------------------------------\n` +
    `[${i}] ERROR >>> ${safeMsg(err)}\n` +
    (err?.stack ? `stack=${err.stack}\n` : ``) +
    (http.statusCode || http.status ? `status=${http.statusCode || http.status}\n` : ``) +
    (http.url || http.requestUrl ? `url=${http.url || http.requestUrl}\n` : ``) +
    (parsedBody ? `body=${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}\n` : ``) +
    `------------------------------------------------------------`
  );
}

async function ensureGoogleReady(page) {
  // popup đồng ý cookie
  try {
    const agree = await page.$('#L2AGLb');
    if (agree) { await agree.click(); await sleep(800); }
  } catch {}
  // hộp chào đăng nhập (nếu có)
  try {
    await page.evaluate(() => {
      const sel = [
        '[role="dialog"] [aria-label="Close"]',
        '[jsname="adVhW"]', // nút close phổ biến
        '[data-dismiss]'
      ];
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      }
    });
  } catch {}
}

async function dismissGoogleOverlays(page) {
  try {
    // tắt banner nhỏ chào đăng nhập hoặc mini dialog
    await page.evaluate(() => {
      const closeButtons = Array.from(document.querySelectorAll('button, div[role="button"]'))
        .filter(btn => /đóng|close/i.test(btn.textContent || '') || btn.getAttribute('aria-label') === 'Close');
      closeButtons.slice(0, 2).forEach(btn => btn.click());
    });
  } catch {}
  await sleep(400);
}

async function safeHoverMaybeClick(page, handle, { clickProb = 0 } = {}) {
  try {
    const box = await handle.boundingBox();
    if (box && box.width > 1 && box.height > 1) {
      await handle.hover();
      await sleep(300 + Math.floor(Math.random() * 400));
      if (Math.random() < clickProb) {
        await Promise.allSettled([
          handle.click({ delay: 100 }),
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }),
        ]);
      }
    }
  } catch (e) {
    // phần tử có thể không còn hiện hữu sau điều hướng
  }
}

async function simulateUser(page) {
  const hasWheel = typeof page.mouse?.wheel === "function";
  const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  // Hành vi nhẹ nhàng, không click ngẫu nhiên
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
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: -random(150, 550) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, -dy), random(150, 550));
      }
      await sleep(random(400, 900));
    },
    async () => {
      if (RANDOM_LINK_CLICK) {
        const links = await page.$$("a");
        if (links.length) {
          const link = links[random(0, links.length - 1)];
          await safeHoverMaybeClick(page, link, { clickProb: 0 }); // giữ 0 để chỉ hover
        }
      }
    },
  ];

  const rounds = random(5, 9);
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
  await dismissGoogleOverlays(page);

  await page.waitForSelector('textarea[name="q"]', { timeout: 15000 });
  await page.type('textarea[name="q"]', keyword, { delay: 50 });
  await page.keyboard.press("Enter");

  // chờ kết quả
  await Promise.race([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    sleep(7000), // fallback nếu Google không điều hướng trang (SPA)
  ]);
  await sleep(800);
  await dismissGoogleOverlays(page);

  // Tìm link chứa domain
  const linkHandles = await page.$$("a");
  console.log(`[${i}] Search: "${keyword}" -> target: "${targetDomain}" (links: ${linkHandles.length})`);

  let clicked = false;
  for (const link of linkHandles) {
    let href = "";
    try {
      href = (await link.evaluate(el => el.getAttribute("href") || "")).toLowerCase();
    } catch {}
    if (!href) continue;
    if (href.includes(targetDomain)) {
      console.log(`[${i}] ✅ Found: ${href}`);

      if (OPEN_RESULT_IN_NEW_TAB || !SINGLE_TAB_ONLY) {
        // mở tab mới
        const before = await browser.pages();
        await Promise.allSettled([
          link.click({ button: "middle", delay: 80 }),
          page.waitForNetworkIdle?.({ idleTime: 800, timeout: 8000 }).catch(() => {})
        ]);
        await sleep(1500);
        const after = await browser.pages();
        const newTab = after.find(p => !before.includes(p));
        if (newTab) {
          await newTab.bringToFront();
          await simulateUser(newTab);
          if (SINGLE_TAB_ONLY) await newTab.close();
        } else {
          await simulateUser(page);
        }
      } else {
        // mở ngay trong cùng tab
        await Promise.allSettled([
          link.click({ delay: 80 }),
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
        ]);
        await dismissGoogleOverlays(page);
        await simulateUser(page);
      }

      clicked = true;
      break;
    }
  }

  if (!clicked) {
    // Không thấy domain → cuộn, hover vài link
    const topHrefs = await page.$$eval("a", (as) =>
      as.map(a => a.getAttribute("href") || "")
        .filter(h => h && !h.startsWith("/"))
        .slice(0, 8)
    );
    console.log(`[${i}] No target link. Top hrefs:\n${topHrefs.join("\n")}`);
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

    await sleep(600);

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({ profileId });
    browser = launched.browser;

    if (SINGLE_TAB_ONLY) await closeBlankTabs(browser);

    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);
    await sleep(500 + Math.floor(Math.random() * 1000)); // nghỉ nhẹ
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

  // chạy vô hạn theo batch
  while (true) {
    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
    await Promise.all(tasks);
    // nghỉ giữa các batch
    // await sleep(3000 + Math.floor(Math.random() * 4000));
  }
}

main().catch(console.error).finally(gologin.exit);