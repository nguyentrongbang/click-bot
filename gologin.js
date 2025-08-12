import { GologinApi } from "gologin";
import dotenv from "dotenv";
dotenv.config();

const GL_API_TOKEN = process.env.GL_API_TOKEN || "";
const PROXY_MODE = process.env.PROXY_MODE || "http";
const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = process.env.PROXY_PORT || "";
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const CONCURRENCY = Number(process.argv[2] || process.env.CONCURRENCY || 3);

if (!GL_API_TOKEN) throw new Error("Missing GL_API_TOKEN");
if (!PROXY_MODE) throw new Error("Missing PROXY_MODE");
if (!PROXY_HOST) throw new Error("Missing PROXY_HOST");
if (!PROXY_PORT) throw new Error("Missing PROXY_PORT");
if (!PROXY_USERNAME) throw new Error("Missing PROXY_USERNAME");
if (!PROXY_PASSWORD) throw new Error("Missing PROXY_PASSWORD");

const gologin = GologinApi({ token: GL_API_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      port: PROXY_PORT,
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });

    console.log(`[${i}] Launching profile ${profileId}...`);
    const { browser: br } = await gologin.launch({ profileId });
    browser = br;

    const page = await browser.newPage();
    await page.goto("https://api.ipify.org", { waitUntil: "domcontentloaded" });
    const ip = await page.evaluate(() => document.body?.innerText || "");
    console.log(`[${i}] Public IP: ${ip}`);

    await sleep(5000);
  } catch (err) {
    console.error(i, err);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
    if (profileId) {
      try {
        await gologin.deleteProfile(profileId);
        console.log(`[${i}] Deleted profile ${profileId}`);
      } catch (e) {
        console.warn(
          `[${i}] Cannot delete profile ${profileId}:`,
          e?.message || e
        );
      }
    }
  }
}

async function main() {
  console.log(`[INFO] Concurrency = ${CONCURRENCY}`);
  const tasks = Array.from({ length: CONCURRENCY }, (_, idx) =>
    runOne(idx + 1)
  );
  await Promise.all(tasks);
}

main().catch(console.error).finally(gologin.exit);
