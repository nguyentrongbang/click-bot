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

const GL_API_TOKEN   = process.env.GL_API_TOKEN || "";
const PROXY_MODE     = process.env.PROXY_MODE || "http";
const PROXY_HOST     = process.env.PROXY_HOST || "";
const PROXY_PORT     = process.env.PROXY_PORT || "";
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const KEYWORD        = process.env.KEYWORD || "bài ca đi cùng năm tháng";
const TARGET_DOMAIN  = (process.env.TARGET_DOMAIN || "bcdcnt.net").toLowerCase();
const CONCURRENCY    = Number(process.argv[2] || process.env.CONCURRENCY || 3);

if (!GL_API_TOKEN)   throw new Error("Missing GL_API_TOKEN");
if (!PROXY_MODE)     throw new Error("Missing PROXY_MODE");
if (!PROXY_HOST)     throw new Error("Missing PROXY_HOST");
if (!PROXY_PORT)     throw new Error("Missing PROXY_PORT");
if (!PROXY_USERNAME) throw new Error("Missing PROXY_USERNAME");
if (!PROXY_PASSWORD) throw new Error("Missing PROXY_PASSWORD");

const gologin = GologinApi({ token: GL_API_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAV_TIMEOUT_MS = 120_000;

/* ---------- logging helpers ---------- */
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

/* ---------- Google consent / overlays ---------- */
async function clickByText(page, selector, texts = []) {
  const lc = (s) => (s || "").toLowerCase();
  const handle = await page.$$(selector);
  for (const el of handle) {
    const t = lc((await page.evaluate(e => e.innerText || e.textContent || "", el)).trim());
    if (texts.some(x => t.includes(lc(x)))) {
      await el.click().catch(()=>{});
      return true;
    }
  }
  return false;
}

async function presetGoogleConsentCookies(page) {
  const oneYear = Math.floor(Date.now()/1000) + 3600*24*365;
  await page.setCookie(
    { name: 'CONSENT', value: 'YES+cb', domain: '.google.com', expires: oneYear, path: '/' },
    { name: 'SOCS',    value: 'CAI',    domain: '.google.com', expires: oneYear, path: '/' }
  ).catch(()=>{});
}

async function dismissGoogleOverlays(page) {
  // Cookie consent
  const consentSelectors = [
    '#L2AGLb',
    'button[aria-label*="Đồng ý"]',
    'button[aria-label*="I agree"]',
    'button[aria-label*="Accept all"]',
    'button[role="button"][jsname][data-mdc-dialog-action="accept"]'
  ];
  for (const s of consentSelectors) {
    const btn = await page.$(s);
    if (btn) { await btn.click().catch(()=>{}); await page.waitForTimeout(500).catch(()=>{}); }
  }

  // “Sign in” / “No thanks”
  await clickByText(page, 'button', [
    'no thanks','not now','continue without','skip','maybe later',
    'không, cảm ơn','bỏ qua','để sau'
  ]);

  // Escape vài lần
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(150).catch(()=>{});
  await page.keyboard.press('Escape').catch(()=>{});
}

/* ---------- User simulation ---------- */
async function simulateUser(page) {
  const hasWheel = typeof page.mouse?.wheel === "function";
  const rnd = (min, max) => Math.floor(Math.random()*(max-min+1))+min;

  const actions = [
    async () => {
      const x = rnd(100, 1000), y = rnd(100, 700);
      await page.mouse.move(x, y, { steps: 20 }).catch(()=>{});
      await page.waitForTimeout(rnd(300,800)).catch(()=>{});
    },
    async () => {
      if (hasWheel) await page.mouse.wheel({ deltaY: rnd(200,800) }).catch(()=>{});
      else await page.evaluate(dy => window.scrollBy(0, dy), rnd(200,800)).catch(()=>{});
      await page.waitForTimeout(rnd(500,1200)).catch(()=>{});
    },
    async () => {
      if (hasWheel) await page.mouse.wheel({ deltaY: -rnd(200,600) }).catch(()=>{});
      else await page.evaluate(dy => window.scrollBy(0, -dy), rnd(200,600)).catch(()=>{});
      await page.waitForTimeout(rnd(500,1200)).catch(()=>{});
    },
    async () => {
      const links = await page.$$("a");
      if (links.length) {
        const link = links[rnd(0, links.length-1)];
        try {
          const box = await link.boundingBox();
          if (box) {
            await link.hover().catch(()=>{});
            await page.waitForTimeout(rnd(300,800)).catch(()=>{});
            if (Math.random() < 0.15) {
              await Promise.race([
                link.click({ delay: 100 }).catch(()=>{}),
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7_000 }).catch(()=>{})
              ]);
            }
          }
        } catch(e) {
          // mostly harmless
        }
      }
    }
  ];

  const rounds = rnd(6, 12);
  for (let i=0; i<rounds; i++) {
    const action = actions[rnd(0, actions.length-1)];
    try { await action(); } catch(e) { /* ignore */ }
  }
}

