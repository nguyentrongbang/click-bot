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
  console.error(
    `------------------------------------------------------------\n` +
      `[${i}] ERROR >>> ${safeMsg(err)}\n` +
      (http.statusCode || http.status ? `status=${http.statusCode || http.status}\n` : ``) +
      (http.url || http.requestUrl ? `url=${http.url || http.requestUrl}\n` : ``) +
      (parsedBody ? `body=${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}\n` : ``) +
      `------------------------------------------------------------`
  );
}

async function ensureGoogleReady(page) {
  // Thử xử lý consent nếu có
  try {
    // Nút đồng ý phổ biến: #L2AGLb
    const agree = await page.$('#L2AGLb');
    if (agree) {
      await agree.click();
      await sleep(800);
    }
  } catch {}
}

async function simulateUser(page) {
  const hasWheel = typeof page.mouse?.wheel === "function";
  const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const actions = [
    async () => {
      const x = random(100, 1000);
      const y = random(100, 700);
      await page.mouse.move(x, y, { steps: 20 });
      await sleep(random(300, 800));
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: random(200, 800) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, dy), random(200, 800));
      }
      await sleep(random(500, 1200));
    },
    async () => {
      if (hasWheel) {
        await page.mouse.wheel({ deltaY: -random(200, 600) });
      } else {
        await page.evaluate((dy) => window.scrollBy(0, -dy), random(200, 600));
      }
      await sleep(random(500, 1200));
    },
    async () => {
      const links = await page.$$("a");
      if (links.length) {
        const link = links[random(0, links.length - 1)];
        try {
          const box = await link.boundingBox();
          if (box) {
            await link.hover();
            await sleep(random(300, 800));
            if (Math.random() < 0.15) {
              await Promise.allSettled([
                link.click({ delay: 100 }),
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7000 }),
              ]);
            }
          }
        } catch (e) {
          console.warn("⚠️ simulateUser link:", safeMsg(e));
        }
      }
    },
  ];

  const rounds = random(6, 12);
  for (let i = 0; i < rounds; i++) {
    const action = actions[random(0, actions.length - 1)];
    try {
      await action();
    } catch (e) {
      console.warn("⚠️ simulateUser error:", safeMsg(e));
    }
  }
}

async function doGoogleSearch(i, browser, keyword, targetDomain) {
  const page = await browser.newPage();

  // Kiểm tra IP 2 nguồn (giúp debug proxy)
//   try {
//     await page.goto("https://api.ipify.org", { waitUntil: "domcontentloaded", timeout: 30000 });
//     const ip1 = await page.evaluate(() => document.body?.innerText || "");
//     console.log(`[${i}] Public IP (ipify): ${ip1}`);

//     await page.goto("https://ipv4.webshare.io/", { waitUntil: "domcontentloaded", timeout: 30000 });
//     const ip2 = await page.evaluate(() => document.body?.innerText || "");
//     console.log(`[${i}] Public IP (webshare): ${ip2}`);
//   } catch (e) {
//     console.warn(`[${i}] IP check warn:`, safeMsg(e));
//   }

  // Google search
  await page.goto("https://www.google.com/?hl=vi", { waitUntil: "domcontentloaded", timeout: 60000 });
  await ensureGoogleReady(page);

  await page.waitForSelector('textarea[name="q"]', { timeout: 15000 });
  await page.type('textarea[name="q"]', keyword, { delay: 50 });
  await page.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1000);

  // Lấy các link kết quả
  const links = await page.$$("a");
  console.log(`[${i}] Search: "${keyword}" -> domain contains "${targetDomain}"`);

  // Tìm link chứa domain
  let clicked = false;
  for (const link of links) {
    const href = (await link.evaluate((el) => el.getAttribute("href") || "")).toLowerCase();
    if (!href) continue;

    if (href.includes(targetDomain)) {
      console.log(`[${i}] ✅ Found: ${href}`);
      const oldPages = await browser.pages();
      await link.click({ delay: 100 });
      await sleep(2500);

      const newPages = await browser.pages();
      const newTab = newPages.find((p) => !oldPages.includes(p));
      if (newTab) {
        await newTab.bringToFront();
        await simulateUser(newTab);
        await newTab.close();
      } else {
        await simulateUser(page);
      }
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    // Không thấy domain → mô phỏng cuộn + xem vài link đầu
    const topHrefs = await page.$$eval("a", (as) =>
      as
        .map((a) => a.getAttribute("href") || "")
        .filter((h) => h && !h.startsWith("/"))
        .slice(0, 10)
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

    // Gán proxy thủ công (quy tắc GoLogin)
    await gologin.changeProfileProxy(profileId, {
      mode: PROXY_MODE,
      host: PROXY_HOST,
      port: Number(PROXY_PORT), // ÉP SỐ
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });

    // Chờ 1 nhịp để patch proxy ổn định
    await sleep(800);

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({
      profileId,
      // timeout: 45000,
    });
    browser = launched.browser;

    // Thực hiện 1 vòng tìm kiếm + giả lập người dùng
    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);

    // Nghỉ ngẫu nhiên giữa các batch (nếu muốn lặp tại đây)
    // await sleep(3000 + Math.floor(Math.random() * 4000));
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
  const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
  await Promise.all(tasks);

  // Nếu muốn chạy lặp batch vô hạn:
  while (true) {
    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
    await Promise.all(tasks);
    await sleep(3000);
  }
}

main().catch(console.error).finally(gologin.exit);