/* ---------- SERP handling ---------- */
async function extractSerpHrefs(page) {
  const hrefs = await page.$$eval("a", as =>
    as.map(a => a.getAttribute("href") || "").filter(Boolean)
  );
  // clean typical google wrappers
  return hrefs
    .map(h => {
      if (h.startsWith("/url?q=")) {
        try {
          const u = new URL("https://www.google.com" + h);
          return u.searchParams.get("q") || "";
        } catch { return ""; }
      }
      if (h.startsWith("/")) return "";
      return h;
    })
    .filter(Boolean);
}

async function doGoogleSearch(i, browser, keyword, targetDomain) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(60_000);

  // Giảm consent trước khi vào
  await presetGoogleConsentCookies(page);

  // Vào Google
  await page.goto("https://www.google.com/?hl=vi&pccc=1", {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT_MS,
  }).catch(()=>{});
  await dismissGoogleOverlays(page);

  // Search
  await page.waitForSelector('textarea[name="q"]', { timeout: 20_000 });
  await page.type('textarea[name="q"]', keyword, { delay: 60 });
  await page.keyboard.press("Enter");

  // Chờ kết quả thay vì waitForNavigation cứng
  let ok = await Promise.race([
    page.waitForFunction(() => location.pathname === '/search' || !!document.querySelector('#search'), { timeout: NAV_TIMEOUT_MS }),
    page.waitForSelector('#search', { timeout: NAV_TIMEOUT_MS })
  ]).then(()=>true).catch(()=>false);

  if (!ok) {
    // Thử lại bằng URL trực tiếp
    const q = encodeURIComponent(keyword);
    await page.goto(`https://www.google.com/search?q=${q}&hl=vi&pccc=1`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    }).catch(()=>{});
    await dismissGoogleOverlays(page);
  }
  await page.waitForTimeout(800).catch(()=>{});

  console.log(`[${i}] Search: "${keyword}" -> domain contains "${targetDomain}"`);

  // Lấy link
  let hrefs = [];
  try {
    hrefs = await extractSerpHrefs(page);
  } catch {}

  // Tìm link mục tiêu
  const target = hrefs.find(h => h.toLowerCase().includes(targetDomain));
  if (target) {
    console.log(`[${i}] ✅ Found: ${target}`);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(()=>{});
    await simulateUser(page);
  } else {
    // Không thấy → log top
    const tops = hrefs.slice(0,10);
    console.log(`[${i}] No target link. Top hrefs:\n${tops.join("\n")}`);
    await simulateUser(page);
  }

  await page.close().catch(()=>{});
}

/* ---------- per-run ---------- */
async function runOne(i) {
  let profileId = null;
  let browser = null;

  try {
    console.log(`[${i}] Creating profile...`);
    const profile = await gologin.createProfileRandomFingerprint();
    profileId = profile.id;

    // Patch proxy
    await gologin.changeProfileProxy(profileId, {
      mode: PROXY_MODE,
      host: PROXY_HOST,
      port: Number(PROXY_PORT),
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });

    await sleep(800);

    console.log(`[${i}] Launching profile ${profileId}...`);
    const launched = await gologin.launch({ profileId });
    browser = launched.browser;

    // (tuỳ chọn) check IP nhanh
    try {
      const p = await browser.newPage();
      await p.goto("https://api.ipify.org", { waitUntil: "domcontentloaded", timeout: 45_000 });
      const ip = await p.evaluate(() => document.body?.innerText || "");
      console.log(`[${i}] Public IP: ${ip}`);
      await p.close().catch(()=>{});
    } catch (e) {
      console.warn(`[${i}] IP check warn:`, safeMsg(e));
    }

    // Thực hiện tìm kiếm + mô phỏng
    await doGoogleSearch(i, browser, KEYWORD, TARGET_DOMAIN);

    // nghỉ ngẫu nhiên chút giữa các vòng (nếu bạn lặp ở đây)
    await sleep(1_000 + Math.floor(Math.random()*2_000));
  } catch (err) {
    logErr(i, err);
  } finally {
    try { if (browser) await browser.close(); } catch{}
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

/* ---------- main loop ---------- */
async function main() {
  console.log(`[INFO] Concurrency = ${CONCURRENCY}`);
  // batch đầu
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1)));

  // lặp vô hạn batch kế tiếp
  while (true) {
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1)));
    await sleep(3_000 + Math.floor(Math.random()*4_000));
  }
}

main().catch(console.error).finally(gologin.exit);